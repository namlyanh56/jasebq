const { InlineKeyboard } = require('grammy');
const { getAcc } = require('../utils/helper');
const { pesanMenu } = require('../utils/menu');

const snippet = (m) => {
  if (!m) return '(kosong)';
  if (typeof m === 'string') return m.slice(0, 40) + (m.length > 40 ? '...' : '');
  return (m.preview || '').slice(0, 40) + ((m.preview || '').length > 40 ? '...' : '');
};

const createDeleteList = (ctx) => {
  const a = getAcc(ctx.from.id);
  if (!a || !a.msgs.length) {
    return { text: 'ℹ️ Daftar pesan kosong.', reply_markup: new InlineKeyboard().text('Tutup', 'delete_this') };
  }
  let text = "Pilih pesan yang ingin dihapus:\n\n";
  const kb = new InlineKeyboard();
  a.msgs.forEach((msg, i) => {
    const view = snippet(msg).replace(/\*/g, '');
    text += `${i + 1}. *${view}*\n`;
    kb.text(`❌ Hapus No.${i + 1}`, `del_msg_${i}`).row();
  });
  kb.text('💥 HAPUS SEMUA', 'delete_all_msgs').row();
  kb.text('Tutup', 'delete_this');
  return { text, reply_markup: kb, parse_mode: "Markdown" };
};

module.exports = (bot) => {
  bot.hears('✉️ Kelola Pesan', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    await ctx.reply('Kelola pesan broadcast.', { reply_markup: pesanMenu() });
  });

  bot.hears('➕ Tambah Pesan', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'addmsg' };
    await ctx.reply('Kirim teks / forward dari channel/grup:');
  });

  bot.hears('📋 List Pesan', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (!a.msgs.length) return ctx.reply('ℹ️ Daftar pesan kosong.');
    let out = `📝 Pesan (${a.msgs.length}):\n\n`;
    a.msgs.forEach((m, i) => {
      out += `${i + 1}. ${snippet(m)}\n`;
    });
    await ctx.reply(out);
  });

  bot.hears('🗑️ Hapus Pesan', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (!a.msgs.length) return ctx.reply('ℹ️ Daftar pesan kosong.');
    const { text, reply_markup, parse_mode } = createDeleteList(ctx);
    await ctx.reply(text, { reply_markup, parse_mode });
  });

  bot.callbackQuery(/del_msg_(\d+)/, async (ctx) => {
    const index = parseInt(ctx.match[1], 10);
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery({ text: '❌ Login dulu', show_alert: true });
    if (a.msgs[index] !== undefined) {
      a.msgs.splice(index, 1);
      await ctx.answerCallbackQuery({ text: `✅ Dihapus.` });
      const { text, reply_markup, parse_mode } = createDeleteList(ctx);
      try {
        await ctx.editMessageText(text, { reply_markup, parse_mode });
      } catch {}
    } else {
      await ctx.answerCallbackQuery({ text: '❌ Sudah tidak ada.', show_alert: true });
    }
  });

  bot.callbackQuery('delete_all_msgs', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (a) {
      a.msgs = [];
      await ctx.answerCallbackQuery({ text: '✅ Semua pesan dihapus.', show_alert: true });
      const { text, reply_markup, parse_mode } = createDeleteList(ctx);
      try { await ctx.editMessageText(text, { reply_markup, parse_mode }); } catch {}
    }
  });

  bot.callbackQuery('delete_this', async (ctx) => {
    try { await ctx.deleteMessage(); } catch {}
    await ctx.answerCallbackQuery();
  });
};
