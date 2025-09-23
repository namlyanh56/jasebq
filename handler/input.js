// handler/input.js
const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, allCommandNames, settingMenu } = require('../utils/menu');
// const { BOT_ID } = require('../config/setting'); // Tidak wajib lagi untuk teks biasa

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
          // Forward dari channel/grup
          a.msgs.push({
            chatId: m.forward_from_chat.id,
            messageId: m.forward_from_message_id,
            preview: (m.text || m.caption || '').slice(0, 60)
          });
          await ctx.reply('✅ Disimpan (forward sumber asli).');
        } else if (m.text || m.caption) {
          // Simpan teks full sebagai string (biar ensureMsgObject yang kirim ke Saved Messages)
          a.msgs.push(m.text || m.caption);
          await ctx.reply('✅ Disimpan (teks).');
        } else {
          await ctx.reply('⚠️ Media non-forward belum didukung. Forward langsung dari channel/grup untuk disimpan.');
        }
      } catch (e) {
        await ctx.reply('❌ Gagal simpan: ' + (e.message || e));
      }
      const menu = mainMenu(ctx);
      await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
    },

    addtgt: async () => {
      try {
        const count = await a.addTargets(text);
        const menu = mainMenu(ctx);
        if (count) {
          await ctx.reply(`✅ ${count} target grup/channel valid ditambah`, {
            reply_markup: menu.reply_markup,
            parse_mode: menu.parse_mode
          });
        } else {
          await ctx.reply('⚠️ Tidak ada target grup valid (user / gagal / salah format tetap dicatat).', {
            reply_markup: menu.reply_markup,
            parse_mode: menu.parse_mode
          });
        }
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
      } else ctx.reply('❌ Masukkan angka 1-3600.');
    },

    setdelayall: async () => {
      const v = +text;
      if (v >= 1 && v <= 1440) {
        a.delayAllGroups = v;
        a.delayMode = 'semua';
        await ctx.reply(
          `✅ Jeda Per Semua Grup: ${v}m${v < 20 ? '\n⚠️ Disarankan ≥ 20m untuk hindari limit.' : ''}`,
          { reply_markup: settingMenu(a), parse_mode: 'Markdown' }
        );
      } else ctx.reply('❌ Masukkan angka 1-1440.');
    },

    setstart: async () => {
      const v = +text;
      if (v >= 0 && v <= 1440) {
        a.startAfter = v;
        await ctx.reply(`✅ Tunda mulai: ${v}m`, { reply_markup: settingMenu(a) });
      } else ctx.reply('❌ Masukkan angka 0-1440.');
    },

    setstop: async () => {
      const v = +text;
      if (v >= 0 && v <= 1440) {
        a.stopAfter = v;
        await ctx.reply(`✅ Stop otomatis: ${v}m`, { reply_markup: settingMenu(a) });
      } else ctx.reply('❌ Masukkan angka 0-1440.');
    }
  };

  if (ctx.session?.act && actions[ctx.session.act]) {
    await actions[ctx.session.act]();
    ctx.session = null;
  }
};
