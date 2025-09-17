const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { API_ID, API_HASH } = require('../config/setting');

class Akun {
  constructor(uid) {
    this.uid = uid;
    this.client = null;
    this.sess = '';
    this.name = '';
    this.authed = false;
    this.msgs = []; // Array of {chat_id, message_id}
    this.targets = [];
    this.all = true;
    this.delay = 5;
    this.startAfter = 0;
    this.stopAfter = 0;
    this.running = false;
    this.timer = null;
    this.idx = 0;
    this.msgIdx = 0;
    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };
    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;
  }

  async init() {
    this.client = new TelegramClient(new StringSession(this.sess), API_ID, API_HASH, {
      deviceModel: 'iPhone 16 Pro Max',
      systemVersion: 'iOS 18.0',
      appVersion: '10.0.0'
    });
  }

  async login(ctx, phone) {
    await this.init();
    if (!this.client) return ctx.reply('❌ Gagal inisialisasi Telegram Client.');
    try {
      await this.client.start({
        phoneNumber: () => phone,
        phoneCode: () => new Promise(r => {
          this.pendingCode = r;
          const { InlineKeyboard } = require('grammy');
          ctx.reply('Masukkan kode OTP:', {
            reply_markup: new InlineKeyboard().text('❌ Batal', `cancel_${this.uid}`)
          }).then(msg => this.pendingMsgId = msg.message_id);
        }),
        password: () => new Promise(r => {
          this.pendingPass = r;
          const { InlineKeyboard } = require('grammy');
          ctx.reply('Masukkan password 2FA:', {
            reply_markup: new InlineKeyboard().text('❌ Batal', `cancel_${this.uid}`)
          }).then(msg => this.pendingMsgId = msg.message_id);
        }),
        onError: e => ctx.reply(`Error: ${e.message}`)
      });
      this.sess = this.client.session.save();
      this.authed = true;
      const me = await this.client.getMe();
      this.name = me?.firstName || me?.username || 'User';
      this.cleanup(ctx);
      const { mainMenu } = require('../utils/menu');
      const menu = mainMenu(ctx);
      ctx.reply(`✅ Login berhasil!\n\n${menu.text}`, {
        reply_markup: menu.reply_markup,
        parse_mode: menu.parse_mode
      });
    } catch (e) {
      this.cleanup(ctx);
      ctx.reply(`❌ Login gagal: ${e.message}`);
    }
  }

  cleanup(ctx) {
    if (this.pendingMsgId && ctx) {
      ctx.api.deleteMessage(this.uid, this.pendingMsgId).catch(() => {});
      this.pendingMsgId = null;
    }
  }

  handleText(text, ctx) {
    if (this.pendingCode) {
      this.pendingCode(text.replace(/\s+/g, ''));
      this.pendingCode = null;
      this.cleanup(ctx);
      return true;
    }
    if (this.pendingPass) {
      this.pendingPass(text.trim());
      this.pendingPass = null;
      this.cleanup(ctx);
      return true;
    }
    return false;
  }

  cancel(ctx) {
    this.pendingCode = null;
    this.pendingPass = null;
    this.cleanup(ctx);
  }

  async addMessage(ctx) {
    try {
      const msg = ctx.message;
      if (!msg) return { success: false, message: '❌ Tidak ada pesan.' };
      // Simpan chat_id & message_id dari pesan yang dikirim/forward/reply ke bot
      this.msgs.push({
        chat_id: ctx.chat.id,
        message_id: msg.message_id
      });
      return { success: true, message: '✅ Pesan berhasil ditambahkan ke list.' };
    } catch (e) {
      return { success: false, message: `❌ Gagal menambah pesan: ${e.message}` };
    }
  }

  async listMsgPreview() {
    if (!this.msgs.length) return 'ℹ️ Tidak ada pesan yang tersimpan.';
    let result = '📝 Daftar pesan yang tersimpan:\n\n';
    for (let i = 0; i < this.msgs.length; i++) {
      const { chat_id, message_id } = this.msgs[i];
      try {
        const msgArr = await this.client.getMessages(chat_id, [message_id]);
        const msg = msgArr?.[0];
        let preview = '';
        if (msg?.message && typeof msg.message === 'string' && msg.message.length > 0) {
          preview = msg.message.slice(0, 40).replace(/\n/g, ' ');
        } else if (msg?.media) {
          preview = '[media]';
        } else {
          preview = '[pesan tidak dikenali]';
        }
        result += `  ${i + 1}. ${preview}\n`;
      } catch {
        result += `  ${i + 1}. [Tidak bisa mengambil pesan]\n`;
      }
    }
    return result;
  }

  async removeMsg(idx) {
    if (idx < 0 || idx >= this.msgs.length) return false;
    this.msgs.splice(idx, 1);
    return true;
  }

  addTargets(text) {
    let count = 0;
    text.split(/\s+/).forEach(t => {
      t = t.trim();
      if (t.startsWith('https://t.me/')) t = t.replace('https://t.me/', '@');
      if (t.startsWith('@') || /^-?\d+$/.test(t)) {
        this.targets.push({ id: t, title: t }); count++;
      }
    });
    return count;
  }

  async addAll() {
    try {
      const dialogs = await this.client.getDialogs();
      dialogs.filter(d => d.isGroup || d.isChannel).forEach(d => {
        this.targets.push({ id: d.id, title: d.title });
      });
      return this.targets.length;
    } catch { return 0; }
  }

  start(botApi) {
    if (this.running) return;
    this.running = true;
    this.stats = { sent: 0, failed: 0, skip: 0, start: Date.now() };
    this.idx = 0;
    this.msgIdx = 0;

    const broadcast = async () => {
      if (!this.running) return;
      if (this.stopAfter > 0 && Date.now() - this.stats.start >= this.stopAfter * 60000) {
        this.stop();
        if (botApi) botApi.sendMessage(this.uid, '⏹️ Auto stop');
        return;
      }
      try {
        const list = this.all ? (await this.client.getDialogs()).filter(d => d.isGroup || d.isChannel) : this.targets;
        if (!list.length || !this.msgs.length) { this.stats.skip++; return; }

        // Urutan: pesan dari list 1, 2, 3, dst secara berurutan
        if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;
        if (this.idx >= list.length) this.idx = 0;
        const target = list[this.idx++];
        const msgObj = this.msgs[this.msgIdx++];

        await this.client.forwardMessages(target.id || target, {
          messages: [msgObj.message_id],
          fromPeer: msgObj.chat_id
        });

        this.stats.sent++;
      } catch (e) {
        this.stats.failed++;
        if (botApi) botApi.sendMessage(this.uid, `⚠️ Error broadcast: ${e.message}`);
      }
    };
    const run = () => { this.timer = setInterval(broadcast, this.delay * 1000); };
    if (this.startAfter > 0) {
      if (botApi) botApi.sendMessage(this.uid, `⏰ Mulai dalam ${this.startAfter} menit`);
      setTimeout(run, this.startAfter * 60000);
    } else run();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = Akun;
