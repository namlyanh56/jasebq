const { InlineKeyboard } = require('grammy');
const { mainMenu } = require('../utils/menu');

// Username / ID yang wajib diikuti
const REQUIRED_CHATS = ['@PanoramaaStoree', '@CentralPanorama'];

// Cache hasil cek: userId -> { ok, ts }
const membershipCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

// Jika true: bila bot tidak punya hak (CHAT_ADMIN_REQUIRED) kita anggap sementara "lolos".
// Set ke false untuk mode ketat.
const ALLOW_IF_ADMIN_REQUIRED = false;

function normalizeErr(e) {
  return (e && (e.message || String(e))).toUpperCase();
}

async function checkMembership(api, userId, { force = false } = {}) {
  const now = Date.now();
  if (!force) {
    const cached = membershipCache.get(userId);
    if (cached && (now - cached.ts) < CACHE_TTL) {
      return cached.ok;
    }
  }

  let ok = true;
  for (const chat of REQUIRED_CHATS) {
    try {
      const member = await api.getChatMember(chat, userId);
      if (['left', 'kicked', 'restricted'].includes(member.status)) {
        ok = false;
        break;
      }
    } catch (e) {
      const em = normalizeErr(e);
      console.error('[ACCESS_GATE] getChatMember error', chat, e.message);
      if (ALLOW_IF_ADMIN_REQUIRED && em.includes('CHAT_ADMIN_REQUIRED')) {
        // Dianggap lolos untuk channel ini
        continue;
      }
      ok = false;
      break;
    }
  }

  membershipCache.set(userId, { ok, ts: now });
  return ok;
}

function buildGateKeyboard() {
  // Dua tombol JOIN DULU (masing-masing ke channel berbeda) + tombol cek ulang
  return new InlineKeyboard()
    .url('JOIN DULU', 'https://t.me/PanoramaaStoree')
    .url('JOIN DULU', 'https://t.me/CentralPanorama')
    .row()
    .text('✅ CEK ULANG', 'recheck_access');
}

const GATE_MESSAGE = `🔐 *Akses Dibatasi*

Untuk menggunakan bot ini, silakan *JOIN* dulu:
1. @PanoramaaStoree
2. @CentralPanorama

Setelah join, tekan tombol *✅ CEK ULANG* untuk verifikasi ulang.

Jika tombol tidak muncul, ketik /start.

Terima kasih!`;

function accessGate() {
  return async (ctx, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();

    const isCallback = !!ctx.callbackQuery;
    const data = ctx.callbackQuery?.data || '';
    const text = ctx.message?.text || '';
    const userId = ctx.from.id;

    const isStart = text.startsWith('/start');
    const isHelp = text === '💡 Bantuan';
    const isRecheckCallback = data === 'recheck_access';

    // Jika ini callback 'recheck_access', kita biarkan handler tujuannya tetap jalan.
    // Tapi kita akan tampilkan pesan gate lagi kalau memang masih belum join.
    // Jadi di sini kita tunda keputusan sampai setelah cek membership.
    const hasAccess = await checkMembership(ctx.api, userId);

    if (hasAccess) {
      return next();
    }

    // Belum punya akses:
    const kb = buildGateKeyboard();

    // Kalau ini callback selain 'recheck_access', tangkap dan jangan teruskan.
    if (isCallback && !isRecheckCallback) {
      try {
        await ctx.editMessageText(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      } catch {
        await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      }
      return;
    }

    // Jika callback 'recheck_access' tapi masih belum join → tampilkan lagi & TIDAK next
    if (isRecheckCallback) {
      try {
        await ctx.editMessageText(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      } catch {
        await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      }
      // Handler recheck_access di index.js akan tetap dipanggil (karena kita tidak return di sini)?
      // Kita sengaja RETURN agar handler khusus recheck yang lama tidak override lagi.
      return;
    }

    // Jika message biasa /start / bantuan, tetap kirim gate message
    if (isStart || isHelp) {
      await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      return;
    }

    // Pesan biasa lainnya — blok dan kirim gate
    await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  };
}

module.exports = {
  accessGate,
  checkMembership,
  REQUIRED_CHATS,
  membershipCache
};
