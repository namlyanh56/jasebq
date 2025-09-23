const { InlineKeyboard } = require('grammy');
const { getAcc, getUser } = require('../utils/helper');
const { mainMenu, settingMenu, jedaMenu } = require('../utils/menu');

function formatHHMM(hhmm) {
  if (!hhmm || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(hhmm)) return '00:00';
  // Normalisasi ke 2 digit
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

⏳ Delay  : ${delayStr}
⏰ Timer  : (Start - ${startStr})_(Stop - ${stopStr})
🎄 Grup   : ${grupCount}
🧩 List   : ${msgCount}
👥 Akun   : ${akunCount}

📮 Pesan Gagal     : ${gagal}
📚 Pesan Berhasil  : ${sukses}

*ada pertanyaan? bisa tanya @JaeHype*`;
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
    await ctx.reply('⚙️ Pengaturan', { reply_markup: settingMenu(a) });
  });

  bot.hears(/^(🔗 Jeda Antar Grup|⛓️ Jeda Per Semua Grup): .+/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (ctx.message.text.startsWith('🔗 Jeda Antar Grup')) {
      ctx.session = { act: 'setdelay' };
      await ctx.reply('Masukkan jeda antar grup (detik, 1-3600):');
    } else {
      ctx.session = { act: 'setdelayall' };
      await ctx.reply('Masukkan jeda semua grup (menit, 1-1440, disarankan ≥20):');
    }
  });

  bot.hears('🔄 Ganti Mode Jeda', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    await ctx.reply('Pilih mode jeda:', { reply_markup: jedaMenu() });
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

  // Waktu Mulai
  bot.hears(/🕒 Waktu Mulai:.*$/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'setstart' };
    await ctx.reply('Kirim Waktu Mulai (HH:MM) atau "-" untuk hapus.');
  });

  // Waktu Stop (label baru: 🕝)
  bot.hears(/🕝 Waktu Stop:.*$/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'setstop' };
    await ctx.reply('Kirim Waktu Stop (HH:MM) atau "-" untuk hapus.');
  });

  // Statistik – FORMAT BARU
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
