const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, allCommandNames, settingMenu } = require('../utils/menu');

const TIME_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;

module.exports = async (ctx) => {
  const text = ctx.message.text?.trim();
  if (allCommandNames && allCommandNames.has(text)) return;

  const u = getUser(ctx.from.id);
  const a = getAcc(ctx.from.id);
  const targetAcc = u.accounts.get(ctx.session?.id) || a;
  if (targetAcc?.handleText(text, ctx)) return;

  if (!a && ctx.session?.act && ctx.session.act !== 'phone') {
    ctx.session = null;
    return ctx.reply('❌ Aksi dibatalkan. Login dulu.');
  }

  if (ctx.session?.mid) {
    try { await ctx.api.deleteMessage(ctx.from.id, ctx.session.mid); } catch {}
  }

  const actions = {
    phone: async () => {
      if (!/^\+\d{10,15}$/.test(text)) {
        return ctx.reply('❌ Format salah. Contoh: +6281234567890');
      }
      const acc = u.accounts.get(ctx.session.id);
      if (acc) {
        u.active = ctx.session.id;
        acc.login(ctx, text);
      }
    },

    addmsg: async () => {
      if (!a) return;
      const m = ctx.message;
      try {
        if (m.forward_from_chat && m.forward_from_message_id) {
          a.msgs.push({
            src: m.forward_from_chat.id,
            mid: m.forward_from_message_id,
            text: (m.text || m.caption || '').slice(0, 200)
          });
          await ctx.reply('✅ Disimpan (forward).');
        } else if (m.text || m.caption) {
          a.msgs.push(m.text || m.caption);
          await ctx.reply('✅ Disimpan (teks).');
        } else {
          a.msgs.push('[Unsupported media]');
          await ctx.reply('⚠️ Media belum didukung, disimpan sebagai teks placeholder.');
        }
      } catch (e) {
        await ctx.reply('❌ Gagal menyimpan: ' + (e.message || e));
      }

      const menu = mainMenu(ctx);
      await ctx.reply(menu.text, {
        reply_markup: menu.reply_markup,
        parse_mode: menu.parse_mode
      });
    },

    addtgt: async () => {
      try {
        const count = await a.addTargets(text);
        const menu = mainMenu(ctx);
        await ctx.reply(
          count
            ? `✅ ${count} target valid ditambah`
            : '⚠️ Tidak ada target valid.',
          { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode }
        );
      } catch (e) {
        await ctx.reply(`❌ Gagal menambah target: ${e.message}`);
      }
    },

    setdelay: async () => {
      const v = +text;
      if (v >= 1 && v <= 3600) {
        a.delay = v;
        a.delayMode = 'antar';
        await ctx.reply(`✅ Jeda Antar Grup: ${v}s`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply('❌ Masukkan angka 1-3600.');
      }
    },

    setdelayall: async () => {
      const v = +text;
      if (v >= 1 && v <= 1440) {
        a.delayAllGroups = v;
        a.delayMode = 'semua';
        await ctx.reply(`✅ Jeda Semua Grup: ${v}m`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply('❌ Masukkan angka 1-1440.');
      }
    },

    // Waktu Mulai
    setstart: async () => {
      if (text === '-' || text.toLowerCase() === 'x') {
        a.startTime = null;
        await ctx.reply('✅ Waktu Mulai dihapus.', { reply_markup: settingMenu(a) });
        return;
      }
      if (!TIME_REGEX.test(text)) {
        return ctx.reply('❌ Format salah. Gunakan HH:MM (24 jam), contoh 08:30 atau 23:05. Atau kirim "-" untuk hapus.');
      }
      a.startTime = text;
      await ctx.reply(`✅ Waktu Mulai di-set: ${text}`, { reply_markup: settingMenu(a) });
    },

    // Waktu Stop
    setstop: async () => {
      if (text === '-' || text.toLowerCase() === 'x') {
        a.stopTime = null;
        a.stopTimestamp = null;
        await ctx.reply('✅ Waktu Stop dihapus.', { reply_markup: settingMenu(a) });
        return;
      }
      if (!TIME_REGEX.test(text)) {
        return ctx.reply('❌ Format salah. Gunakan HH:MM (24 jam), contoh 22:15. Atau kirim "-" untuk hapus.');
      }
      a.stopTime = text;
      await ctx.reply(`✅ Waktu Stop di-set: ${text}`, { reply_markup: settingMenu(a) });
    }
  };

  if (ctx.session?.act && actions[ctx.session.act]) {
    await actions[ctx.session.act]();
    ctx.session = null;
  }
};
