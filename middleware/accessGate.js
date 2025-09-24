const { InlineKeyboard } = require('grammy');

// Pastikan ejaan benar
const REQUIRED_CHATS = ['@PanoramaaStoree', '@CentralPanorama'];

// Cache hasil cek
const membershipCache = new Map();
// Perketat deteksi: TTL kecil agar cepat terbaca saat user berinteraksi lagi
const CACHE_TTL = 60 * 1000; // 60 detik

// Longgar jika bot bukan admin channel (biarkan false untuk mode ketat)
const ALLOW_IF_ADMIN_REQUIRED = false;

// Daftar user yang pernah lolos (untuk re-check berkala)
const knownUsers = new Set();

function buildGateKeyboard() {
  return new InlineKeyboard()
    .url('JOIN DULU', 'https://t.me/PanoramaaStoree')
    .url('JOIN DULU', 'https://t.me/CentralPanorama')
    .row()
    .text('✅ CEK ULANG', 'recheck_access');
}

async function rawStatus(api, chat, userId) {
  try {
    const m = await api.getChatMember(chat, userId);
    return { chat, ok: !['left','kicked','restricted'].includes(m.status), status: m.status, error: null };
  } catch (e) {
    const em = (e.message || String(e)).toUpperCase();
    if (ALLOW_IF_ADMIN_REQUIRED && em.includes('CHAT_ADMIN_REQUIRED')) {
      return { chat, ok: true, status: 'ASSUMED_OK', error: 'CHAT_ADMIN_REQUIRED' };
    }
    return { chat, ok: false, status: 'ERROR', error: e.message };
  }
}

async function checkMembership(api, userId, { force = false, collect = false } = {}) {
  const now = Date.now();
  if (!force) {
    const cached = membershipCache.get(userId);
    if (cached && (now - cached.ts) < CACHE_TTL) {
      return collect ? { ok: cached.ok, details: cached.details } : cached.ok;
    }
  }

  const details = [];
  let ok = true;
  for (const chat of REQUIRED_CHATS) {
    const st = await rawStatus(api, chat, userId);
    details.push(st);
    if (!st.ok) ok = false;
  }

  membershipCache.set(userId, { ok, ts: now, details });
  if (ok) knownUsers.add(userId);
  return collect ? { ok, details } : ok;
}

const GATE_MESSAGE = `🔐 *Akses Dibatasi* 🔐

Untuk menggunakan bot ini, silakan *JOIN* dulu:
1. @PanoramaaStoree
2. @CentralPanorama

Setelah join, tekan tombol *✅ CEK ULANG* untuk verifikasi ulang.

Kalau tombol tidak muncul / masih gagal:
- Pastikan ejaan channel benar
- Tekan lagi /start

Terima kasih!`;

function accessGate() {
  return async (ctx, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();

    const userId = ctx.from.id;
    const isCallback = !!ctx.callbackQuery;
    const data = ctx.callbackQuery?.data || '';
    const text = ctx.message?.text || '';
    const isStart = text.startsWith('/start');
    const isHelp = text === '💡 Bantuan';
    const isRecheck = data === 'recheck_access';

    // Jika callback recheck: hapus cache & teruskan agar handler khusus memaksa cek ulang
    if (isRecheck) {
      membershipCache.delete(userId);
      return next();
    }

    const hasAccess = await checkMembership(ctx.api, userId);
    if (hasAccess) {
      knownUsers.add(userId);
      return next();
    }

    // Belum punya akses -> kirim ajakan join
    const kb = buildGateKeyboard();

    if (isCallback) {
      try {
        await ctx.editMessageText(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      } catch {
        await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      }
      return;
    }

    if (isStart || isHelp) {
      await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
      return;
    }

    await ctx.reply(GATE_MESSAGE, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  };
}

// Debug helper (dipanggil manual oleh command)
async function debugMembership(api, userId) {
  const { ok, details } = await checkMembership(api, userId, { force: true, collect: true });
  return { ok, details };
}

module.exports = {
  accessGate,
  checkMembership,
  debugMembership,
  REQUIRED_CHATS,
  membershipCache,
  knownUsers,
  buildGateKeyboard,
  GATE_MESSAGE
};
