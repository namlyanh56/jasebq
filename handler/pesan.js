const { InlineKeyboard } = require('grammy');
const { getAcc } = require('../utils/helper');
const { pesanMenu } = require('../utils/menu');

// Snippet robust: dukung
// - string (pesan biasa)
// - object forward {src, mid, text}
// - object lama {preview}
// - fallback media/forward tanpa text
const snippet = (m) => {
  if (!m) return '(kosong)';

  if (typeof m === 'string') {
    const t = m.trim();
    if (!t) return '(kosong)';
    return t.length > 40 ? t.slice(0, 40) + '...' : t;
  }

  if (typeof m === 'object') {
    // Prioritas: text -> preview -> placeholder forward/media
    let base =
      (typeof m.text === 'string' && m.text.trim()) ? m.text.trim()
      : (typeof m.preview === 'string' && m.preview.trim()) ? m.preview.trim()
      : (m.mid !== undefined ? `[Forward ${m.mid}]` : '[Pesan]');
    return base.length > 40 ? base.slice(0, 40) + '...' : base;
  }

  return '(unknown)';
};

const createDeleteList = (ctx) => {
  const a = getAcc(ctx.from.id);
  if (!a || !a.msgs.length) {
    return { text: 'ℹ️ Daftar pesan kosong.', reply_markup: new InlineKeyboard().text('Tutup', 'delete_this') };
  }
  let text = "_Pilih pesan yang ingin dihapus_:\n\n";
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
    await ctx.reply('*Silakan kirim pesan yang akan dibroadcast.*
Untuk menampilkan emoji premium, pesan tersebut harus di-forward dari chat atau grup.
*⚠️ Saat ini belum mendukung media.*

_Ada kendala? Hubungi: @JaeHype_');
  });

  bot.hears('📋 List Pesan', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (!a.msgs.length) return ctx.reply('ℹ️ Daftar pesan kosong.');
    let out = `📝 *List Pesan Broadcast* (${a.msgs.length}):\n\n`;
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
      try { await ctx.editMessageText(text, { reply_markup, parse_mode }); } catch {}
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

