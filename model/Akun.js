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

    // msgs: bisa string (legacy) atau objek {chatId, messageId, preview}
    this.msgs = [];
    this.targets = new Map();
    this.all = false;

    this.delay = 5;          // detik (mode antar)
    this.delayAllGroups = 20; // menit (mode semua)
    this.delayMode = 'antar'; // 'antar' | 'semua'

    this.startAfter = 0; // menit
    this.stopAfter = 0;  // menit (auto stop)

    this.running = false;
    this.timer = null;
    this.idx = 0;     // indeks target (mode antar)
    this.msgIdx = 0;  // indeks pesan

    this.stats = { sent: 0, failed: 0, skip: 0, start: 0 };

    this.pendingCode = null;
    this.pendingPass = null;
    this.pendingMsgId = null;
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

  // Migrasi pesan lama (string) -> Saved Messages (chatId 'me')
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
        console.error('[ensureMsgObject] gagal migrasi:', e.message);
        return null;
      }
    }
    return item;
  }

  // Mode: satu pesan ke semua target per interval besar (delayAllGroups menit)
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

      const list = Array.from(this.targets.values());

      for (const target of list) {
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
          console.error('[FORWARD FAIL][AllGroups]', e.message);
          if (e.message?.includes('FLOOD_WAIT')) {
            const wait = +(e.message.match(/\d+/)?.[0] || 60);
            botApi && botApi.sendMessage(this.uid, `⚠️ FLOOD_WAIT ${wait}s`);
            break;
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

  // Mode: bergilir antar target dengan jeda detik
  async broadcastBetweenGroups(botApi) {
    if (!this.running) return;

    const tick = async () => {
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
        console.error('[FORWARD FAIL][BetweenGroups]', e.message);
        if (e.message?.includes('FLOOD_WAIT')) {
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
      botApi && botApi.sendMessage(this.uid, `⏳ Start dalam ${this.startAfter}m`);
      setTimeout(run, this.startAfter * 60000);
    } else {
      run();
    }
  }

  // Menambahkan target (username / id / invite link)
  async addTargets(text) {
    const inputs = text.split(/\s+/).filter(Boolean);
    let success = 0;

    for (let raw of inputs) {
      const original = raw;
      try {
        let t = raw.trim();

        if (t.startsWith('https://t.me/')) t = t.replace('https://t.me/', '');
        else if (t.startsWith('http://t.me/')) t = t.replace('http://t.me/', '');
        if (t.startsWith('@')) t = t.slice(1);

        // Invite link privat
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
            if (/USER_ALREADY_PARTICIPANT/i.test(e.message)) {
              // Optional: bisa scan dialogs, tapi dilewatkan
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
          this.targets.set(idAsString, { id: d.id, title: d.title });
        });
      return this.targets.size;
    } catch {
      return 0;
    }
  }
}

module.exports = Akun;
