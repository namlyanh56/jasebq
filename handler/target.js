const { InlineKeyboard } = require('grammy')
const { getAcc } = require('../utils/helper')

module.exports = (bot) => {
  bot.callbackQuery('TGT', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a?.authed) return ctx.answerCallbackQuery('❌ Login dulu')
    
    const kb = new InlineKeyboard()
      .text('➕ Tambah', 'ADDTGT').text('🔄 Semua', 'ALLTGT').row()
      .text('📋 List', 'LISTTGT').text('🗑️ Hapus', 'CLRTGT').row()
      .text(`Mode: ${a.all ? 'Auto' : 'Manual'}`, 'TOGGLEALL').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText(`🎯 Target: ${a.all ? 'Auto' : a.targets.size}`, {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('ADDTGT', async ctx => {
    await ctx.editMessageText('Target:\n@username\nhttps://t.me/xxx\n-1001234567890', { reply_markup: new InlineKeyboard().text('❌ Batal', 'CANCEL') })
    ctx.session = {act: 'addtgt', mid: ctx.callbackQuery.message.message_id}
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('ALLTGT', async ctx => {
    const a = getAcc(ctx.from.id)
    try {
      const count = await a.addAll()
      await ctx.answerCallbackQuery(`✅ ${count} target`)
    } catch {
      await ctx.answerCallbackQuery('❌ Error')
    }
    
    const kb = new InlineKeyboard()
      .text('➕ Tambah', 'ADDTGT').text('🔄 Semua', 'ALLTGT').row()
      .text('📋 List', 'LISTTGT').text('🗑️ Hapus', 'CLRTGT').row()
      .text(`Mode: ${a.all ? 'Auto' : 'Manual'}`, 'TOGGLEALL').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText(`🎯 Target: ${a.all ? 'Auto' : a.targets.size}`, {reply_markup: kb})
  })

  bot.callbackQuery('LISTTGT', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a.targets.size) return ctx.answerCallbackQuery('❌ Kosong')
    
    const kb = new InlineKeyboard()
    let text = `📋 Target (${a.targets.size}):\n\n`
    let i = 1
    for (const [id, target] of a.targets) {
      text += `${i}. ${target.title}\n`
      kb.text(`🗑️ ${i}`, `RMTGT${id}`).row()
      i++
      if (i > 10) break
    }
    kb.text('🔙 Target', 'TGT')
    
    await ctx.editMessageText(text, {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('CLRTGT', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a.targets.size) return ctx.answerCallbackQuery('❌ Kosong')
    
    const kb = new InlineKeyboard().text('✅ Ya', 'CONFIRMTGT').text('❌ Tidak', 'TGT')
    await ctx.editMessageText(`Hapus ${a.targets.size} target?`, {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('CONFIRMTGT', async ctx => {
    const a = getAcc(ctx.from.id)
    a.targets.clear()
    await ctx.answerCallbackQuery('✅ Hapus')
    
    const kb = new InlineKeyboard()
      .text('➕ Tambah', 'ADDTGT').text('🔄 Semua', 'ALLTGT').row()
      .text('📋 List', 'LISTTGT').text('🗑️ Hapus', 'CLRTGT').row()
      .text(`Mode: ${a.all ? 'Auto' : 'Manual'}`, 'TOGGLEALL').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText(`🎯 Target: ${a.all ? 'Auto' : 0}`, {reply_markup: kb})
  })

  bot.callbackQuery('TOGGLEALL', async ctx => {
    const a = getAcc(ctx.from.id)
    a.all = !a.all
    
    const kb = new InlineKeyboard()
      .text('➕ Tambah', 'ADDTGT').text('🔄 Semua', 'ALLTGT').row()
      .text('📋 List', 'LISTTGT').text('🗑️ Hapus', 'CLRTGT').row()
      .text(`Mode: ${a.all ? 'Auto' : 'Manual'}`, 'TOGGLEALL').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText(`🎯 Target: ${a.all ? 'Auto' : a.targets.size}`, {reply_markup: kb})
    await ctx.answerCallbackQuery(`✅ ${a.all ? 'Auto' : 'Manual'}`)
  })

  bot.callbackQuery(/RMTGT(.+)/, async ctx => {
    const a = getAcc(ctx.from.id)
    const targetId = ctx.match[1]
    a.targets.delete(targetId)
    
    if (!a.targets.size) {
      const kb = new InlineKeyboard()
        .text('➕ Tambah', 'ADDTGT').text('🔄 Semua', 'ALLTGT').row()
        .text('📋 List', 'LISTTGT').text('🗑️ Hapus', 'CLRTGT').row()
        .text(`Mode: ${a.all ? 'Auto' : 'Manual'}`, 'TOGGLEALL').row()
        .text('🔙 Menu', 'MAIN')
      
      return ctx.editMessageText(`🎯 Target: ${a.all ? 'Auto' : 0}`, {reply_markup: kb})
    }
    
    const kb = new InlineKeyboard()
    let text = `📋 Target (${a.targets.size}):\n\n`
    let i = 1
    for (const [id, target] of a.targets) {
      text += `${i}. ${target.title}\n`
      kb.text(`🗑️ ${i}`, `RMTGT${id}`).row()
      i++
      if (i > 10) break
    }
    kb.text('🔙 Target', 'TGT')
    
    await ctx.editMessageText(text, {reply_markup: kb})
    await ctx.answerCallbackQuery('🗑️ Hapus')
  })
}