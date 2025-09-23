const { InlineKeyboard } = require('grammy');
const { mainMenu } = require('../utils/menu');

// Daftar channel / grup yang wajib diikuti
// Gunakan username publik (awali dengan @). Jika perlu pakai ID (misal -1001234567890) juga bisa dicampur.
const REQUIRED_CHATS = ['@PanoramaaStoree', '@CentralPanorama'];

// Cache hasil pengecekan: Map<userId, { ok: boolean, ts: number }>
const membershipCache = new Map();

// Durasi cache dalam ms
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

async function checkMembership(api, userId) {
  // Cek cache
  const now = Date.now();
  const cached = membershipCache.get(userId);
  if (cached && (now - cached.ts) < CACHE_TTL) {
    return cached.ok;
  }

  let ok = true;
  for (const chat of REQUIRED_CHATS) {
    try {
      const member = await api.getChatMember(chat, userId);
      // status yang dianggap belum join
      if (['left', 'kicked', 'restricted'].includes(member.status)) {
        ok = false;
        break;
      }
    } catch (e) {
      // Kalau gagal (misal bot tidak punya hak), kita anggap belum memenuhi
      console.error('[ACCESS_GATE] getChatMember error', chat, e.message);
      ok = false;
      break;
    }
  }

  membershipCache.set(userId, { ok, ts: now });
  return ok;
}

function accessGate() {
  return async (ctx, next) => {
    // Hanya gate chat private & pesan/command user
    if (!ctx.from || ctx.chat?.type !== 'private') {
      return next();
    }

    const text = ctx.message?.text || ctx.callbackQuery?.data || '';
    const userId = ctx.from.id;

    // Command /start selalu boleh lewat agar bisa memicu tampilan awal,
    // tapi tetap akan diblok (tidak lanjut next) kalau belum join (kita ganti respon).
    // Handler “💡 Bantuan” juga bisa tetap terlihat.
    const isStart = text.startsWith('/start');
    const allowedPreJoin = isStart || text === '💡 Bantuan';

    const hasAccess = await checkMembership(ctx.api, userId);
    if (hasAccess) {
      return next();
    }

    // Jika tidak punya akses: kirim pesan join + tombol
    const kb = new InlineKeyboard()
      .url('📢 Channel Panorama', 'https://t.me/PanoramaaStoree')
      .url('💬 Central Panorama', 'https://t.me/CentralPanorama')
      .row()
      .text('✅ Sudah Join', 'recheck_access');

    const msg =
`🔐 *Akses Dibatasi*

Untuk menggunakan bot ini, silakan *JOIN* dulu:
1. @PanoramaaStoree
2. @CentralPanorama

Setelah join, tekan tombol *✅ Sudah Join* untuk verifikasi ulang.

Jika tombol tidak muncul, ketik /start.

Terima kasih!`;

    // Jika ini callback, edit saja (agar tidak spam)
    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb });
      } catch {
        await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
      }
      if (!allowedPreJoin) {
        return; // Stop
      }
      return; // jangan next karena belum lolos
    }

    // Untuk message baru
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });

    // Jangan proses handler lain jika belum join
    return;
  };
}

module.exports = {
  accessGate,
  checkMembership,
  REQUIRED_CHATS,
  membershipCache
};
