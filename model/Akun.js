const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { API_ID, API_HASH } = require('../config/setting');

class Akun {
  constructor(uid) {
    this.uid = uid;
    this.client = null;
    this.sess = '';
    this.name = '';
    this.authed = false;

    // this.msgs berisi campuran:
    //  - String  -> pesan biasa (akan diconvert menjadi sendMessage)
    //  - Object forward -> { src:<botApiChatId>, mid:<messageId>, text:<preview> }
    this.msgs = [];

    this.targets = new Map();
    this.all = false;

    this.delay = 5;           // detik (mode antar)
    this.delayMode = 'antar'; // 'antar' | 'semua'
    this.delayAllGroups = 20; // menit (mode semua)
    this.startAfter = 0;      // menit tunda
    this.stopAfter = 0;       // menit auto-stop

    this.running = false;
    this.timer = null;
    this.idx = 0;
    this.msgIdx = 0;

    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };

    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;

    this._sourceCache = new Map(); // cache entity sumber forward
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
    if (!this.client) return ctx.reply('❌ Gagal init client.');

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

  // Konversi Bot API chat id -> internal MTProto id
  botToInternal(botId) {
    try {
      const n = BigInt(botId);
      if (n >= 0n) return n;
      const abs = -n;
      if (String(abs).startsWith('100')) return abs - 1000000000000n; // -100xxxxxxxxxx
      return abs; // group biasa (-xxxxxxxxx)
    } catch {
      return null;
    }
  }

  async getSourceEntity(botApiChatId) {
    if (this._sourceCache.has(botApiChatId)) return this._sourceCache.get(botApiChatId);
    const internal = this.botToInternal(botApiChatId);
    if (!internal) return null;
    try {
      const ent = await this.client.getEntity(internal);
      this._sourceCache.set(botApiChatId, ent);
      return ent;
    } catch {
      return null;
    }
  }

  async forwardOrCopy(msg, targetEntity, botApi, tag) {
    if (typeof msg === 'string') {
      // Copy biasa
      try {
        await this.client.sendMessage(targetEntity, { message: msg });
        this.stats.sent++;
      } catch (e) {
        this.stats.failed++;
        console.error(`[${tag}] COPY_FAIL`, e.message);
      }
      return;
    }

    // Jika object: asumsi forward record {src, mid, text}
    if (msg && typeof msg === 'object' && typeof msg.mid === 'number' && msg.src !== undefined) {
      try {
        const srcEnt = await this.getSourceEntity(msg.src);
        if (!srcEnt) throw new Error('SOURCE_NOT_JOINED');
        await this.client.forwardMessages(
          targetEntity,
          { fromPeer: srcEnt, messages: [msg.mid] }
        );
        this.stats.sent++;
      } catch (e) {
        console.error(`[${tag}] FORWARD_FAIL ${e.message} -> fallback copy`);
        // fallback copy supaya tetap ada output
        try {
          await this.client.sendMessage(targetEntity, { message: msg.text || msg.preview || '[Pesan]' });
          this.stats.sent++;
        } catch (e2) {
          this.stats.failed++;
          console.error(`[${tag}] FALLBACK_COPY_FAIL`, e2.message);
          if (/FLOOD_WAIT/i.test(e.message) || /FLOOD_WAIT/i.test(e2.message)) {
            const wait = +(e.message.match(/\d+/)?.[0] || e2.message.match(/\d+/)?.[0] || 60);
            botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
          }
        }
      }
    } else {
      // Format legacy aneh -> treat sebagai teks
      try {
        const txt = msg?.preview || '[Pesan]';
        await this.client.sendMessage(targetEntity, { message: txt });
        this.stats.sent++;
      } catch (e) {
        this.stats.failed++;
        console.error(`[${tag}] LEGACY_COPY_FAIL`, e.message);
      }
    }
  }

  start(botApi) {
    if (this.running) return;
    if (!this.msgs.length) {
      botApi && botApi.sendMessage(this.uid, '❌ Tidak ada pesan.');
      return;
    }
    if (!this.targets.size && !this.all) {
      botApi && botApi.sendMessage(this.uid, '❌ Tidak ada target.');
      return;
    }

    this.running = true;
    this.stats = { sent: 0, failed: 0, skip: 0, start: Date.now() };
    this.idx = 0;
    this.msgIdx = 0;

    if (this.delayMode === 'semua') this.broadcastAllGroups(botApi);
    else this.broadcastBetweenGroups(botApi);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Broadcast mode "semua": satu pesan ke semua target per siklus
  broadcastAllGroups(botApi) {
    const tick = async () => {
      if (!this.running) return;
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
      const msg = this.msgs[this.msgIdx++];

      const targets = Array.from(this.targets.values());
      for (const t of targets) {
        let ent = t.entity;
        if (!ent) {
            try {
              ent = await this.client.getEntity(t.id);
              t.entity = ent;
            } catch (e) {
              this.stats.failed++;
              console.error('[ALL] TARGET_RESOLVE_FAIL', t.id, e.message);
              continue;
            }
        }
        if (!/Channel|Chat/i.test(ent.className) || /Forbidden$/i.test(ent.className)) {
          this.stats.skip++;
          continue;
        }
        await this.forwardOrCopy(msg, ent, botApi, 'ALL');
      }
    };

    const run = () => {
      this.timer = setInterval(tick, this.delayAllGroups * 60000);
      tick();
    };
    if (this.startAfter > 0) {
      botApi && botApi.sendMessage(this.uid, `⏳ Mulai dalam ${this.startAfter}m`);
      setTimeout(run, this.startAfter * 60000);
    } else run();
  }

  // Broadcast mode "antar": rotasi target satu per satu
  broadcastBetweenGroups(botApi) {
    const tick = async () => {
      if (!this.running) return;
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

      if (this.idx >= targets.length) {
        this.idx = 0;
        this.msgIdx++;
      }
      if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;

      const target = targets[this.idx++];
      const msg = this.msgs[this.msgIdx];

      let ent = target.entity;
      if (!ent) {
        try {
          ent = await this.client.getEntity(target.id);
          target.entity = ent;
        } catch (e) {
          this.stats.failed++;
          console.error('[BETWEEN] TARGET_RESOLVE_FAIL', target.id, e.message);
          return;
        }
      }
      if (!/Channel|Chat/i.test(ent.className) || /Forbidden$/i.test(ent.className)) {
        this.stats.skip++;
        return;
      }
      await this.forwardOrCopy(msg, ent, botApi, 'BETWEEN');
    };

    const run = () => {
      this.timer = setInterval(tick, this.delay * 1000);
      tick();
    };
    if (this.startAfter > 0) {
      botApi && botApi.sendMessage(this.uid, `⏳ Mulai dalam ${this.startAfter}m`);
      setTimeout(run, this.startAfter * 60000);
    } else run();
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

        // Invite link private
        if (t.startsWith('+') || t.startsWith('joinchat/')) {
          let hash = t.startsWith('+') ? t.slice(1) : t.split('joinchat/')[1];
          hash = hash.split('?')[0];

          let chatEntity = null;
          try {
            const info = await this.client.invoke(new Api.messages.CheckChatInvite({ hash }));
            if (info.className === 'ChatInviteAlready') {
              chatEntity = info.chat;
            } else if (info.className === 'ChatInvite') {
              const upd = await this.client.invoke(new Api.messages.ImportChatInvite({ hash }));
              chatEntity = upd.chats?.[0];
            }
          } catch (e) {
            if (/USER_ALREADY_PARTICIPANT/i.test(e.message)) {
              const dialogs = await this.client.getDialogs();
              chatEntity = dialogs.find(d => d?.id && d.title);
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

        // ID numerik
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

        // Format lain
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
          this.targets.set(String(d.id), { id: d.id, title: d.title, entity: d });
        });
      return this.targets.size;
    } catch {
      return 0;
    }
  }
}

module.exports = Akun;
