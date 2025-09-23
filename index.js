const { accessGate, checkMembership, debugMembership, membershipCache } = require('./middleware/accessGate');

// ...
bot.callbackQuery('recheck_access', async (ctx) => {
  const { ok, details } = await checkMembership(ctx.api, ctx.from.id, { force: true, collect: true });
  if (ok) {
    membershipCache.set(ctx.from.id, { ok: true, ts: Date.now(), details });
    await ctx.answerCallbackQuery({ text: '✅ Akses diverifikasi!' });
    const { mainMenu } = require('./utils/menu');
    const menu = mainMenu(ctx);
    try {
      await ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    } catch {
      await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    }
  } else {
    // Susun detail untuk debug cepat
    const lines = details.map(d => `• ${d.chat} -> ${d.status}${d.error ? ' (' + d.error + ')' : ''}`);
    await ctx.answerCallbackQuery({ text: '❌ Belum terdeteksi. Lihat pesan.', show_alert: true });
    await ctx.reply(
      `Masih belum terverifikasi.\nStatus:\n${lines.join('\n')}\n\nJika sudah join tapi masih gagal:\n1. Bot harus admin channel\n2. Pastikan ejaan username benar\n3. Coba lagi 30 detik kemudian`,
      { parse_mode: 'Markdown' }
    );
  }
});
