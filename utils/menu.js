const { InlineKeyboard } = require('grammy')
const { getUser, getAcc } = require('./helper')

const mainMenu = uid => {
  const u = getUser(uid), a = getAcc(uid)
  const status = a?.authed ? (a.running ? '🟢 Running' : '⚪ Ready') : '🔴 Offline'
  
  if (!a?.authed) {
    return {
      text: `JASEB\n\n${status}\nAkun: ${u.accounts.size}`,
      reply_markup: new InlineKeyboard()
        .text('🔐 Login', 'LOGIN').row()
        .text('👤 Switch', 'SWITCH').text('❓ Help', 'HELP').row()
    }
  }

  return {
    text: `JASEB\n\n${status}\nAkun: ${a.name}\nPesan: ${a.msgs.length}\nTarget: ${a.all ? 'Auto' : a.targets.size}`,
    reply_markup: new InlineKeyboard()
      .text('▶️ Start', 'START').text('⏹️ Stop', 'STOP').row()
      .text('📝 Pesan', 'MSG').text('🎯 Target', 'TGT').row()
      .text('⚙️ Setting', 'SET').text('📊 Status', 'STAT').row()
      .text('👤 Switch', 'SWITCH').text('❓ Help', 'HELP').row()
  }
}

const startCommand = async ctx => {
  const menu = mainMenu(ctx.from.id)
  await ctx.reply(menu.text, menu)
}

const mainCommand = async ctx => {
  const menu = mainMenu(ctx.from.id)
  await ctx.editMessageText(menu.text, menu)
  await ctx.answerCallbackQuery()
}

const helpCommand = async ctx => {
  const text = `❓ JASEB Help\n\n1. Login akun Telegram\n2. Set pesan broadcast\n3. Pilih target/mode auto\n4. Start broadcast`
  
  await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text('🔙 Menu', 'MAIN') })
  await ctx.answerCallbackQuery()
}


module.exports = { mainMenu, startCommand, mainCommand, helpCommand }
