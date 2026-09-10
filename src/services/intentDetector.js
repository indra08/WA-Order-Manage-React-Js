/**
 * intentDetector.js
 * -----------------------------------------------------------------------
 * Rule-based purchase intent detection sesuai PRD bagian 13 & 14.
 *
 * PENTING (PRD bagian 4.1): reply customer BUKAN otomatis order diterima.
 * Fungsi ini hanya menentukan apakah reply *mengindikasikan* customer mau
 * pesan (PURCHASE_INTENT) atau bukan (NOT_ORDER). Keputusan akhir order
 * diterima/ditolak tetap di tangan admin melalui orderService.
 * -----------------------------------------------------------------------
 */

const PURCHASE_INTENT_KEYWORDS = [
  'fix',
  'mau ya',
  'mau',
  'pesan',
  'ambil satu',
  'ambil',
  'ikut',
  'yes',
  'saya mau',
];

function detectPurchaseIntent(message) {
  const lower = String(message || '').toLowerCase().trim();
  if (!lower) return false;
  return PURCHASE_INTENT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Ambil quantity dari teks reply. Default 1 jika tidak disebutkan.
 * Contoh: "Fix 2" -> 2, "Mau 3" -> 3, "Fix" -> 1
 */
function extractQuantity(message) {
  const lower = String(message || '').toLowerCase().trim();
  const match = lower.match(/(?:fix|mau|ambil|pesan)\D{0,10}?(\d+)/i) || lower.match(/\b(\d+)\b/);
  if (match) {
    const qty = parseInt(match[1], 10);
    if (Number.isFinite(qty) && qty > 0) return qty;
  }
  return 1;
}

/**
 * @param {string} message
 * @returns {{intent: 'PURCHASE_INTENT'|'NOT_ORDER', quantity: number}}
 */
function analyzeReply(message) {
  const isPurchaseIntent = detectPurchaseIntent(message);
  return {
    intent: isPurchaseIntent ? 'PURCHASE_INTENT' : 'NOT_ORDER',
    quantity: isPurchaseIntent ? extractQuantity(message) : null,
  };
}

module.exports = { analyzeReply, detectPurchaseIntent, extractQuantity, PURCHASE_INTENT_KEYWORDS };
