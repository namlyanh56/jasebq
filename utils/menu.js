const { Keyboard, InlineKeyboard } = require('grammy');
const { getUser, getAcc } = require('./helper');

const allCommandNames = new Set();
const k = (text) => {
    allCommandNames.add(text);
    return text;
};

const mainMenu = (ctx) => {
  const uid = ctx.from.id;
  const firstName = ctx.from.first_name || 'Pengguna';
  const u = getUser(uid), a = getAcc(uid);
  const status = a?.authed ? (a.running ? '🟢 Running' : '⚪ Ready') : '🔴 Offline';

  if (!a?.authed) {
    const keyboard = new Keyboard()
      .text(k('🔐 Login')).row()
      .text(k('🔄 Ganti Sesi')).text(k('💡 Bantuan'))
      .resized();
    const text = `*👋🏻 Hai!, ${firstName}*\n\nSelamat datang di Ubot by @JaeHype!\nBot ini bisa broadcast secara otomatis!\n\n*Owner : @JaeHype*\n*Channel: @PanoramaaStoree*`;
    return { text, reply_markup: keyboard, parse_mode: "Markdown" };
  }

  const keyboard = new Keyboard()
    .text(k('🚀 Jalankan Ubot')).text(k('⛔ Hentikan Ubot')).row()
    .text(k('✉️ Kelola Pesan')).text(k('📍 Kelola Target')).row()
    .text(k('⚙️ Settings')).text(k('📈 Lihat Statistik')).row()
    .text(k('🔄 Ganti Sesi')).text(k('💡 Bantuan'))
    .resized();
  const text = `*👋🏻 Hai!, ${firstName},*\n\nSelamat datang kembali di Ubot by @JaeHype!\n\n---\n*Status Akun:*\n👤 Akun Aktif: *${a.name}*\n📊 Status Ubot: *${status}*`;
  return { text, reply_markup: keyboard, parse_mode: "Markdown" };
};

const pesanMenu = () => {
  return new Keyboard()
    .text(k('➕ Tambah Pesan')).row()
    .text(k('🗑️ Hapus Pesan')).text(k('📋 List Pesan')).row()
    .text(k('⬅️ Kembali'))
    .resized();
};

const targetMenu = (ctx) => { // Menggunakan ctx sebagai parameter agar konsisten
  const kb = new Keyboard()
    .text(k('➕ Tambah Target')).text(k('🔄 Ambil Semua')).row()
    .text(k('📋 List Target')).text(k('🗑️ Hapus Target')).row()
    .text(k('⬅️ Kembali'))
    .resized();

  // Kita bungkus keyboard (kb) di dalam objek return ini
  return {
    text: 'Silakan kelola target broadcast Anda.', // Teks yang akan ditampilkan bersama menu
    reply_markup: kb,
    parse_mode: "Markdown"
  };
};

const settingMenu = (akun) => {
    return new Keyboard()
      .text(k(`⏱️ Atur Jeda: ${akun.delay}s`)).row()
      .text(k(`⏰ Tunda Mulai: ${akun.startAfter}m`)).text(k(`🛑 Stop Otomatis: ${akun.stopAfter}m`)).row()
      .text(k('⬅️ Kembali'))
      .resized();
};

const switchMenu = (user) => {
    const kb = new Keyboard();
    for (const [id, acc] of user.accounts) {
      const icon = acc.authed ? '🟢' : '🔴';
      const active = user.active === id ? ' ✅' : '';
      kb.text(k(`${icon} Aktifkan: ${acc.name || id}${active}`)).row();
    }
    kb.text(k('➕ Tambah Sesi Baru')).row();
    kb.text(k('⬅️ Kembali'));
    return kb.resized();
};

const startCommand = async (ctx) => {
  const menu = mainMenu(ctx);
  await ctx.reply(menu.text, { 
      reply_markup: menu.reply_markup,
      parse_mode: menu.parse_mode 
  });
};

const helpCommand = async (ctx) => {
  const text = `✨ *Selamat Datang di Ubot Panorama!* ✨
Bot ini adalah asisten Anda untuk menjalankan *Userbot Telegram*, yang berfungsi untuk mengirim pesan (broadcast) secara otomatis ke banyak tujuan sekaligus.

⭐️ *FITUR UTAMA*
• \`🔐\` *Login Multi-Sesi*: Gunakan beberapa akun.
• \`✉️\` *Manajemen Pesan*: Kelola daftar pesan teks Anda.
• \`🎯\` *Target Otomatis & Manual*: Pilih target atau ambil semua.
• \`🔧\` *Kontrol Penuh*: Atur jeda, Waktu mulai, & Waktu stop.
• \`📈\` *Statistik*: Pantau jumlah pesan terkirim dan gagal.

🚀 *ALUR CEPAT*
1. *Login* dengan akun Anda.
2. *Atur* Pesan & Target.
3. *Jalankan* Ubot!

_Butuh bantuan atau ada pertanyaan?_
👤 *Owner*: @JaeHype
📢 *Channel*: @PanoramaaStoree`;

  await ctx.reply(text, { 
      parse_mode: "Markdown",
      reply_markup: new Keyboard().text(k('⬅️ Kembali')).resized() 
  });
};

module.exports = { allCommandNames, mainMenu, pesanMenu, targetMenu, settingMenu, switchMenu, startCommand, helpCommand };


