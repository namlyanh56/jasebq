const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { API_ID, API_HASH } = require('../config/setting');
const { Api } = require('telegram');

class Akun {
  constructor(uid) {
    this.uid = uid;
    this.client = null;
    this.sess = '';
    this.name = '';
    this.authed = false;
    this.msgs = [];
    this.targets = new Map();         // key: string id, value: { id, title, entity }
    this.all = false;
    this.delay = 5;
    this.startAfter = 0;
    this.stopAfter = 0;
    this.running = false;
    this.timer = null;
    this.idx = 0;
    this.msgIdx = 0;
    this.stats = { sent:0, failed:0, skip:0, start:0 };
    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;
  }

  async init() {
    this.client = new TelegramClient(
      new StringSession(this.sess),
      API_ID,
      API_HASH,
      { deviceModel: 'iPhone 16 Pro Max', systemVersion: 'iOS 18.0', appVersion: '10.0.0' }
    );
  }

  async login(ctx, phone) {
    await this.init();
    if (!this.client) {
      return ctx.reply('❌ Gagal menginisialisasi klien Telegram. Silakan coba lagi.');
    }
    try {
      await this.client.start({
        phoneNumber: () => phone,
        phoneCode: () => new Promise(r => {
          this.pendingCode = r;
          const { InlineKeyboard } = require('grammy');
          ctx.reply('Kirim OTP:', {
            reply_markup: new InlineKeyboard().text('❌ Batal', `cancel_${this.uid}`)
          }).then(msg => this.pendingMsgId = msg.message_id);
        }),
        password: () => new Promise(r => {
          this.pendingPass = r;
          const { InlineKeyboard } = require('grammy');
          ctx.reply('Password 2FA:', {
            reply_markup: new InlineKeyboard().text('❌ Batal', `cancel_${this.uid}`)
          }).then(msg => this.pendingMsgId = msg.message_id);
        }),
        onError: e => ctx.reply(`Error: ${e.message}`)
      });
      this.sess = this.client.session.save(); this.authed = true;
      const me = await this.client.getMe(); this.name = me?.firstName || me?.username || 'User';
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
      this.pendingCode(text.replace(/\s+/g,'')); this.pendingCode = null; this.cleanup(ctx); return true;
    }
    if (this.pendingPass) {
      this.pendingPass(text.trim()); this.pendingPass = null; this.cleanup(ctx); return true;
    }
    return false;
  }

  cancel(ctx) {
    this.pendingCode = null;
    this.pendingPass = null;
    this.cleanup(ctx);
  }

  start(botApi) {
    if (this.running) return;
    this.running = true;
    this.stats = { sent:0, failed:0, skip:0, start:Date.now() };

    const broadcast = async () => {
      if (!this.running) return;
      if (this.stopAfter > 0 && Date.now() - this.stats.start >= this.stopAfter * 60000) {
        this.stop();
        if (botApi) botApi.sendMessage(this.uid, '⏰ Auto stop');
        return;
      }
      try {
        const list = Array.from(this.targets.values());
        if (!list.length || !this.msgs.length) { this.stats.skip++; return; }
        if (this.idx >= list.length) this.idx = 0;
        if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;

        const target = list[this.idx++];
        const msg = this.msgs[this.msgIdx++];
        const peer = target.entity || target.id;

        await this.client.sendMessage(peer, { message: msg });
        this.stats.sent++;
      } catch (e) {
        this.stats.failed++;
        console.error('Broadcast error:', e?.message);
        if (/FLOOD_WAIT/i.test(e.message)) {
          const wait = +(e.message.match(/\d+/)?.[0] || 60);
          if (botApi) botApi.sendMessage(this.uid, `⚠️ Limit ${wait}s`);
        }
      }
    };

    const run = () => { this.timer = setInterval(broadcast, this.delay * 1000); };
    if (this.startAfter > 0) {
      if (botApi) botApi.sendMessage(this.uid, `⏳ Start dalam ${this.startAfter}m`);
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

  // ====== FUNGSI BARU UNTUK RESOLVE TARGET ======
  async addTargets(text) {
    const inputs = text.split(/\s+/).filter(Boolean);
    let success = 0;

    for (let raw of inputs) {
      const original = raw;
      try {
        // Normalisasi dasar
        let t = raw.trim();

        if (t.startsWith('https://t.me/')) t = t.replace('https://t.me/', '');
        if (t.startsWith('@')) t = t.slice(1);

        // 1. Invite link privat: +HASH atau joinchat/HASH
        if (t.startsWith('+') || t.startsWith('joinchat/')) {
            let hash = t.startsWith('+') ? t.slice(1) : t.split('joinchat/')[1];
            hash = hash.split('?')[0];

            let chatEntity = null;
            try {
              const info = await this.client.invoke(new Api.messages.CheckChatInvite({ hash }));
              if (info.className === 'ChatInviteAlready') {
                chatEntity = info.chat;
              } else if (info.className === 'ChatInvite') {
                // Belum join – join sekarang
                const upd = await this.client.invoke(new Api.messages.ImportChatInvite({ hash }));
                chatEntity = upd.chats?.[0];
              }
            } catch (e) {
              // Jika error USER_ALREADY_PARTICIPANT, coba ambil via dialogs
              if (/USER_ALREADY_PARTICIPANT/i.test(e.message)) {
                const dialogs = await this.client.getDialogs();
                chatEntity = dialogs.find(d => d?.id && d.title); // fallback (mungkin bukan persis, tapi jarang terjadi)
              } else {
                throw e;
              }
            }

            if (chatEntity) {
              const idStr = String(chatEntity.id);
              this.targets.set(idStr, {
                id: chatEntity.id,
                title: chatEntity.title || idStr,
                entity: chatEntity
              });
              success++;
            } else {
              this.targets.set(original, { id: original, title: `${original} (gagal ambil)`, entity: null });
            }
            continue;
        }

        // 2. Username publik
        if (/^[A-Za-z0-9_]{5,}$/.test(t)) {
          const ent = await this.client.getEntity(t);
          const idStr = String(ent.id);
          this.targets.set(idStr, {
            id: ent.id,
            title: ent.title || ent.firstName || ent.username || idStr,
            entity: ent
          });
          success++;
          continue;
        }

        // 3. Numeric ID (-100xxxx atau chat biasa)
        if (/^-?\d+$/.test(t)) {
          const big = BigInt(t);
          const ent = await this.client.getEntity(big);
          const idStr = String(ent.id);
            this.targets.set(idStr, {
              id: ent.id,
              title: ent.title || ent.firstName || idStr,
              entity: ent
            });
          success++;
          continue;
        }

        // 4. Format tidak dikenali
        this.targets.set(original, { id: original, title: `${original} (format tidak dikenali)`, entity: null });

      } catch (err) {
        this.targets.set(raw, { id: raw, title: `${raw} (error: ${err.message})`, entity: null });
      }
    }

    return success;
  }

  async addAll() {
    try {
      const dialogs = await this.client.getDialogs();
      dialogs
        .filter(d => d.isGroup || d.isChannel)
        .forEach(d => {
          const idStr = String(d.id);
          this.targets.set(idStr, { id: d.id, title: d.title || idStr, entity: d });
        });
      return this.targets.size;
    } catch {
      return 0;
    }
  }
}

module.exports = Akun;
