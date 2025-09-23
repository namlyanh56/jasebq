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

    // msgs: string (teks), atau objek {chatId, messageId, preview}
    this.msgs = [];

    this.targets = new Map();
    this.all = false;

    this.delayMode = 'antar';    // 'antar' | 'semua'
    this.delay = 5;              // detik (mode antar)
    this.delayAllGroups = 20;    // menit (mode semua)

    this.startAfter = 0;         // menit
    this.stopAfter = 0;          // menit auto stop

    this.running = false;
    this.timer = null;
    this.idx = 0;
    this.msgIdx = 0;

    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };

    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;

    this._cleanedLegacy = false;
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

  // ---------- LEGACY CLEANUP ----------
  _cleanupLegacyInvalidMessages() {
    if (this._cleanedLegacy) return;
    const before = this.msgs.length;
    this.msgs = this.msgs.filter(m => {
      if (typeof m === 'string') return true;
      if (!m) return false;
      if (typeof m.messageId !== 'number') return false;
      if (!m.chatId) return false;
      // Buang objek warisan dengan chatId numerik kecil (kemungkinan BOT_ID)
      if (m.chatId !== 'me' && Math.abs(Number(m.chatId)) < 100000) return false;
      return true;
    });
    const removed = before - this.msgs.length;
    if (removed) console.log(`[CLEANUP] Menghapus ${removed} pesan legacy tidak valid`);
    this._cleanedLegacy = true;
  }

  // Konversi Bot API chat id -> internal MTProto id (supergroup/channel)
  // Bot API: -100xxxxxxxxxx  => internal: xxxxxxxxxx (BigInt)
  botIdToInternal(botChatId) {
    if (typeof botChatId !== 'number' && typeof botChatId !== 'bigint') return null;
    const id = BigInt(botChatId);
    if (id >= 0) return id; // bukan channel style -100
    const abs = -id;        // 100xxxxxxxxxx
    if (abs > 1000000000000n) {
      return abs - 1000000000000n; // hapus prefix 100
    }
    return abs; // fallback
  }

  start(botApi) {
    if (this.running) return;
    this._cleanupLegacyInvalidMessages();
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

  // Migrasi string -> Saved Messages
  async ensureMsgObject(i) {
    const item = this.msgs[i];
    if (!item) return null;
    if (typeof item === 'string') {
      try {
        const sent = await this.client.sendMessage('me', { message: item });
        const sentId = Array.isArray(sent) ? sent[0].id : sent.id;
        this.msgs[i] = {
          chatId: 'me',
          messageId: sentId,
          preview: item.slice(0, 60)
        };
        return this.msgs[i];
      } catch (e) {
        console.error('[ensureMsgObject] gagal kirim ke Saved Messages:', e.message);
        return null;
      }
    }
    return item;
  }

  async ensureTargetEntity(t) {
    if (t.entity) return t.entity;
    try {
      const ent = await this.client.getEntity(t.id);
      t.entity = ent;
      return ent;
    } catch (e) {
      console.error('[ensureTargetEntity] gagal', t.id, e.message);
      return null;
    }
  }

  isGroupEntity(ent) {
    if (!ent) return false;
    return /Channel|Chat/i.test(ent.className) && !/Forbidden$/i.test(ent.className);
  }

  async forwardOne(ent, msgObj, botApi) {
    try {
      await this.client.forwardMessages(
        ent,
        {
          fromPeer: msgObj.chatId === 'me' ? 'me' : msgObj.chatId,
          id: [msgObj.messageId]
        }
      );
      this.stats.sent++;
      console.log('[FORWARD OK]', ent.id, 'msgId:', msgObj.messageId);
      return true;
    } catch (e) {
      // Coba sekali remigrasi kalau pesan di Saved Messages hilang
      if (msgObj.chatId === 'me' && /MESSAGE_ID_INVALID|Cannot forward undefined/i.test(e.message)) {
        console.warn('[REMIGRATE] Mencoba kirim ulang pesan hilang di Saved Messages...');
        try {
          // Cari sumber teks (preview mungkin terpotong) -> tidak ada backup full,
          // jadi biarkan preview saja kalau string asli sudah hilang.
          const text = msgObj.preview || '...';
          const sent = await this.client.sendMessage('me', { message: text });
          const newId = Array.isArray(sent) ? sent[0].id : sent.id;
          msgObj.messageId = newId;
          await this.client.forwardMessages(
            ent,
            { fromPeer: 'me', id: [newId] }
          );
          this.stats.sent++;
          console.log('[FORWARD OK REMIGRATE]', ent.id);
          return true;
        } catch (e2) {
          console.error('[FORWARD FAIL REMIGRATE]', e2.message);
        }
      }
      this.stats.failed++;
      console.error('[FORWARD FAIL]', ent.id, e.message);
      if (e.message?.includes('FLOOD_WAIT')) {
        const wait = +(e.message.match(/\d+/)?.[0] || 60);
        botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
      }
      return false;
    }
  }

  // Mode: satu pesan dikirim ke semua target per interval besar
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

      const msgObj = await this.ensureMsgObject(this.msgIdx);
      if (!msgObj) {
        this.stats.skip++;
        this.msgIdx++;
        return;
      }

      const list = Array.from(this.targets.values());
      for (const t of list) {
        const ent = await this.ensureTargetEntity(t);
        if (!ent) { this.stats.failed++; continue; }
        if (!this.isGroupEntity(ent)) { this.stats.skip++; continue; }
        await this.forwardOne(ent, msgObj, botApi);
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

  // Mode: rotasi target satu per satu
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

      const t = targets[this.idx++];
      const msgObj = await this.ensureMsgObject(this.msgIdx);
      if (!msgObj) { this.stats.skip++; return; }

      const ent = await this.ensureTargetEntity(t);
      if (!ent) { this.stats.failed++; return; }
      if (!this.isGroupEntity(ent)) { this.stats.skip++; return; }

      await this.forwardOne(ent, msgObj, botApi);
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

  // Tambah target (grup/channel) via teks (invite link / username / id)
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

        // Invite link
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
            if (!/USER_ALREADY_PARTICIPANT/i.test(e.message)) {
              throw e;
            }
          }
          if (chatEntity) {
            if (!this.isGroupEntity(chatEntity)) {
              this.targets.set(String(chatEntity.id), {
                id: chatEntity.id,
                title: `${chatEntity.title || chatEntity.id} (bukan grup)`,
                entity: chatEntity
              });
              continue;
            }
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
          if (!this.isGroupEntity(ent)) {
            this.targets.set(String(ent.id), {
              id: ent.id,
              title: `${ent.username || ent.id} (bukan grup)`,
              entity: ent
            });
            continue;
          }
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
          // Bisa jadi format Bot API -100xxxxxxxxxx
          let mtId;
            if (t.startsWith('-100')) {
              try {
                mtId = this.botIdToInternal(BigInt(t));
              } catch {
                mtId = BigInt(t);
              }
            } else {
              mtId = BigInt(t);
            }
          const ent = await this.client.getEntity(mtId);
          if (!this.isGroupEntity(ent)) {
            this.targets.set(String(ent.id), {
              id: ent.id,
              title: `${ent.id} (bukan grup)`,
              entity: ent
            });
            continue;
          }
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
        this.targets.set(original, { id: original, title: `${original} (error: ${err.message})`, entity: null });
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
          this.targets.set(idAsString, { id: d.id, title: d.title, entity: d });
        });
      return this.targets.size;
    } catch {
      return 0;
    }
  }
}

module.exports = Akun;
