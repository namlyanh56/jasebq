require('./config/setting');
const { Bot, session } = require('grammy');
const { startCommand } = require('./utils/menu');

const {
  accessGate,
  checkMembership,
  membershipCache
} = require('./middleware/accessGate');

const authHandler = require('./handler/auth');
const pesanHandler = require('./handler/pesan');
const targetHandler = require('./handler/target');
const jasebHandler = require('./handler/jaseb');
const inputHandler = require('./handler/input');

const bot = new Bot(process.env.BOT_TOKEN);

// Session
bot.use(session({ initial: () => ({}) }));

// GATE WAJIB JOIN (HARUS sebelum handler lain)
bot.use(accessGate());

// Handler utama
authHandler(bot);
pesanHandler(bot);
targetHandler(bot);
jasebHandler(bot);

// /start & kembali
bot.command('start', startCommand);
bot.hears('⬅️ Kembali', startCommand);

/**
 * Callback verifikasi ulang akses membership
 * - Pakai force=true agar tidak pakai cache lama
 * - collect=true (kalau kamu ingin cek detail channel, tinggal modif handler ini)
 */
bot.callbackQuery('recheck_access', async (ctx) => {
  try {
    const result = await checkMembership(ctx.api, ctx.from.id, { force: true, collect: true });
    const ok = result.ok ?? result; // fallback kalau fungsi hanya return boolean
    if (ok) {
      membershipCache.set(ctx.from.id, { ok: true, ts: Date.now(), details: result.details || [] });
      await ctx.answerCallbackQuery({ text: '✅ Akses diverifikasi!' });
      const { mainMenu } = require('./utils/menu');
      const menu = mainMenu(ctx);
      try {
        await ctx.editMessageText(menu.text, {
          reply_markup: menu.reply_markup,
            parse_mode: menu.parse_mode
        });
      } catch {
        await ctx.reply(menu.text, {
          reply_markup: menu.reply_markup,
          parse_mode: menu.parse_mode
        });
      }
    } else {
      // Susun detail (jika collect=true di middleware)
      let detailLines = '';
      if (result.details) {
        detailLines = result.details
          .map(d => `• ${d.chat} → ${d.status}${d.error ? ` (err: ${d.error})` : ''}`)
          .join('\n');
      }
      await ctx.answerCallbackQuery({ text: '❌ Belum terverifikasi.', show_alert: true });
      if (detailLines) {
        await ctx.reply(
          `Masih belum terdeteksi join keduanya.\nStatus:\n${detailLines}\n\nPastikan:\n1. Bot admin penuh di kedua channel\n2. Username channel benar\n3. Kamu sudah join pakai akun ini\n4. Coba lagi dalam 10 detik`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (e) {
    console.error('[recheck_access] error:', e);
    await ctx.answerCallbackQuery({ text: '⚠️ Terjadi error.', show_alert: true });
  }
});

// Handler teks umum (setelah semua gating & specific handlers)
bot.on('message:text', inputHandler);

// Global error handler
bot.catch(e => {
  console.error('ERROR UTAMA:', e);
});

bot.start();
console.log('Jaseb Dimulai (Dengan Gate Join)');
