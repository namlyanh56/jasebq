const { Keyboard } = require('grammy');
const { getUser, getAcc } = require('./helper');

const allCommandNames = new Set();
const k = (t) => { allCommandNames.add(t); return t; };

const mainMenu = (ctx) => {
  const uid = ctx.from.id;
  const firstName = ctx.from.first_name || 'Pengguna';
  const u = getUser(uid), a = getAcc(uid);
  const status = a?.authed ? (a.running ? '🟢 Running' : '⚪ Ready') : '🔴 Offline';

  if (!a?.authed) {
    const keyboard = new Keyboard()
      .text(k('🤖Buat Userbot')).row()
      .text(k('👥 Akun')).text(k('💡 Bantuan'))
      .resized();
    const text = `*👋🏻 Hai!, ${firstName}*\n\nSelamat datang di Ubot by @JaeHype!\nBot ini bisa broadcast secara otomatis!\n\n*Owner : @JaeHype*\n*Channel: @PanoramaaStoree*`;
    return { text, reply_markup: keyboard, parse_mode: "Markdown" };
  }

  const keyboard = new Keyboard()
    .text(k('🚀 Jalankan Ubot')).text(k('⛔ Hentikan Ubot')).row()
    .text(k('✉️ Kelola Pesan')).text(k('📍 Kelola Target')).row()
    .text(k('⚙️ Settings')).text(k('📈 Lihat Statistik')).row()
    .text(k('👥 Ganti Sesi')).text(k('💡 Bantuan'))
    .resized();
  const text = `*👋🏻 Hai!, ${firstName}*\n\nSelamat datang kembali di Ubot by @JaeHype!\n\n---\n*Status Akun:*\n👤 Akun Aktif: *${a.name}*\n📚 Status Ubot: *${status}*`;
  return { text, reply_markup: keyboard, parse_mode: "Markdown" };
};

const pesanMenu = () =>
  new Keyboard()
    .text(k('➕ Tambah Pesan')).row()
    .text(k('🗑️ Hapus Pesan')).text(k('📋 List Pesan')).row()
    .text(k('⬅️ Kembali'))
    .resized();

const targetMenu = (a) =>
  new Keyboard()
    .text(k('➕ Tambah Target')).text(k('🖇️ Ambil Semua')).row()
    .text(k('📋 List Target')).text(k('🗑️ Hapus Target')).row()
    .text(k('⬅️ Kembali'))
    .resized();

const settingMenu = (a) => {
  const delayLabel = a.delayMode === 'semua'
    ? `⛓️ Jeda Semua Grup: ${a.delayAllGroups}m`
    : `🔗 Jeda Antar Grup: ${a.delay}s`;

  const startLabel = `🕒 Waktu Mulai: ${a.startTime ? a.startTime : '-'}`;
  const stopLabel  = `🕝 Waktu Stop: ${a.stopTime ? a.stopTime : '-'}`;

  return new Keyboard()
    .text(k(delayLabel)).row()
    .text(k('🔄 Ganti Mode Jeda')).row()
    .text(k(startLabel)).text(k(stopLabel)).row()
    .text(k('⬅️ Kembali'))
    .resized();
};

const jedaMenu = () =>
  new Keyboard()
    .text(k('🔗 Jeda Antar Grup')).row()
    .text(k('⛓️ Jeda Per Semua Grup')).row()
    .text(k('⬅️ Kembali'))
    .resized();

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
  await ctx.reply(menu.text, { reply_markup: menu.reply_markup, parse_mode: menu.parse_mode });
};

const helpCommand = async (ctx) => {
  const text = `✨*Ubot Panorama*✨
Gunakan untuk mengirim pesan terjadwal ke banyak grup.



*Langkah cepat:*
1. Buat sesi: 🤖 Buat Userbot & login
2. Tambah pesan: ✉️ Kelola Pesan → ➕
3. Tambah target: 📚 Kelola Target → ➕ / Ambil Semua
4. Jalankan: 🚀 Jalankan Ubot



⚠️* Bot ini gratis, gunakan sebaik-baiknya. Masih ada kekurangan. 
Kalau ingin versi lebih lengkap dan canggih, bisa pindah versi berbayar. Terima kasih atas pengertiannya!*



Kontak: @JaeHype
Channel Update: @PanoramaaStore`;
  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: new Keyboard().text(k('⬅️ Kembali')).resized()
  });
};

module.exports = {
  allCommandNames,
  mainMenu,
  pesanMenu,
  targetMenu,
  settingMenu,
  jedaMenu,
  switchMenu,
  startCommand,
  helpCommand
};

