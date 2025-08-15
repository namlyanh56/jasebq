const { InlineKeyboard } = require('grammy')
const { getUser, getAcc } = require('../utils/helper')
const { mainMenu } = require('../utils/menu')
const Akun = require('../model/Akun')

module.exports = (bot) => {
  bot.callbackQuery('LOGIN', async ctx => {
    const u = getUser(ctx.from.id)
    const id = Date.now().toString().slice(-6)
    const acc = new Akun(ctx.from.id)
    u.accounts.set(id, acc); u.active = id
    
    await ctx.editMessageText('📱 Nomor (+628xxx):', { reply_markup: new InlineKeyboard().text('❌ Batal', 'CANCEL') })
    ctx.session = {act: 'phone', id, mid: ctx.callbackQuery.message.message_id}
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('SWITCH', async ctx => {
    const u = getUser(ctx.from.id)
    if (!u.accounts.size) return ctx.answerCallbackQuery('❌ Belum ada akun')
    
    const kb = new InlineKeyboard()
    for (const [id, acc] of u.accounts) {
      const icon = acc.authed ? '🟢' : '🔴'
      const active = u.active === id ? ' ✅' : ''
      kb.text(`${icon} ${acc.name || id}${active}`, u.active === id ? 'NOOP' : `SW${id}`).row()
    }
    kb.text('➕ Tambah', 'LOGIN').text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText('👤 Pilih Akun:', {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery(/SW(.+)/, async ctx => {
    const u = getUser(ctx.from.id)
    u.active = ctx.match[1]
    const menu = mainMenu(ctx.from.id)
    await ctx.editMessageText(menu.text, menu)
    await ctx.answerCallbackQuery('✅ Switch')
  })

  bot.callbackQuery('CANCEL', async ctx => {
    const a = getAcc(ctx.from.id)
    if (a) a.cancel(ctx.api)
    
    if (ctx.session?.mid) {
      try { await ctx.api.deleteMessage(ctx.from.id, ctx.session.mid) } catch {}
    }
    ctx.session = null
    
    const menu = mainMenu(ctx.from.id)
    await ctx.editMessageText(menu.text, menu)
    await ctx.answerCallbackQuery('❌ Batal')
  })
}
