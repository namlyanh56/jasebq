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
    return ctx.reply('❌ Aksi dibatalkan. Silakan login.');
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
          // Forward dari grup/channel
          // Cek apakah tipe chat cocok (channel / supergroup)
          // Kalau caption/teks ada, kita tetap simpan objek forward
          let chatIdBot = m.forward_from_chat.id; // Bot API style (-100xxxx)
          // Simpan dalam bentuk "raw", nanti di ensureMsgObject kita butuh chatId internal.
          a.msgs.push({
            chatId: chatIdBot,            // akan dikonversi saat forward
            messageId: m.forward_from_message_id,
            preview: (m.text || m.caption || '').slice(0, 60),
            forwarded: true               // flag
          });
          await ctx.reply('✅ Disimpan (forward asli). Pastikan userbot sudah join ke grup sumber.');
        } else if (m.text || m.caption) {
          a.msgs.push(m.text || m.caption);
          await ctx.reply('✅ Disimpan (teks).');
        } else {
          await ctx.reply('⚠️ Media non-forward belum didukung. Forward langsung dari sumber atau kirim teks.');
        }
      } catch (e) {
        await ctx.reply('❌ Gagal simpan: ' + (e.message || e));
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
            ? `✅ ${count} target grup/channel valid ditambah`
            : '⚠️ Tidak ada target grup/channel valid (user / gagal tetap dicatat).',
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
      } else ctx.reply('❌ Masukkan angka 1-3600.');
    },

    setdelayall: async () => {
      const v = +text;
      if (v >= 1 && v <= 1440) {
        a.delayAllGroups = v;
        a.delayMode = 'semua';
        await ctx.reply(
          `✅ Jeda Semua Grup: ${v}m${v < 20 ? '\n⚠️ Disarankan >= 20m untuk hindari limit.' : ''}`,
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
