const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { API_ID, API_HASH } = require('../config/setting')

class Akun {
  constructor(uid) {
    this.uid = uid; this.client = null; this.sess = ''; this.name = ''; this.authed = false
    this.msgs = []; this.targets = new Map(); this.all = true; this.delay = 5; this.startAfter = 0; this.stopAfter = 0
    this.running = false; this.timer = null; this.idx = 0; this.stats = {sent:0,failed:0,skip:0,start:0}
    this.pendingCode = null; this.pendingPass = null; this.pendingMsgId = null
  }

  async init() {
    this.client = new TelegramClient(new StringSession(this.sess), API_ID, API_HASH, 
      {deviceModel: 'iPhone 16 Pro Max', systemVersion: 'iOS 18.0', appVersion: '10.0.0'})
  }

  async login(phone, bot) {
    await this.init()
    try {
      await this.client.start({
        phoneNumber: () => phone,
        phoneCode: () => new Promise(r => { 
          this.pendingCode = r
          const { InlineKeyboard } = require('grammy')
          bot.api.sendMessage(this.uid, 'Kirim OTP:', { 
            reply_markup: new InlineKeyboard().text('❌ Batal', 'CANCEL') 
          }).then(msg => this.pendingMsgId = msg.message_id)
        }),
        password: () => new Promise(r => { 
          this.pendingPass = r
          const { InlineKeyboard } = require('grammy')
          bot.api.sendMessage(this.uid, 'Password 2FA:', { 
            reply_markup: new InlineKeyboard().text('❌ Batal', 'CANCEL') 
          }).then(msg => this.pendingMsgId = msg.message_id)
        }),
        onError: e => bot.api.sendMessage(this.uid, `Error: ${e.message}`)
      })
      this.sess = this.client.session.save(); this.authed = true
      const me = await this.client.getMe(); this.name = me?.firstName || me?.username || 'User'
      this.cleanup()
      
      const { mainMenu } = require('../utils/menu')
      const menu = mainMenu(this.uid)
      bot.api.sendMessage(this.uid, `✅ Login berhasil!\n\n${menu.text}`, menu)
    } catch(e) { 
      this.cleanup()
      bot.api.sendMessage(this.uid, `❌ Login gagal: ${e.message}`) 
    }
  }

  cleanup() {
    if (this.pendingMsgId) {
      const bot = require('../utils/helper').getBot()
      bot.api.deleteMessage(this.uid, this.pendingMsgId).catch(() => {})
      this.pendingMsgId = null
    }
  }

  handleText(text) {
    if (this.pendingCode) { 
      this.pendingCode(text.replace(/\s+/g,''))
      this.pendingCode = null
      this.cleanup()
      return true 
    }
    if (this.pendingPass) { 
      this.pendingPass(text.trim())
      this.pendingPass = null
      this.cleanup()
      return true 
    }
    return false
  }

  cancel() {
    this.pendingCode = null
    this.pendingPass = null
    this.cleanup()
  }

  start() {
    if (this.running) return
    this.running = true; this.stats = {sent:0,failed:0,skip:0,start:Date.now()}
    
    const broadcast = async() => {
      if (!this.running) return
      if (this.stopAfter > 0 && Date.now() - this.stats.start >= this.stopAfter * 60000) {
        this.stop()
        const bot = require('../utils/helper').getBot()
        bot.api.sendMessage(this.uid, '⏰ Auto stop')
        return
      }

      try {
        let list = []
        if (this.all) {
          const dialogs = await this.client.getDialogs()
          list = dialogs.filter(d => d.isGroup || d.isChannel)
        } else {
          list = Array.from(this.targets.values())
        }
        
        if (!list.length || !this.msgs.length) { this.stats.skip++; return }
        if (this.idx >= list.length) this.idx = 0
        
        const target = list[this.idx++]
        const msg = this.msgs[Math.floor(Math.random() * this.msgs.length)]
        
        await this.client.sendMessage(target.id || target, {message: msg})
        this.stats.sent++
      } catch(e) {
        this.stats.failed++
        if (e.message?.includes('FLOOD_WAIT')) {
          const wait = +(e.message.match(/\d+/)?.[0] || 60)
          const bot = require('../utils/helper').getBot()
          bot.api.sendMessage(this.uid, `⚠️ Limit ${wait}s`)
        }
      }
    }

    const run = () => {
      this.timer = setInterval(broadcast, this.delay * 1000)
    }

    if (this.startAfter > 0) {
      const bot = require('../utils/helper').getBot()
      bot.api.sendMessage(this.uid, `⏳ Start dalam ${this.startAfter}m`)
      setTimeout(run, this.startAfter * 60000)
    } else run()
  }

  stop() { this.running = false; if (this.timer) clearInterval(this.timer); this.timer = null }

  addTargets(text) {
    let count = 0
    text.split(/\s+/).forEach(t => {
      t = t.trim()
      if (t.startsWith('https://t.me/')) t = t.replace('https://t.me/', '@')
      if (t.startsWith('@') || /^-?\d+$/.test(t)) {
        this.targets.set(t, {id: t, title: t}); count++
      }
    })
    return count
  }

  async addAll() {
    try {
      const dialogs = await this.client.getDialogs()
      dialogs.filter(d => d.isGroup || d.isChannel).forEach(d => 
        this.targets.set(d.id, {id: d.id, title: d.title}))
      return this.targets.size
    } catch { return 0 }
  }
}

module.exports = Akun