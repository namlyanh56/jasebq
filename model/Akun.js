const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { API_ID, API_HASH } = require('../config/setting')
const { Api } = require('telegram');

class Akun {
  constructor(uid) {
    this.uid = uid; this.client = null; this.sess = ''; this.name = ''; this.authed = false
    this.msgs = []; this.targets = new Map(); this.all = false; this.delay = 5; this.startAfter = 0; this.stopAfter = 0
    this.running = false; this.timer = null; this.idx = 0; this.msgIdx = 0; // DITAMBAHKAN
    this.stats = {sent:0,failed:0,skip:0,start:0}
    this.pendingCode = null; this.pendingPass = null; this.pendingMsgId = null
  }

  async init() {
    this.client = new TelegramClient(new StringSession(this.sess), API_ID, API_HASH, 
      {deviceModel: 'iPhone 16 Pro Max', systemVersion: 'iOS 18.0', appVersion: '10.0.0'})
  }

  async login(ctx, phone) {
    await this.init()
    if (!this.client) {
        return ctx.reply('❌ Gagal menginisialisasi klien Telegram. Silakan coba lagi.');
    }
    try {
      await this.client.start({
        phoneNumber: () => phone,
        phoneCode: () => new Promise(r => { 
          this.pendingCode = r
          const { InlineKeyboard } = require('grammy')
          ctx.reply('Kirim OTP:', { 
            reply_markup: new InlineKeyboard().text('❌ Batal', `cancel_${this.uid}`) 
          }).then(msg => this.pendingMsgId = msg.message_id)
        }),
        password: () => new Promise(r => { 
          this.pendingPass = r
          const { InlineKeyboard } = require('grammy')
          ctx.reply('Password 2FA:', { 
            reply_markup: new InlineKeyboard().text('❌ Batal', `cancel_${this.uid}`) 
          }).then(msg => this.pendingMsgId = msg.message_id)
        }),
        onError: e => ctx.reply(`Error: ${e.message}`)
      })
      this.sess = this.client.session.save(); this.authed = true
      const me = await this.client.getMe(); this.name = me?.firstName || me?.username || 'User'
      this.cleanup(ctx)
      
      const { mainMenu } = require('../utils/menu')
      const menu = mainMenu(ctx)
      ctx.reply(`✅ Login berhasil!\n\n${menu.text}`, { 
          reply_markup: menu.reply_markup,
          parse_mode: menu.parse_mode
      })
    } catch(e) { 
      this.cleanup(ctx)
      ctx.reply(`❌ Login gagal: ${e.message}`) 
    }
  }

  cleanup(ctx) {
    if (this.pendingMsgId && ctx) {
      ctx.api.deleteMessage(this.uid, this.pendingMsgId).catch(() => {})
      this.pendingMsgId = null
    }
  }

  handleText(text, ctx) {
    if (this.pendingCode) { 
      this.pendingCode(text.replace(/\s+/g,''))
      this.pendingCode = null
      this.cleanup(ctx)
      return true 
    }
    if (this.pendingPass) { 
      this.pendingPass(text.trim())
      this.pendingPass = null
      this.cleanup(ctx)
      return true 
    }
    return false
  }

  cancel(ctx) {
    this.pendingCode = null
    this.pendingPass = null
    this.cleanup(ctx)
  }

  start(botApi) {
    if (this.running) return
    this.running = true; this.stats = {sent:0,failed:0,skip:0,start:Date.now()}
    
    const broadcast = async() => {
      if (!this.running) return
      if (this.stopAfter > 0 && Date.now() - this.stats.start >= this.stopAfter * 60000) {
        this.stop()
        if (botApi) botApi.sendMessage(this.uid, '⏰ Auto stop')
        return
      }
      try {
        let list = Array.from(this.targets.values())
        if (!list.length || !this.msgs.length) { this.stats.skip++; return }
        if (this.idx >= list.length) this.idx = 0
        if (this.msgIdx >= this.msgs.length) this.msgIdx = 0 // DITAMBAHKAN
        const target = list[this.idx++]
        const msg = this.msgs[this.msgIdx++] // DIUBAH
        await this.client.sendMessage(target.id || target, {message: msg})
        this.stats.sent++
      } catch(e) {
        this.stats.failed++
        if (e.message?.includes('FLOOD_WAIT')) {
          const wait = +(e.message.match(/\d+/)?.[0] || 60)
          if (botApi) botApi.sendMessage(this.uid, `⚠️ Limit ${wait}s`)
        }
      }
    }
    const run = () => { this.timer = setInterval(broadcast, this.delay * 1000) }
    if (this.startAfter > 0) {
      if (botApi) botApi.sendMessage(this.uid, `⏳ Start dalam ${this.startAfter}m`)
      setTimeout(run, this.startAfter * 60000)
    } else run()
  }

  stop() { 
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async addTargets(text) {
  let count = 0;
  const targetsToAdd = text.split(/\s+/);

  for (let t of targetsToAdd) {
    t = t.trim();
    let idOrLink = t;
    let title = t;
    let groupInfo = null;

    // Handle link privat (invite)
    if (t.startsWith('https://t.me/+')) {
      try {
        groupInfo = await this.client.invoke(
          new Api.channels.JoinChannel({ channel: t })
        );
        // Ambil channel info setelah join
        const dialog = await this.client.getEntity(t);
        idOrLink = dialog.id;
        title = dialog.title || t;
      } catch (e) {
        // Jika gagal join, tetap tambahkan sebagai link tapi beri info gagal join
        title = `${t} (Gagal join: ${e.message})`;
      }
    }
    // Handle username
    else if (t.startsWith('https://t.me/')) {
      try {
        const username = t.replace('https://t.me/', '').replace('@', '');
        const dialog = await this.client.getEntity(username);
        idOrLink = dialog.id;
        title = dialog.title || dialog.username || t;
      } catch (e) {
        title = `${t} (Tidak ditemukan: ${e.message})`;
      }
    }
    // Handle @username dan ID
    else if (t.startsWith('@')) {
      try {
        const username = t.replace('@', '');
        const dialog = await this.client.getEntity(username);
        idOrLink = dialog.id;
        title = dialog.title || dialog.username || t;
      } catch (e) {
        title = `${t} (Tidak ditemukan: ${e.message})`;
      }
    }
    else if (/^-?\d+$/.test(t)) {
      try {
        const dialog = await this.client.getEntity(parseInt(t));
        idOrLink = dialog.id;
        title = dialog.title || t;
      } catch (e) {
        title = `${t} (Tidak ditemukan: ${e.message})`;
      }
    }

    this.targets.set(String(idOrLink), { id: idOrLink, title });
    count++;
  }
  return count;
}

  async addAll() {
    try {
      const dialogs = await this.client.getDialogs()
      dialogs.filter(d => d.isGroup || d.isChannel).forEach(d => {
        const idAsString = String(d.id);
        this.targets.set(idAsString, {id: d.id, title: d.title});
      })
      return this.targets.size
    } catch { return 0 }
  }
}

module.exports = Akun


