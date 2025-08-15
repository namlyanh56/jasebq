const { getUser, getAcc } = require('../utils/helper')
const { mainMenu } = require('../utils/menu')

module.exports = async (ctx) => {
  const text = ctx.message.text.trim()
  const a = getAcc(ctx.from.id)
  
  if (a?.handleText(text, ctx.api)) return
  
  if (ctx.session?.mid) {
    try { await ctx.api.deleteMessage(ctx.from.id, ctx.session.mid) } catch {}
  }
  
  const actions = {
    phone: async () => {
      if (!/^\+\d{10,15}$/.test(text)) {
        await ctx.reply('❌ Format: +628123456789')
        return
      }
      const u = getUser(ctx.from.id)
      const acc = u.accounts.get(ctx.session.id)
      if (acc) acc.login(text, ctx.api)
    },
    
    setmsg: async () => {
      a.msgs = [text]
      const menu = mainMenu(ctx.from.id)
      await ctx.reply(`✅ Pesan diset\n\n${menu.text}`, menu)
    },
    
    addmsg: async () => {
      a.msgs.push(text)
      const menu = mainMenu(ctx.from.id)
      await ctx.reply(`✅ Pesan ditambah (${a.msgs.length})\n\n${menu.text}`, menu)
    },
    
    addtgt: async () => {
      const count = a.addTargets(text)
      const menu = mainMenu(ctx.from.id)
      if (count) {
        await ctx.reply(`✅ ${count} target ditambah\n\n${menu.text}`, menu)
      } else {
        await ctx.reply(`❌ Format salah\n\n${menu.text}`, menu)
      }
    },
    
    setdelay: async () => {
      const delay = +text
      const menu = mainMenu(ctx.from.id)
      if (delay >= 1 && delay <= 3600) {
        a.delay = delay
        await ctx.reply(`✅ Delay: ${delay}s\n\n${menu.text}`, menu)
      } else {
        await ctx.reply(`❌ 1-3600 detik\n\n${menu.text}`, menu)
      }
    },
    
    setstart: async () => {
      const minutes = +text
      const menu = mainMenu(ctx.from.id)
      if (minutes >= 0 && minutes <= 1440) {
        a.startAfter = minutes
        await ctx.reply(`✅ Start delay: ${minutes}m\n\n${menu.text}`, menu)
      } else {
        await ctx.reply(`❌ 0-1440 menit\n\n${menu.text}`, menu)
      }
    },
    
    setstop: async () => {
      const minutes = +text
      const menu = mainMenu(ctx.from.id)
      if (minutes >= 0 && minutes <= 1440) {
        a.stopAfter = minutes
        await ctx.reply(`✅ Auto stop: ${minutes}m\n\n${menu.text}`, menu)
      } else {
        await ctx.reply(`❌ 0-1440 menit\n\n${menu.text}`, menu)
      }
    }
  }
  
  if (ctx.session?.act && actions[ctx.session.act]) {
    await actions[ctx.session.act]()
    ctx.session = null
  }
}
