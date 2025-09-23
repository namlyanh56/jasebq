const { InlineKeyboard } = require('grammy');
const { getAcc } = require('../utils/helper');
const { mainMenu, settingMenu, jedaMenu } = require('../utils/menu');

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
    await ctx.reply('✅ Mode diubah ke Jeda Antar Grup.', {
      reply_markup: settingMenu(a)
    });
  });

  bot.hears('⛓️ Jeda Per Semua Grup', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    a.delayMode = 'semua';
    await ctx.reply('✅ Mode diubah ke Jeda Semua Grup.', {
      reply_markup: settingMenu(a)
    });
  });

  // Waktu Mulai / Stop
  bot.hears(/🕒 Waktu Mulai:.*$/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'setstart' };
    await ctx.reply('Kirim Waktu Mulai (HH:MM 24 jam) atau "-" untuk hapus.\nContoh: 08:30');
  });

  bot.hears(/🛑 Waktu Stop:.*$/, async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'setstop' };
    await ctx.reply('Kirim Waktu Stop (HH:MM 24 jam) atau "-" untuk hapus.\nContoh: 22:15');
  });

  bot.hears('📈 Lihat Statistik', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    const uptime = a.stats.start ? Math.floor((Date.now() - a.stats.start) / 1000) : 0;
    const fmt = s => s > 3600 ? `${Math.floor(s/3600)}j ${Math.floor(s%3600/60)}m` :
      s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
    const text = `📊 Status
🔄 Status: ${a.running ? 'Berjalan' : 'Berhenti'}
🕒 Waktu Mulai: ${a.startTime || '-'}
🛑 Waktu Stop: ${a.stopTime || '-'}
⏱️ Uptime: ${a.stats.start ? fmt(uptime) : '-'}
✅ Terkirim: ${a.stats.sent}
❌ Gagal: ${a.stats.failed}
⏭️ Dilewati: ${a.stats.skip}`;
    await ctx.reply(text, { reply_markup: new InlineKeyboard().text('🔄 Refresh', 'STAT').text('Tutup', 'delete_this') });
  });

  bot.callbackQuery('STAT', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery('❌ Login dulu', { show_alert: true });
    const uptime = a.stats.start ? Math.floor((Date.now() - a.stats.start) / 1000) : 0;
    const fmt = s => s > 3600 ? `${Math.floor(s/3600)}j ${Math.floor(s%3600/60)}m` :
      s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
    const text = `📊 Status
🔄 Status: ${a.running ? 'Berjalan' : 'Berhenti'}
🕒 Waktu Mulai: ${a.startTime || '-'}
🛑 Waktu Stop: ${a.stopTime || '-'}
⏱️ Uptime: ${a.stats.start ? fmt(uptime) : '-'}
✅ Terkirim: ${a.stats.sent}
❌ Gagal: ${a.stats.failed}
⏭️ Dilewati: ${a.stats.skip}`;
    try {
      await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text('🔄 Refresh', 'STAT').text('Tutup', 'delete_this') });
    } catch {}
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('delete_this', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
  });
};
