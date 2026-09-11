/**
 * postParser.js
 * -----------------------------------------------------------------------
 * Parsing teks posting buku sesuai PRD bagian 9 (Variasi Format Posting).
 * Sistem tidak boleh mengharuskan admin memakai template yang kaku, jadi
 * parser ini best-effort: field yang tidak terdeteksi akan bernilai null,
 * dan `originalText` SELALU disimpan apa adanya (lihat PRD bagian 11).
 * -----------------------------------------------------------------------
 */

const YOUTUBE_REGEX = /(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)[^\s]+)/i;

// Contoh yang harus tertangkap:
//   "BB/ Pop Up Learning All about Animals - 130k nett✨"
//   "BB Pop Up Learning All about Animals - 130k nett"  (tanpa slash)
//   "HC Usborne Lift the Flap QnA about Food - 140k nett✨"
//   "Nexus - 20k nett"  (tanpa prefix)
const HEADER_REGEX = /^([A-Za-z]{1,6})(?:\s*\/?\s*|\s+)(.+?)\s*-\s*(\d+(?:[.,]\d+)?)\s*(k|rb|ribu)?\s*(nett)?/i;

function parsePrice(rawNumber, unit) {
  const num = parseFloat(String(rawNumber).replace(',', '.'));
  if (Number.isNaN(num)) return null;
  if (unit && /^(k|rb|ribu)$/i.test(unit)) {
    return Math.round(num * 1000);
  }
  return Math.round(num);
}

/**
 * Mencoba mengekstrak catatan stok dari teks, contoh:
 * "Cuma nemu 1, yg tadi di ❌ bisa fix ulang"
 */
function extractStockNote(text) {
  const stockMatch = text.match(/(?:cuma|hanya|tersisa|sisa)\s*(?:nemu|ada)?\s*(\d+)/i);
  const retryAllowed = /fix ulang/i.test(text);
  return {
    stockNoteRaw: stockMatch ? stockMatch[0] : null,
    stockFromNote: stockMatch ? parseInt(stockMatch[1], 10) : null,
    retryAllowed,
  };
}

/**
 * @param {string} originalText - teks caption/posting asli dari WhatsApp
 * @returns {object} hasil parsing
 */
function parsePostText(originalText = '') {
  const text = String(originalText || '').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const headerLine = lines[0] || '';

  const headerMatch = headerLine.match(HEADER_REGEX);
  const previewMatch = text.match(YOUTUBE_REGEX);
  const stockNote = extractStockNote(text);

  const result = {
    prefix: null,
    title: null,
    price: null,
    priceRaw: null,
    isNett: false,
    previewUrl: previewMatch ? previewMatch[1] : null,
    additionalNote: null,
    stockFromNote: stockNote.stockFromNote,
    retryAllowed: stockNote.retryAllowed,
    originalText: text,
  };

  if (headerMatch) {
    result.prefix = headerMatch[1].toUpperCase();
    result.title = headerMatch[2].trim();
    result.priceRaw = headerMatch[3];
    result.price = parsePrice(headerMatch[3], headerMatch[4]);
    result.isNett = Boolean(headerMatch[5]);
  } else {
    // fallback: tidak match format standar, simpan baris pertama sebagai title
    result.title = headerLine || null;
  }

  // baris tambahan selain header/preview dianggap sebagai catatan admin
  const extraLines = lines.slice(1).filter(
    (l) => !YOUTUBE_REGEX.test(l) && !/^preview\s*:?/i.test(l)
  );
  if (extraLines.length) {
    result.additionalNote = extraLines.join(' ');
  }

  return result;
}

module.exports = { parsePostText, parsePrice };
