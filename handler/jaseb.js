const { InlineKeyboard } = require('grammy');
const { getAcc, getUser } = require('../utils/helper');
const { mainMenu, settingMenu, jedaMenu } = require('../utils/menu');

function formatHHMM(hhmm) {
  if (!hhmm || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(hhmm)) return '00:00';
  const [h, m] = hhmm.split(':');
  return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
}

function buildStatsText(ctx, a) {
  const u = getUser(ctx.from.id);
  const userId = ctx.from.id;
  const delayStr = a.delayMode === 'semua'
    ? `${a.delayAllGroups} Menit`
    : `${a.delay} Detik`;

  const startStr = formatHHMM(a.startTime);
  const stopStr  = formatHHMM(a.stopTime);

  const grupCount = a.targets.size;
  const msgCount  = a.msgs.length;
  const akunCount = u.accounts.size;

  const gagal = a.stats.failed || 0;
  const sukses = a.stats.sent || 0;

  return `🏷 UserID : ${userId}

⏰ *Timer*  : (Start - ${startStr}) (Stop - ${stopStr})
⏳ *Delay*  : ${delayStr}
🎄 *Grup*   : ${grupCount}
🧩 *List*   : ${msgCount}
👥 *Akun*   : ${akunCount}

📮 *Pesan Gagal*     : ${gagal}
📚 *Pesan Berhasil*  : ${sukses}

_ada pertanyaan? bisa tanya @JaeHype_`;
}

module.exports = (bot) => {
  bot.hears(['🚀 Jalankan Ubot', '⛔ Hentikan Ubot'], async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a?.authed) return ctx.reply('❌ Login dulu');
    if (ctx.message.text === '🚀 Jalankan Ubot') {
      if (!a.msgs.length) return ctx.reply('❌ Anda belum menambah pesan.');
      if (!a.all && !a.targets.size) return ctx.reply('❌ Anda belum menambah target.');
      a.start(bot.api);
      await ctx.reply('✅ Ubot dijalankan.');
    } else {
      a.stop();
      await ctx.reply('🛑 Ubot dihentikan.');
    }
    const menu = mainMenu(ctx);
    await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
  });

  bot.hears('⚙️ Settings', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    await ctx.reply(
      `Silakan pilih menu *Jeda*, *Timer Mulai*, atau *Timer Stop*.
⚠️ Tips: Pakai jeda panjang biar lebih aman dan minim risiko.

_Butuh bantuan?_ 👉 @JaeHype`,
      { parse_mode: 'Markdown', reply_markup: settingMenu(a) }
    );
  });

  bot.hears(/^(🔗 Jeda Antar Grup|⛓️ Jeda Per Semua Grup): .+/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (ctx.message.text.startsWith('🔗 Jeda Antar Grup')) {
      ctx.session = { act: 'setdelay' };
      await ctx.reply(
        `*Jeda antar grup: 1–3600 detik*\n👉 _Hindari jeda terlalu pendek agar lebih aman_.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      ctx.session = { act: 'setdelayall' };
      await ctx.reply(
        `*Masukkan jeda (menit): 1–1440*\n👉 _Rekomendasi: gunakan ≥20 menit jika broadcast seharian_.`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  bot.hears('🔄 Ganti Mode Jeda', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    await ctx.reply(
      `*Silakan pilih mode jeda* ⏳

*Jeda antar grup* = jeda antar pengiriman ke grup berikutnya (detik).
*Jeda per semua grup* = jeda antar “putaran” broadcast ke seluruh grup (menit).

⚠️ *Hindari jeda terlalu pendek; risiko FLOOD / limit.*

❓ _Bantuan: @JaeHype_`,
      { parse_mode: 'Markdown', reply_markup: jedaMenu() }
    );
  });

  bot.hears('🔗 Jeda Antar Grup', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    a.delayMode = 'antar';
    await ctx.reply('✅ Mode diubah ke Jeda Antar Grup.', { reply_markup: settingMenu(a) });
  });

  bot.hears('⛓️ Jeda Per Semua Grup', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    a.delayMode = 'semua';
    await ctx.reply('✅ Mode diubah ke Jeda Semua Grup.', { reply_markup: settingMenu(a) });
  });

  bot.hears(/🕒 Waktu Mulai:.*$/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'setstart' };
    await ctx.reply(
      'Kirim waktu mulai Userbot (contoh: 14:30) atau kirim "-" untuk hapus.',
      { parse_mode: 'Markdown' }
    );
  });

  bot.hears(/🕝 Waktu Stop:.*$/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'setstop' };
    await ctx.reply(
      'Kirim waktu stop Userbot (contoh: 18:45) atau kirim "-" untuk hapus.',
      { parse_mode: 'Markdown' }
    );
  });

  bot.hears('📈 Lihat Statistik', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    const text = buildStatsText(ctx, a);
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🔄 Refresh', 'STAT')
        .text('Tutup', 'delete_this')
    });
  });

  bot.callbackQuery('STAT', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery('❌ Login dulu', { show_alert: true });
    const text = buildStatsText(ctx, a);
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('🔄 Refresh', 'STAT')
          .text('Tutup', 'delete_this')
      });
    } catch {}
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('delete_this', async (ctx) => {
    try { await ctx.deleteMessage(); } catch {}
    await ctx.answerCallbackQuery();
  });
};
