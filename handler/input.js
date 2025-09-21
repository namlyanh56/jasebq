const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, allCommandNames, settingMenu } = require('../utils/menu');

module.exports = async (ctx) => {
  const text = ctx.message.text?.trim();
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
      a.msgs.push(text);
      await ctx.reply(`✅ Pesan teks berhasil ditambahkan.`);
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
        await ctx.reply(`✅ Jeda berhasil diubah menjadi: ${delay} detik`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply(`❌ Nilai tidak valid. Masukkan angka antara 1-3600.`);
      }
    },
    setstart: async () => {
      const minutes = +text;
      if (minutes >= 0 && minutes <= 1440) {
        a.startAfter = minutes;
        await ctx.reply(`✅ Tunda mulai berhasil diubah menjadi: ${minutes} menit`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply(`❌ Nilai tidak valid. Masukkan angka antara 0-1440.`);
      }
    },
    setstop: async () => {
      const minutes = +text;
      if (minutes >= 0 && minutes <= 1440) {
        a.stopAfter = minutes;
        await ctx.reply(`✅ Stop otomatis berhasil diubah menjadi: ${minutes} menit`, { reply_markup: settingMenu(a) });
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

