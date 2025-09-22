// handler/input.js

const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, allCommandNames, settingMenu } = require('../utils/menu');

module.exports = async (ctx) => {
  const text = ctx.message.text?.trim();

  // Pemeriksaan ini penting agar tombol perintah tidak diproses oleh file ini.
  if (allCommandNames && allCommandNames.has(text)) {
    return;
  }
  
  const u = getUser(ctx.from.id);
  const a = getAcc(ctx.from.id);

  const targetAcc = u.accounts.get(ctx.session?.id) || a;
  if (targetAcc?.handleText(text, ctx)) return;
  
  if (!a && ctx.session?.act && ctx.session.act !== 'phone') {
    ctx.session = null;
    return ctx.reply('❌ Aksi dibatalkan. Silakan login terlebih dahulu.');
  }
  
  if (ctx.session?.mid) {
    try { await ctx.api.deleteMessage(ctx.from.id, ctx.session.mid) } catch {}
  }
  
  // Objek 'actions' yang lengkap dan sudah diperbaiki
  const actions = {
    phone: async () => {
      if (!/^\+\d{10,15}$/.test(text)) {
        return await ctx.reply('❌ Format salah. Contoh: +6281234567890');
      }
      const acc = u.accounts.get(ctx.session.id);
      if (acc) {
        u.active = ctx.session.id;
        acc.login(ctx, text);
      }
    },
    addmsg: async () => {
  const m = ctx.message;
  // 1. Jika forward dari channel/grup
  if (m.forward_from_chat && m.forward_from_message_id) {
    a.msgs.push({
      chatId: m.forward_from_chat.id,
      messageId: m.forward_from_message_id,
      preview: (m.text || m.caption || '').slice(0, 60)
    });
    await ctx.reply('✅ Disimpan (forward sumber asli).');
  } else {
    // 2. Pesan biasa (teks atau media)
    //   - Media non-teks masih bisa di-forward karena sumbernya chat bot
    const basePreview =
      (m.text || m.caption) ? (m.text || m.caption).slice(0, 60)
      : m.photo ? '[Foto]'
      : m.video ? '[Video]'
      : m.document ? `[File:${m.document.file_name || 'dok'}]`
      : m.sticker ? '[Sticker]'
      : m.voice ? '[Voice]'
      : '[Pesan]';

    a.msgs.push({
      chatId: BOT_ID,
      messageId: m.message_id,
      preview: basePreview
    });
    await ctx.reply('✅ Disimpan (sumber: chat dengan bot).');
  }

  const menu = mainMenu(ctx);
  await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    },
    addtgt: async () => {
  try {
    const count = await a.addTargets(text);   // <-- pakai await
    const menu = mainMenu(ctx);
    if (count) {
      await ctx.reply(`✅ ${count} target valid ditambah`, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    } else {
      await ctx.reply(`⚠️ Tidak ada target valid. (Tetap disimpan yang gagal untuk referensi)`, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    }
  } catch (e) {
    await ctx.reply(`❌ Gagal menambah target: ${e.message}`);
  }
},
    setdelay: async () => {
      const delay = +text;
      if (delay >= 1 && delay <= 3600) {
        a.delay = delay;
        a.delayMode = 'antar';
        await ctx.reply(`✅ Jeda Antar Grup berhasil diubah menjadi: ${delay} detik`, {
            reply_markup: settingMenu(a)
        });
      } else {
        await ctx.reply(`❌ Nilai tidak valid. Masukkan angka antara 1-3600.`);
      }
    },
    setdelayall: async () => {
      const minutes = +text;
      if (minutes >= 1 && minutes <= 1440) {
        a.delayAllGroups = minutes;
        a.delayMode = 'semua';
        await ctx.reply(`✅ Jeda Per Semua Grup berhasil diubah menjadi: ${minutes} menit${minutes < 20 ? '\n\n⚠️ *PERINGATAN*: Nilai jeda terlalu rendah. Disarankan minimal 20 menit untuk menghindari batasan Telegram.' : ''}`, {
            reply_markup: settingMenu(a),
            parse_mode: "Markdown"
        });
      } else {
        await ctx.reply(`❌ Nilai tidak valid. Masukkan angka antara 1-1440.`);
      }
    },
    setstart: async () => {
      const minutes = +text;
      if (minutes >= 0 && minutes <= 1440) {
        a.startAfter = minutes;
        await ctx.reply(`✅ Tunda mulai berhasil diubah menjadi: ${minutes} menit`, {
            reply_markup: settingMenu(a)
        });
      } else {
        await ctx.reply(`❌ Nilai tidak valid. Masukkan angka antara 0-1440.`);
      }
    },
    setstop: async () => {
      const minutes = +text;
      if (minutes >= 0 && minutes <= 1440) {
        a.stopAfter = minutes;
        await ctx.reply(`✅ Stop otomatis berhasil diubah menjadi: ${minutes} menit`, {
            reply_markup: settingMenu(a)
        });
      } else {
        await ctx.reply(`❌ Nilai tidak valid. Masukkan angka antara 0-1440.`);
      }
    }
  };
  
  if (ctx.session?.act && actions[ctx.session.act]) {
    await actions[ctx.session.act]();
    ctx.session = null;
  }
};


