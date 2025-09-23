require('./config/setting');
const { Bot, session } = require('grammy');
const { startCommand } = require('./utils/menu');

const { accessGate, checkMembership, membershipCache } = require('./middleware/accessGate');

const authHandler = require('./handler/auth');
const pesanHandler = require('./handler/pesan');
const targetHandler = require('./handler/target');
const jasebHandler = require('./handler/jaseb');
const inputHandler = require('./handler/input');

const bot = new Bot(process.env.BOT_TOKEN);
bot.use(session({ initial: () => ({}) }));

// === GATE WAJIB JOIN (letakkan sebelum handler lain) ===
bot.use(accessGate());

// === Handler utama ===
authHandler(bot);
pesanHandler(bot);
targetHandler(bot);
jasebHandler(bot);

// /start & kembali
bot.command('start', startCommand);
bot.hears('⬅️ Kembali', startCommand);

// Callback re-check akses setelah user tekan "✅ Sudah Join"
bot.callbackQuery('recheck_access', async (ctx) => {
  const ok = await checkMembership(ctx.api, ctx.from.id);
  if (ok) {
    // Bersihkan cache agar fresh
    membershipCache.set(ctx.from.id, { ok: true, ts: Date.now() });
    await ctx.answerCallbackQuery({ text: '✅ Verifikasi sukses!' });

    // Tampilkan menu utama
    const { mainMenu } = require('./utils/menu');
    const menu = mainMenu(ctx);
    try {
      await ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    } catch {
      await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    }
  } else {
    await ctx.answerCallbackQuery({ text: '❌ Belum join semuanya.', show_alert: true });
  }
});

// Handler teks umum (setelah gating)
bot.on('message:text', inputHandler);

bot.catch(e => {
  console.error("ERROR UTAMA:", e);
});

bot.start();
console.log('Jaseb Dimulai (Dengan Gate Join)');
