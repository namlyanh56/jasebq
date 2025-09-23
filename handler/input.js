// handler/input.js
const { getUser, getAcc } = require('../utils/helper');
const { mainMenu, allCommandNames, settingMenu } = require('../utils/menu');
const { BOT_ID } = require('../config/setting'); // masih boleh, walau tidak dipakai lagi di addmsg baru

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
          // Forward dari channel/grup (userbot harus punya akses ke sumber)
          a.msgs.push({
            chatId: m.forward_from_chat.id,
            messageId: m.forward_from_message_id,
            preview: (m.text || m.caption || '').slice(0, 60)
          });
          await ctx.reply('✅ Disimpan (forward sumber asli).');
        } else if (m.text || m.caption) {
          // Simpan sebagai string FULL (tidak dipotong) → nanti dikirim ke Saved Messages oleh ensureMsgObject
          a.msgs.push(m.text || m.caption);
          await ctx.reply('✅ Disimpan (teks/caption).');
        } else {
          // Media non-forward (foto/video/dokumen) sementara tidak di-handle
            await ctx.reply('⚠️ Media non-teks yang bukan forward belum bisa disimpan.\nSilakan FORWARD langsung dari channel/grup sumber agar bisa di-broadcast, atau kirim teks saja.');
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
        await ctx.reply(`✅ Jeda Antar Grup diubah: ${delay} detik`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply('❌ Masukkan angka 1-3600.');
      }
    },

    setdelayall: async () => {
      const minutes = +text;
      if (minutes >= 1 && minutes <= 1440) {
        a.delayAllGroups = minutes;
        a.delayMode = 'semua';
        await ctx.reply(
          `✅ Jeda Per Semua Grup diubah: ${minutes} menit${minutes < 20 ? '\n⚠️ Disarankan ≥ 20 menit untuk hindari limit.' : ''}`,
          { reply_markup: settingMenu(a), parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply('❌ Masukkan angka 1-1440.');
      }
    },

    setstart: async () => {
      const minutes = +text;
      if (minutes >= 0 && minutes <= 1440) {
        a.startAfter = minutes;
        await ctx.reply(`✅ Tunda mulai: ${minutes} menit`, { reply_markup: settingMenu(a) });
      } else {
        await ctx.reply('❌ Masukkan angka 0-1440.');
      }
    },

    setstop: async () => {
      const minutes = +text;
      if (minutes >= 0 && minutes <= 1440) {
        a.stopAfter = minutes;
        await ctx.reply(`✅ Stop otomatis: ${minutes} menit`, { reply_markup: settingMenu(a) });
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
