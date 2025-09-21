const { InlineKeyboard } = require('grammy');
const { getAcc } = require('../utils/helper');
const { mainMenu, settingMenu, jedaMenu } = require('../utils/menu');

module.exports = (bot) => {
  bot.hears(['🚀 Jalankan Ubot', '⛔ Hentikan Ubot'], async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a?.authed) return ctx.reply('❌ Login dulu');
    if (ctx.message.text === '🚀 Jalankan Ubot') {
      if (!a.msgs.length) return ctx.reply('❌ Anda belum menambah pesan apa pun.');
      if (!a.all && !a.targets.size) return ctx.reply('❌ Anda belum menambah target.');
      a.start(bot.api);
      await ctx.reply('✅ Ubot berhasil dijalankan...');
    } else {
      a.stop();
      await ctx.reply('🛑 Ubot telah dihentikan.');
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
      await ctx.reply('Kirim jeda baru (dalam detik, contoh: 5):');
    } else if (ctx.message.text.startsWith('⛓️ Jeda Per Semua Grup')) {
      ctx.session = { act: 'setdelayall' };
      await ctx.reply('Kirim jeda baru (dalam menit, minimal 20 menit direkomendasikan):');
    }
  });
  
  bot.hears('🔄 Ganti Mode Jeda', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    
    await ctx.reply('Pilih mode jeda yang ingin digunakan:', { reply_markup: jedaMenu() });
  });
  
  bot.hears('🔗 Jeda Antar Grup', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    
    a.delayMode = 'antar';
    await ctx.reply('✅ Mode jeda diubah ke *Jeda Antar Grup*\n\nPengiriman pesan akan berurutan dari satu grup ke grup lainnya. Semua grup akan menerima pesan yang sama sebelum melanjutkan ke pesan berikutnya.\n\n*Cocok untuk*: Jumlah grup banyak (>10)', { 
      parse_mode: "Markdown",
      reply_markup: settingMenu(a) 
    });
  });
  
  bot.hears('⛓️ Jeda Per Semua Grup', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    
    a.delayMode = 'semua';
    await ctx.reply('✅ Mode jeda diubah ke *Jeda Per Semua Grup*\n\nPesan akan dikirim secara bersamaan ke semua grup target dengan jeda waktu yang panjang antar pesan. Minimum jeda 20 menit direkomendasikan.\n\n*Cocok untuk*: Jumlah grup sedikit (<10)', { 
      parse_mode: "Markdown",
      reply_markup: settingMenu(a) 
    });
  });

  bot.hears(/⏰ Tunda Mulai: \d+m/, async (ctx) => {
    ctx.session = { act: 'setstart' };
    await ctx.reply('Kirim waktu tunda sebelum mulai (dalam menit, contoh: 10):');
  });
  
  bot.hears(/🛑 Stop Otomatis: \d+m/, async (ctx) => {
    ctx.session = { act: 'setstop' };
    await ctx.reply('Kirim batas waktu auto-stop (dalam menit, contoh: 60):');
  });

  bot.hears('📈 Lihat Statistik', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    const uptime = a.stats.start ? Math.floor((Date.now() - a.stats.start) / 1000) : 0;
    const format = s => s > 3600 ? `${Math.floor(s/3600)}j ${Math.floor(s%3600/60)}m` : s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
    const text = `📊 Status\n\n🔄 Status: ${a.running ? 'Berjalan' : 'Berhenti'}\n⏱️ Uptime: ${format(uptime)}\n✅ Terkirim: ${a.stats.sent}\n❌ Gagal: ${a.stats.failed}\n⏭️ Dilewati: ${a.stats.skip}`;
    await ctx.reply(text, { reply_markup: new InlineKeyboard().text('🔄 Refresh', 'STAT').text('Tutup', 'delete_this') });
  });

  bot.callbackQuery('STAT', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery('❌ Login dulu', { show_alert: true });
    const uptime = a.stats.start ? Math.floor((Date.now() - a.stats.start) / 1000) : 0;
    const format = s => s > 3600 ? `${Math.floor(s/3600)}j ${Math.floor(s%3600/60)}m` : s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
    const text = `📊 Status\n\n🔄 Status: ${a.running ? 'Berjalan' : 'Berhenti'}\n⏱️ Uptime: ${format(uptime)}\n✅ Terkirim: ${a.stats.sent}\n❌ Gagal: ${a.stats.failed}\n⏭️ Dilewati: ${a.stats.skip}`;
    try {
        await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text('🔄 Refresh', 'STAT').text('Tutup', 'delete_this') });
    } catch (e) { /* Abaikan error jika pesan tidak diubah */ }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('delete_this', async (ctx) => {
      await ctx.deleteMessage();
      await ctx.answerCallbackQuery();
  });
};
