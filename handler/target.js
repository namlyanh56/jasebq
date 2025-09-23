const { InlineKeyboard } = require('grammy');
const { getAcc } = require('../utils/helper');
const { targetMenu } = require('../utils/menu');

const createTargetDeleteList = (ctx) => {
  const a = getAcc(ctx.from.id);
  if (!a || !a.targets.size) {
    return { text: 'ℹ️ Daftar target manual Anda kosong.', reply_markup: new InlineKeyboard().text('Tutup', 'delete_this') };
  }
  let text = "Pilih target yang ingin dihapus:\n\n";
  const kb = new InlineKeyboard();
  let i = 1;
  for (const [id, target] of a.targets) {
    text += `${i}. *${target.title}*\n`;
    kb.text(`❌ Hapus No. ${i}`, `del_tgt_${id}`).row();
    i++;
    if (i > 15) {
      text += `\n...dan lainnya.`;
      break;
    }
  }
  kb.text('💥 HAPUS SEMUA TARGET', 'delete_all_targets').row();
  kb.text('Tutup', 'delete_this');
  return { text, reply_markup: kb, parse_mode: "Markdown" };
};

// Util untuk pesan loading ephemeral
async function showLoading(ctx, msg = '⏳ *Tunggu sebentar...*') {
  try {
    const m = await ctx.reply(msg, { parse_mode: 'Markdown' });
    return m.message_id;
  } catch {
    return null;
  }
}
async function deleteIfPossible(ctx, mid) {
  if (!mid) return;
  try { await ctx.api.deleteMessage(ctx.from.id, mid); } catch {}
}

module.exports = (bot) => {
  bot.hears('📍 Kelola Target', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a?.authed) return ctx.reply('❌ Login dulu');
    await ctx.reply(`*Silahkan Pilih Opsi Menu*`, { reply_markup: targetMenu(a) });
  });

  bot.hears('➕ Tambah Target', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    ctx.session = { act: 'addtgt' };
    await ctx.reply('📩* Silakan kirim link atau username Channel/Grup yang akan menjadi target broadcast*.
Contoh:
_https://t.me/..._
_@usernamech_

❓ *Ada kendala? Hubungi: @JaeHype*');
  });
  
  // Ambil semua target (ditambahkan loading)
  bot.hears('🖇️ Ambil Semua', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    const loadingId = await showLoading(ctx);
    try {
      const count = await a.addAll();
      await deleteIfPossible(ctx, loadingId);
      await ctx.reply(`✅ Berhasil mengambil ${count} target.`, { reply_markup: targetMenu(a) });
    } catch {
      await deleteIfPossible(ctx, loadingId);
      await ctx.reply('❌ Gagal mengambil target.');
    }
  });

  bot.hears('📋 List Target', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (!a.targets.size) return ctx.reply('❌ Daftar target kosong.');
    let text = `📋 *Daftar CH/Grup saat ini* (${a.targets.size}):\n\n`;
    let i = 1;
    for (const [, target] of a.targets) {
      text += `${i}. ${target.title}\n`;
      i++;
      if (i > 20) { text += `\n...dan ${a.targets.size - 20} lainnya.`; break; }
    }
    await ctx.reply(text);
  });

  bot.hears('🗑️ Hapus Target', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (!a) return ctx.reply('❌ Login dulu');
    if (!a.targets.size) return ctx.reply('ℹ️ Daftar target manual kosong, tidak ada yang bisa dihapus.');
    const { text, reply_markup, parse_mode } = createTargetDeleteList(ctx);
    await ctx.reply(text, { reply_markup, parse_mode });
  });
  
  bot.callbackQuery(/del_tgt_(.+)/, async (ctx) => {
    const targetId = ctx.match[1];
    const a = getAcc(ctx.from.id);
    if (a && a.targets.has(targetId)) {
      a.targets.delete(targetId);
      await ctx.answerCallbackQuery({ text: `✅ Target dihapus.` });
      const { text, reply_markup, parse_mode } = createTargetDeleteList(ctx);
      await ctx.editMessageText(text, { reply_markup, parse_mode });
    } else {
      await ctx.answerCallbackQuery({ text: '❌ Target sudah tidak ada.', show_alert: true });
    }
  });
  
  bot.callbackQuery('delete_all_targets', async (ctx) => {
    const a = getAcc(ctx.from.id);
    if (a) {
      a.targets.clear();
      await ctx.answerCallbackQuery({ text: '✅ Semua target berhasil dihapus.', show_alert: true });
      const { text, reply_markup, parse_mode } = createTargetDeleteList(ctx);
      await ctx.editMessageText(text, { reply_markup, parse_mode });
    }
  });
};


