const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { API_ID, API_HASH } = require('../config/setting');

/**
 * Catatan struktur this.msgs:
 *  - string  -> pesan teks biasa (akan di-send copy)
 *  - object  -> { type:'forward', chatId:<BotAPIChatId>, messageId:Number, preview:String }
 *
 * Hanya object type:'forward' yang akan di-forwardMessages.
 * Lainnya (string) akan dikirim dengan sendMessage (copy paste).
 */
class Akun {
  constructor(uid) {
    this.uid = uid;
    this.client = null;
    this.sess = '';
    this.name = '';
    this.authed = false;

    this.msgs = [];                // Lihat catatan di atas
    this.targets = new Map();      // key: String(id); value: {id,title,entity?}
    this.all = false;              // (jika nanti mau mode ambil semua dialog)
    this.delayMode = 'antar';      // 'antar' | 'semua'
    this.delay = 5;                // detik (antar)
    this.delayAllGroups = 20;      // menit (semua)
    this.startAfter = 0;           // menit tunda mulai
    this.stopAfter = 0;            // menit auto stop

    this.running = false;
    this.timer = null;
    this.idx = 0;                  // indeks target (antar)
    this.msgIdx = 0;               // indeks pesan

    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };

    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;

    this.sourcePeerCache = new Map(); // cache entity sumber forward
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

  // Konversi Bot API chat id -> internal id untuk channel/supergroup
  toInternalId(botApiChatId) {
    if (typeof botApiChatId !== 'number' && typeof botApiChatId !== 'bigint') return null;
    const n = BigInt(botApiChatId);
    if (n >= 0n) return n; // kemungkinan user / already internal
    const abs = -n;
    // supergroup / channel: -100xxxxxxxxxx
    if (String(abs).startsWith('100')) {
      // abs = 100xxxxxxxxxx -> internal = abs - 1000000000000
      return abs - 1000000000000n;
    }
    // normal group: -xxxxxxxx -> internal id pakai abs
    return abs;
  }

  async getSourcePeer(chatId) {
    // cache
    if (this.sourcePeerCache.has(chatId)) return this.sourcePeerCache.get(chatId);
    const internal = this.toInternalId(chatId);
    if (!internal) return null;
    try {
      const ent = await this.client.getEntity(internal);
      this.sourcePeerCache.set(chatId, ent);
      return ent;
    } catch (e) {
      console.warn('[SOURCE PEER FAIL]', chatId, e.message);
      return null;
    }
  }

  isGroupEntity(ent) {
    if (!ent) return false;
    return /Channel|Chat/i.test(ent.className) && !/Forbidden$/i.test(ent.className);
  }

  async forwardMessage(targetEntity, msgObj, botApi) {
    // msgObj: { type:'forward', chatId, messageId }
    const source = await this.getSourcePeer(msgObj.chatId);
    if (!source) throw new Error('Sumber belum bisa diakses (userbot belum join?).');
    await this.client.forwardMessages(
      targetEntity,
      {
        fromPeer: source,
        id: [msgObj.messageId]
      }
    );
    this.stats.sent++;
  }

  async sendText(targetEntity, text) {
    await this.client.sendMessage(targetEntity, { message: text });
    this.stats.sent++;
  }

  async broadcastAllGroups(botApi) {
    if (!this.running) return;
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
      const msg = this.msgs[this.msgIdx];

      const targetList = Array.from(this.targets.values());
      for (const t of targetList) {
        let ent = t.entity;
        if (!ent) {
          try {
            ent = await this.client.getEntity(t.id);
            t.entity = ent;
          } catch (e) {
            this.stats.failed++;
            console.error('[TARGET RESOLVE FAIL]', t.id, e.message);
            continue;
          }
        }
        if (!this.isGroupEntity(ent)) {
          this.stats.skip++;
          continue;
        }

        try {
          if (typeof msg === 'string') {
            await this.sendText(ent, msg);
          } else if (msg.type === 'forward') {
            await this.forwardMessage(ent, msg, botApi);
          } else {
            this.stats.skip++;
          }
        } catch (e) {
          this.stats.failed++;
          console.error('[SEND/FRWD FAIL]', e.message);
        }
      }

      this.msgIdx++;
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

  async broadcastBetweenGroups(botApi) {
    if (!this.running) return;
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

      const currentTarget = targets[this.idx++];
      let ent = currentTarget.entity;
      if (!ent) {
        try {
          ent = await this.client.getEntity(currentTarget.id);
          currentTarget.entity = ent;
        } catch (e) {
          this.stats.failed++;
          console.error('[TARGET RESOLVE FAIL]', currentTarget.id, e.message);
          return;
        }
      }
      if (!this.isGroupEntity(ent)) {
        this.stats.skip++;
        return;
      }

      const msg = this.msgs[this.msgIdx];
      try {
        if (typeof msg === 'string') {
          await this.sendText(ent, msg);
        } else if (msg.type === 'forward') {
          await this.forwardMessage(ent, msg, botApi);
        } else {
          this.stats.skip++;
        }
      } catch (e) {
        this.stats.failed++;
        console.error('[SEND/FRWD FAIL]', e.message);
      }
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

    for (const raw of inputs) {
      const original = raw;
      try {
        let t = raw.trim();
        if (t.startsWith('https://t.me/')) t = t.replace('https://t.me/', '');
        else if (t.startsWith('http://t.me/')) t = t.replace('http://t.me/', '');
        if (t.startsWith('@')) t = t.slice(1);

        // Invite link privat: +hash atau joinchat/hash
        if (t.startsWith('+') || t.startsWith('joinchat/')) {
          let hash = t.startsWith('+') ? t.slice(1) : t.split('joinchat/')[1];
            hash = hash.split(/[?\s]/)[0];
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
            if (!/USER_ALREADY_PARTICIPANT/i.test(e.message)) throw e;
          }
          if (chatEntity) {
            if (this.isGroupEntity(chatEntity)) {
              this.targets.set(String(chatEntity.id), { id: chatEntity.id, title: chatEntity.title, entity: chatEntity });
              success++;
            } else {
              this.targets.set(String(chatEntity.id), { id: chatEntity.id, title: `${chatEntity.title || chatEntity.id} (bukan grup)`, entity: chatEntity });
            }
          } else {
            this.targets.set(original, { id: original, title: `${original} (gagal ambil)`, entity: null });
          }
          continue;
        }

        // Username publik
        if (/^[A-Za-z0-9_]{5,}$/.test(t)) {
          const ent = await this.client.getEntity(t);
          if (this.isGroupEntity(ent)) {
            this.targets.set(String(ent.id), { id: ent.id, title: ent.title || ent.firstName || ent.username || String(ent.id), entity: ent });
            success++;
          } else {
            this.targets.set(String(ent.id), { id: ent.id, title: `${ent.username || ent.id} (bukan grup)`, entity: ent });
          }
          continue;
        }

        // ID numerik (bisa -100..., -..., atau positif)
        if (/^-?\d+$/.test(t)) {
          let internal = BigInt(t);
          if (String(t).startsWith('-100')) internal = this.toInternalId(internal);
          else if (internal < 0) internal = -internal; // normal group
          const ent = await this.client.getEntity(internal);
          if (this.isGroupEntity(ent)) {
            this.targets.set(String(ent.id), { id: ent.id, title: ent.title || ent.firstName || String(ent.id), entity: ent });
            success++;
          } else {
            this.targets.set(String(ent.id), { id: ent.id, title: `${ent.id} (bukan grup)`, entity: ent });
          }
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
