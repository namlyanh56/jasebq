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

    // this.msgs dapat berisi:
    //  - legacy string (format lama)
    //  - objek { chatId, messageId, preview }
    this.msgs = [];

    this.targets = new Map();
    this.all = false;
    this.delay = 5;
    this.startAfter = 0;
    this.stopAfter = 0;

    this.running = false;
    this.timer = null;
    this.idx = 0;     // indeks target saat mode antar
    this.msgIdx = 0;  // indeks pesan aktif

    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };

    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;

    // Mode jeda
    this.delayMode = 'antar';   // 'antar' atau 'semua'
    this.delayAllGroups = 20;   // menit (mode 'semua')
  }

  async init() {
    this.client = new TelegramClient(
      new StringSession(this.sess),
      API_ID,
      API_HASH,
      {
        deviceModel: 'iPhone 16 Pro Max',
        systemVersion: 'iOS 18.0',
        appVersion: '10.0.0'
      }
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

  start(botApi) {
    if (this.running) return;
    this.running = true;
    this.stats = { sent: 0, failed: 0, skip: 0, start: Date.now() };
    this.idx = 0;
    this.msgIdx = 0;

    if (this.delayMode === 'semua') {
      this.broadcastAllGroups(botApi);
    } else {
      this.broadcastBetweenGroups(botApi);
    }
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // --- Migrasi lazy pesan lama (string) menjadi objek forwardable ---
  async ensureMsgObject(i) {
    const item = this.msgs[i];
    if (!item) return null;
    if (typeof item === 'string') {
      try {
        // Kirim ke Saved Messages agar punya sumber untuk forward
        const sent = await this.client.sendMessage('me', { message: item });
        const sentId = Array.isArray(sent) ? sent[0].id : sent.id;
        this.msgs[i] = {
          chatId: 'me',
          messageId: sentId,
          preview: item.slice(0, 60)
        };
        return this.msgs[i];
      } catch {
        return null;
      }
    }
    return item; // sudah objek
  }

  // Mode: satu pesan -> ke SEMUA grup setiap interval besar
  async broadcastAllGroups(botApi) {
    if (!this.running) return;

    const sendAllMessages = async () => {
      if (!this.running) return;

      // Auto stop
      if (this.stopAfter > 0 && Date.now() - this.stats.start >= this.stopAfter * 60000) {
        this.stop();
        botApi && botApi.sendMessage(this.uid, '⏰ Auto stop');
        return;
      }

      if (!this.msgs.length || !this.targets.size) {
        this.stats.skip++;
        return;
      }

      if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;

      const msgObj = await this.ensureMsgObject(this.msgIdx);
      if (!msgObj) {
        this.stats.skip++;
        this.msgIdx++;
        return;
      }

      const targetList = Array.from(this.targets.values());

      for (const target of targetList) {
        try {
          await this.client.forwardMessages(
            target.id || target,
            {
              fromPeer: msgObj.chatId === 'me' ? 'me' : msgObj.chatId,
              id: [msgObj.messageId]
            }
          );
          this.stats.sent++;
        } catch (e) {
          this.stats.failed++;
          if (e.message?.includes('FLOOD_WAIT')) {
            const wait = +(e.message.match(/\d+/)?.[0] || 60);
            botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
            break; // hentikan batch saat kena flood
          }
        }
      }

      this.msgIdx++;
    };

    const run = () => {
      this.timer = setInterval(sendAllMessages, this.delayAllGroups * 60000);
      sendAllMessages();
    };

    if (this.startAfter > 0) {
      botApi && botApi.sendMessage(this.uid, `⏳ Start dalam ${this.startAfter}m`);
      setTimeout(run, this.startAfter * 60000);
    } else {
      run();
    }
  }

  // Mode: berurutan antar target dengan jeda detik (rotasi pesan)
  async broadcastBetweenGroups(botApi) {
    if (!this.running) return;

    const loop = async () => {
      if (!this.running) return;

      // Auto stop
      if (this.stopAfter > 0 && Date.now() - this.stats.start >= this.stopAfter * 60000) {
        this.stop();
        botApi && botApi.sendMessage(this.uid, '⏰ Auto stop');
        return;
      }

      const targets = Array.from(this.targets.values());
      if (!targets.length || !this.msgs.length) {
        this.stats.skip++;
        return;
      }

      // Jika semua target sudah dikirimi untuk pesan aktif
      if (this.idx >= targets.length) {
        this.idx = 0;
        this.msgIdx++;
      }
      if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;

      const target = targets[this.idx++];
      const msgObj = await this.ensureMsgObject(this.msgIdx);
      if (!msgObj) {
        this.stats.skip++;
        return;
      }

      try {
        await this.client.forwardMessages(
          target.id || target,
          {
            fromPeer: msgObj.chatId === 'me' ? 'me' : msgObj.chatId,
            id: [msgObj.messageId]
          }
        );
        this.stats.sent++;
      } catch (e) {
        this.stats.failed++;
        if (e.message?.includes('FLOOD_WAIT')) {
          const wait = +(e.message.match(/\d+/)?.[0] || 60);
          botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
        }
      }
    };

    const run = () => {
      this.timer = setInterval(loop, this.delay * 1000);
      loop();
    };

    if (this.startAfter > 0) {
      botApi && botApi.sendMessage(this.uid, `⏳ Start dalam ${this.startAfter}m`);
      setTimeout(run, this.startAfter * 60000);
    } else {
      run();
    }
  }

  async addTargets(text) {
    const inputs = text.split(/\s+/).filter(Boolean);
    let success = 0;

    for (let raw of inputs) {
      const original = raw;
      try {
        let t = raw.trim();

        if (t.startsWith('https://t.me/')) t = t.replace('https://t.me/', '');
        if (t.startsWith('@')) t = t.slice(1);

        // Username publik
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

        // Numeric ID
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

        // Format tidak dikenali
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
          const idAsString = String(d.id);
          this.targets.set(idAsString, { id: d.id, title: d.title });
        });
      return this.targets.size;
    } catch {
      return 0;
    }
  }
}

module.exports = Akun;
