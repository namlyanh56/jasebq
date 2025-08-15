const { InlineKeyboard } = require('grammy')
const { getAcc } = require('../utils/helper')
const { mainMenu } = require('../utils/menu')

module.exports = (bot) => {
  bot.callbackQuery(['START','STOP'], async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a?.authed) return ctx.answerCallbackQuery('❌ Login dulu')
    
    if (ctx.match === 'START') {
      if (!a.msgs.length) return ctx.answerCallbackQuery('❌ Set pesan')
      if (!a.all && !a.targets.size) return ctx.answerCallbackQuery('❌ Tambah target')
      a.start()
      await ctx.answerCallbackQuery('Mulai')
    } else {
      a.stop()
      await ctx.answerCallbackQuery('Stop')
    }
    
    const menu = mainMenu(ctx.from.id)
    await ctx.editMessageText(menu.text, menu)
  })

  bot.callbackQuery('SET', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a) return ctx.answerCallbackQuery('❌ Login dulu')
    
    const kb = new InlineKeyboard()
      .text(`⏱️ Delay: ${a.delay}s`, 'SETDELAY').row()
      .text(`⏰ Start: ${a.startAfter}m`, 'SETSTART').text(`⏰ Stop: ${a.stopAfter}m`, 'SETSTOP').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText('⚙️ Setting', {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery(['SETDELAY','SETSTART','SETSTOP'], async ctx => {
    const labels = {SETDELAY: 'Delay (detik):', SETSTART: 'Start delay (menit):', SETSTOP: 'Stop timer (menit):'}
    await ctx.editMessageText(labels[ctx.match], { reply_markup: new InlineKeyboard().text('❌ Batal', 'CANCEL') })
    ctx.session = {act: ctx.match.toLowerCase(), mid: ctx.callbackQuery.message.message_id}
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('STAT', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a) return ctx.answerCallbackQuery('❌ Login dulu')
    
    const uptime = a.stats.start ? Math.floor((Date.now() - a.stats.start) / 1000) : 0
    const format = s => s > 3600 ? `${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m` : s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`
    
    const text = `📊 Status\n\n🔄 ${a.running ? 'Running' : 'Stopped'}\n⏱️ Uptime: ${format(uptime)}\n✅ Sent: ${a.stats.sent}\n❌ Failed: ${a.stats.failed}\n⏭️ Skip: ${a.stats.skip}`
    
    await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text('🔄 Refresh', 'STAT').text('🔙 Menu', 'MAIN') })
    await ctx.answerCallbackQuery()
  })
}