require('./config/setting');
const { Bot, session } = require('grammy');
const { startCommand } = require('./utils/menu');

const {
  accessGate,
  checkMembership,
  membershipCache,
  knownUsers,
  buildGateKeyboard,
  GATE_MESSAGE
} = require('./middleware/accessGate');

const authHandler = require('./handler/auth');
const pesanHandler = require('./handler/pesan');
const targetHandler = require('./handler/target');
const jasebHandler = require('./handler/jaseb');
const inputHandler = require('./handler/input');

const bot = new Bot(process.env.BOT_TOKEN);

// Session
bot.use(session({ initial: () => ({}) }));

// Gate wajib join
bot.use(accessGate());

// Handler utama
authHandler(bot);
pesanHandler(bot);
targetHandler(bot);
jasebHandler(bot);

// /start & kembali
bot.command('start', startCommand);
bot.hears('⬅️ Kembali', startCommand);

// Callback verifikasi ulang (force re-check)
bot.callbackQuery('recheck_access', async (ctx) => {
  try {
    const result = await checkMembership(ctx.api, ctx.from.id, { force: true, collect: true });
    const ok = result.ok ?? result;
    if (ok) {
      membershipCache.set(ctx.from.id, { ok: true, ts: Date.now(), details: result.details || [] });
      knownUsers.add(ctx.from.id);
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
      await ctx.answerCallbackQuery({ text: '❌ Belum terverifikasi.', show_alert: true });
      // Tampilkan kembali gate
      try {
        await ctx.editMessageText(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: buildGateKeyboard() });
      } catch {
        await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: buildGateKeyboard() });
      }
    }
  } catch (e) {
    console.error('[recheck_access] error:', e);
    await ctx.answerCallbackQuery({ text: '⚠️ Terjadi error.', show_alert: true });
  }
});

// Handler teks umum
bot.on('message:text', inputHandler);

// Re-check berkala: jika user keluar setelah lolos, kirim ajakan join lagi
const lastNotify = new Map(); // userId -> ts terakhir notifikasi
const NOTIFY_COOLDOWN = 5 * 60 * 1000; // 5 menit agar tidak spam

setInterval(async () => {
  for (const uid of knownUsers) {
    try {
      const ok = await checkMembership(bot.api, uid, { force: true });
      if (!ok) {
        const now = Date.now();
        const last = lastNotify.get(uid) || 0;
        if (now - last >= NOTIFY_COOLDOWN) {
          lastNotify.set(uid, now);
          // update cache false
          membershipCache.set(uid, { ok: false, ts: now, details: [] });
          // kirim gate
          await bot.api.sendMessage(uid, GATE_MESSAGE, {
            parse_mode: 'Markdown',
            reply_markup: buildGateKeyboard()
          });
        }
      }
    } catch (e) {
      // Abaikan error per user agar loop tetap jalan
      // console.error('[periodic_recheck] uid', uid, e.message);
    }
  }
}, 60 * 1000); // cek tiap 60 detik

bot.catch(e => {
  console.error('ERROR UTAMA:', e);
});

bot.start();
console.log('Jaseb Dimulai (Gate Join + Recheck Berkala)');
