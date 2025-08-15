const { InlineKeyboard } = require('grammy')
const { getAcc } = require('../utils/helper')

module.exports = (bot) => {
  bot.callbackQuery('MSG', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a) return ctx.answerCallbackQuery('❌ Login dulu')
    
    const kb = new InlineKeyboard()
      .text('📝 Set', 'SETMSG').text('➕ Tambah', 'ADDMSG').row()
      .text('📋 List', 'LISTMSG').text('🗑️ Hapus', 'CLRMSG').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText(`📝 Pesan (${a.msgs.length})`, {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery(['SETMSG','ADDMSG'], async ctx => {
    const text = ctx.match === 'SETMSG' ? 'Set pesan utama:' : 'Tambah pesan:'
    await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text('❌ Batal', 'CANCEL') })
    ctx.session = {act: ctx.match.toLowerCase(), mid: ctx.callbackQuery.message.message_id}
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('LISTMSG', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a.msgs.length) return ctx.answerCallbackQuery('❌ Kosong')
    
    const kb = new InlineKeyboard()
    let text = `📋 List (${a.msgs.length}):\n\n`
    a.msgs.forEach((msg, i) => {
      text += `${i+1}. ${msg.slice(0,30)}${msg.length > 30 ? '...' : ''}\n`
      kb.text(`🗑️ ${i+1}`, `RM${i}`).row()
    })
    kb.text('🔙 Pesan', 'MSG')
    
    await ctx.editMessageText(text, {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('CLRMSG', async ctx => {
    const a = getAcc(ctx.from.id)
    if (!a.msgs.length) return ctx.answerCallbackQuery('❌ Kosong')
    
    const kb = new InlineKeyboard().text('✅ Ya', 'CONFIRMMSG').text('❌ Tidak', 'MSG')
    await ctx.editMessageText(`Hapus ${a.msgs.length} pesan?`, {reply_markup: kb})
    await ctx.answerCallbackQuery()
  })

  bot.callbackQuery('CONFIRMMSG', async ctx => {
    const a = getAcc(ctx.from.id)
    a.msgs = []
    await ctx.answerCallbackQuery('✅ Hapus')
    
    const kb = new InlineKeyboard()
      .text('📝 Set', 'SETMSG').text('➕ Tambah', 'ADDMSG').row()
      .text('📋 List', 'LISTMSG').text('🗑️ Hapus', 'CLRMSG').row()
      .text('🔙 Menu', 'MAIN')
    
    await ctx.editMessageText('📝 Pesan (0)', {reply_markup: kb})
  })

  bot.callbackQuery(/RM\d+/, async ctx => {
    const a = getAcc(ctx.from.id)
    const idx = +ctx.match[0].slice(2)
    a.msgs.splice(idx, 1)
    
    if (!a.msgs.length) {
      const kb = new InlineKeyboard()
        .text('📝 Set', 'SETMSG').text('➕ Tambah', 'ADDMSG').row()
        .text('📋 List', 'LISTMSG').text('🗑️ Hapus', 'CLRMSG').row()
        .text('🔙 Menu', 'MAIN')
      
      return ctx.editMessageText('📝 Pesan (0)', {reply_markup: kb})
    }
    
    const kb = new InlineKeyboard()
    let text = `📋 List (${a.msgs.length}):\n\n`
    a.msgs.forEach((msg, i) => {
      text += `${i+1}. ${msg.slice(0,30)}${msg.length > 30 ? '...' : ''}\n`
      kb.text(`🗑️ ${i+1}`, `RM${i}`).row()
    })
    kb.text('🔙 Pesan', 'MSG')
    
    await ctx.editMessageText(text, {reply_markup: kb})
    await ctx.answerCallbackQuery('🗑️ Hapus')
  })
}