require('./config/setting');
const { Bot, session } = require('grammy');
const { startCommand } = require('./utils/menu');

const authHandler = require('./handler/auth');
const pesanHandler = require('./handler/pesan');
const targetHandler = require('./handler/target');
const jasebHandler = require('./handler/jaseb');
const inputHandler = require('./handler/input');

const bot = new Bot(process.env.BOT_TOKEN);
bot.use(session({ initial: () => ({}) }));

const { BOT_ID } = require('./config/setting');
console.log('BOT_ID ->', BOT_ID);

authHandler(bot);
pesanHandler(bot);
targetHandler(bot);
jasebHandler(bot);

bot.command('start', startCommand);
bot.hears('⬅️ Kembali', startCommand);

bot.on('message:text', inputHandler);

bot.catch(e => {
  console.error("ERROR UTAMA:", e);
});

bot.start();
console.log('Jaseb Dimulai');

