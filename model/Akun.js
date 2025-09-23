const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { API_ID, API_HASH } = require('../config/setting');

/**
 * Struktur this.msgs:
 *  - string  -> pesan teks biasa (akan di-copy lewat sendMessage)
 *  - { type:'forward',
 *      chatId:<bot_api_chat_id>,
 *      internalId:<BigInt>,
 *      messageId:<number>,
 *      preview:<string>,
 *      status:'ready'|'unresolved' }
 *
 * HANYA record forward dengan status 'ready' yang akan di-forward.
 */
class Akun {
  constructor(uid) {
    this.uid = uid;
    this.client = null;
    this.sess = '';
    this.name = '';
    this.authed = false;

    this.msgs = [];
    this.targets = new Map();

    this.delayMode = 'antar'; // 'antar' | 'semua'
    this.delay = 5;           // detik (antar target)
    this.delayAllGroups = 20; // menit (mode semua)
    this.startAfter = 0;      // menit
    this.stopAfter = 0;       // menit

    this.running = false;
    this.timer = null;
    this.idx = 0;
    this.msgIdx = 0;

    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };

    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;

    this._legacyCleaned = false;
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

  // Konversi Bot API chat id -> internal MTProto
  toInternalId(botApiChatId) {
    try {
      const n = BigInt(botApiChatId);
      if (n >= 0n) return n;
      const abs = -n;
      if (String(abs).startsWith('100')) {
        return abs - 1000000000000n; // -100xxxxxxxxxx -> xxxxxxxxxx
      }
      return abs; // group biasa (-xxxxxxxx)
    } catch {
      return null;
    }
  }

  async addForwardMessage(botApiChatId, messageId, preview) {
    const internalId = this.toInternalId(botApiChatId);
    let status = 'unresolved';

    if (internalId) {
      try {
        await this.client.getEntity(internalId);
        status = 'ready';
      } catch (e) {
        status = 'unresolved';
        console.warn('[ADD FORWARD] belum join / tidak bisa resolve sumber:', botApiChatId, e.message);
      }
    } else {
      console.warn('[ADD FORWARD] gagal konversi chatId:', botApiChatId);
    }

    this.msgs.push({
      type: 'forward',
      chatId: botApiChatId,
      internalId,
      messageId: Number(messageId),
      preview: (preview || '').slice(0, 200),
      status
    });

    return status;
  }

  _cleanupLegacy() {
    if (this._legacyCleaned) return;
    this.msgs = this.msgs.filter(m => {
      if (typeof m === 'string') return true;
      if (!m) return false;
      if (m.type === 'forward') {
        return typeof m.messageId === 'number' && !Number.isNaN(m.messageId);
      }
      return true;
    });
    this._legacyCleaned = true;
  }

  start(botApi) {
    if (this.running) return;
    this._cleanupLegacy();
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
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isGroupEntity(ent) {
    if (!ent) return false;
    return /Channel|Chat/i.test(ent.className) && !/Forbidden$/i.test(ent.className);
  }

  async ensureTargetEntity(t) {
    if (t.entity) return t.entity;
    try {
      const ent = await this.client.getEntity(t.id);
      t.entity = ent;
      return ent;
    } catch (e) {
      console.error('[TARGET RESOLVE FAIL]', t.id, e.message);
      return null;
    }
  }

  async forwardRecorded(entTarget, rec) {
    if (rec.status !== 'ready') throw new Error('SOURCE_NOT_READY');
    if (!rec.internalId) throw new Error('INTERNAL_ID_MISSING');
    if (typeof rec.messageId !== 'number' || Number.isNaN(rec.messageId)) {
      throw new Error('MESSAGE_ID_INVALID');
    }

    let sourceEnt;
    try {
      sourceEnt = await this.client.getEntity(rec.internalId);
    } catch (e) {
      throw new Error('SOURCE_NOT_JOINED');
    }

    // PERBAIKAN PENTING: gunakan "messages" bukan "id"
    await this.client.forwardMessages(
      entTarget,
      {
        fromPeer: sourceEnt,
        messages: [rec.messageId]  // <--- FIX
      }
    );
    this.stats.sent++;
  }

  async copyText(entTarget, text) {
    await this.client.sendMessage(entTarget, { message: text });
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
      if (!this.msgs.length || !this.targets.size) { this.stats.skip++; return; }

      if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;
      const rec = this.msgs[this.msgIdx];

      for (const t of Array.from(this.targets.values())) {
        const ent = await this.ensureTargetEntity(t);
        if (!this.isGroupEntity(ent)) { this.stats.skip++; continue; }

        try {
          if (typeof rec === 'string') {
            await this.copyText(ent, rec);
          } else if (rec.type === 'forward') {
            await this.forwardRecorded(ent, rec);
          } else {
            this.stats.skip++;
          }
        } catch (e) {
          this.stats.failed++;
            console.error('[BCAST ALL FAIL]', e.message,
              'msgType:', rec.type || typeof rec,
              'status:', rec.status);
          if (/FLOOD_WAIT/i.test(e.message)) {
            const wait = +(e.message.match(/\d+/)?.[0] || 60);
            botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
            break;
          }
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
      if (!targets.length || !this.msgs.length) { this.stats.skip++; return; }

      if (this.idx >= targets.length) { this.idx = 0; this.msgIdx++; }
      if (this.msgIdx >= this.msgs.length) this.msgIdx = 0;

      const rec = this.msgs[this.msgIdx];
      const t = targets[this.idx++];
      const ent = await this.ensureTargetEntity(t);
      if (!this.isGroupEntity(ent)) { this.stats.skip++; return; }

      try {
        if (typeof rec === 'string') {
          await this.copyText(ent, rec);
        } else if (rec.type === 'forward') {
          await this.forwardRecorded(ent, rec);
        } else {
          this.stats.skip++;
        }
      } catch (e) {
        this.stats.failed++;
        console.error('[BCAST BETWEEN FAIL]', e.message,
          'msgType:', rec.type || typeof rec,
          'status:', rec.status);
        if (/FLOOD_WAIT/i.test(e.message)) {
          const wait = +(e.message.match(/\d+/)?.[0] || 60);
          botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
        }
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

        // Invite privat
        if (t.startsWith('+') || t.startsWith('joinchat/')) {
          let hash = t.startsWith('+') ? t.slice(1) : t.split('joinchat/')[1];
          hash = hash.split(/[?\s]/)[0];
          let chatEntity = null;
          try {
            const info = await this.client.invoke(new Api.messages.CheckChatInvite({ hash }));
            if (info.className === 'ChatInviteAlready') chatEntity = info.chat;
            else if (info.className === 'ChatInvite') {
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

        // Username
        if (/^[A-Za-z0-9_]{5,}$/.test(t)) {
          const ent = await this.client.getEntity(t);
          if (this.isGroupEntity(ent)) {
            this.targets.set(String(ent.id), {
              id: ent.id,
              title: ent.title || ent.firstName || ent.username || String(ent.id),
              entity: ent
            });
            success++;
          } else {
            this.targets.set(String(ent.id), { id: ent.id, title: `${ent.username || ent.id} (bukan grup)`, entity: ent });
          }
          continue;
        }

        // ID numerik
        if (/^-?\d+$/.test(t)) {
          let internal = BigInt(t);
            if (String(t).startsWith('-100')) internal = this.toInternalId(internal);
            else if (internal < 0) internal = -internal;
          const ent = await this.client.getEntity(internal);
          if (this.isGroupEntity(ent)) {
            this.targets.set(String(ent.id), {
              id: ent.id,
              title: ent.title || ent.firstName || String(ent.id),
              entity: ent
            });
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
      dialogs.filter(d => d.isGroup || d.isChannel).forEach(d => {
        this.targets.set(String(d.id), { id: d.id, title: d.title, entity: d });
      });
      return this.targets.size;
    } catch {
      return 0;
    }
  }
}

module.exports = Akun;
