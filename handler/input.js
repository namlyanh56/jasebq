const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, allCommandNames, settingMenu } = require('../utils/menu');

module.exports = async (ctx) => {
  const text = ctx.message.text?.trim();

  if (allCommandNames && allCommandNames.has(text)) return;

  const u = getUser(ctx.from.id);
  const a = getAcc(ctx.from.id);

  const targetAcc = u.accounts.get(ctx.session?.id) || a;
  if (targetAcc?.handleText(text, ctx)) return;

  if (!a && ctx.session?.act && ctx.session.act !== 'phone') {
    ctx.session = null;
    return ctx.reply('❌ Aksi dibatalkan. Silakan login terlebih dahulu.');
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
          // Simpan hanya data minimal untuk forward
            a.msgs.push({
              src: m.forward_from_chat.id,           // bot api chat id sumber
              mid: m.forward_from_message_id,        // message id sumber
              text: (m.text || m.caption || '').slice(0, 200)
            });
          await ctx.reply('✅ Disimpan (mode forward).');
        } else if (m.text || m.caption) {
          a.msgs.push((m.text || m.caption));
          await ctx.reply('✅ Disimpan (teks, akan di-copy).');
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
            : '⚠️ Tidak ada target valid (yang gagal tetap dicatat).',
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
        await ctx.reply(
          `✅ Jeda Semua Grup: ${v}m${v < 20 ? '\n⚠️ Disarankan ≥ 20m.' : ''}`,
          { reply_markup: settingMenu(a), parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply('❌ Masukkan angka 1-1440.');
      }
    },

    setstart: async () => {
      const v = +text;
      if (v >= 0 && v <= 1440) {
        a.startAfter = v;
        await ctx.reply(`✅ Tunda mulai: ${v}m`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply('❌ Masukkan angka 0-1440.');
      }
    },

    setstop: async () => {
      const v = +text;
      if (v >= 0 && v <= 1440) {
        a.stopAfter = v;
        await ctx.reply(`✅ Stop otomatis: ${v}m`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply('❌ Masukkan angka 0-1440.');
      }
    }
  };

  if (ctx.session?.act && actions[ctx.session.act]) {
    await actions[ctx.session.act]();
    ctx.session = null;
  }
};
