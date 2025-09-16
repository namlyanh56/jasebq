const { InlineKeyboard } = require('grammy');
const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, switchMenu, helpCommand } = require('../utils/menu');
const Akun = require('../model/Akun');

module.exports = (bot) => {
  const handleLogin = async (ctx) => {
    const u = getUser(ctx.from.id);
    const id = Date.now().toString().slice(-6);
    const acc = new Akun(ctx.from.id);
    u.accounts.set(id, acc);
    ctx.session = { act: 'phone', id };
    await ctx.reply('📱 Kirim Nomor Telepon Anda (format: +628xxx):');
  };

  bot.hears('🔐 Login', handleLogin);
  bot.hears('➕ Tambah Sesi Baru', handleLogin);

  bot.hears('🔄 Ganti Sesi', async (ctx) => {
    const u = getUser(ctx.from.id);
    if (!u.accounts.size) return ctx.reply('❌ Belum ada akun yang login.');
    await ctx.reply('👤 Silakan pilih akun yang ingin diaktifkan:', { reply_markup: switchMenu(u) });
  });

  bot.hears('💡 Bantuan', helpCommand);

  bot.hears(/^(🟢|🔴) Aktifkan: (.+?)( ✅)?$/, async (ctx) => {
    const accountIdentifier = ctx.match[2];
    const u = getUser(ctx.from.id);
    for (const [id, acc] of u.accounts) {
        if ((acc.name || id) === accountIdentifier) {
            u.active = id;
            await ctx.reply(`✅ Sesi "${accountIdentifier}" telah diaktifkan.`);
            const menu = mainMenu(ctx);
            return await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
        }
    }
    await ctx.reply('❌ Sesi tidak ditemukan.');
  });
  
  bot.callbackQuery(/cancel_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const u = getUser(userId);
    const targetSessionId = Object.keys(u.accounts).find(key => u.accounts[key].uid === userId);
    
    if (targetSessionId) {
        const a = u.accounts.get(targetSessionId);
        if (a) a.cancel(ctx);
        u.accounts.delete(targetSessionId);
    }
    if (ctx.session?.mid) {
      try { await ctx.api.deleteMessage(userId, ctx.session.mid) } catch {}
    }
    ctx.session = null;
    await ctx.deleteMessage();
    const menu = mainMenu(ctx);
    await ctx.reply('Login dibatalkan.', { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    await ctx.answerCallbackQuery('❌ Batal');
  });
};
