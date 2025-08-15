require('./config/setting')
const { Bot, session } = require('grammy')
const authHandler = require('./handler/auth')
const pesanHandler = require('./handler/pesan')
const targetHandler = require('./handler/target')
const jasebHandler = require('./handler/jaseb')

const bot = new Bot(process.env.BOT_TOKEN)
bot.use(session({ initial: () => ({}) }))

authHandler(bot)
pesanHandler(bot)
targetHandler(bot)
jasebHandler(bot)

bot.command('start', require('./utils/menu').startCommand)
bot.callbackQuery('MAIN', require('./utils/menu').mainCommand)
bot.callbackQuery('HELP', require('./utils/menu').helpCommand)
bot.callbackQuery('NOOP', async ctx => ctx.answerCallbackQuery())

bot.on('message:text', require('./handler/input'))

bot.catch(e => { if (!e.message?.includes('message is not modified')) console.error(e) })
bot.start()
console.log('Jaseb Dimulai')