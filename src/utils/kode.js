/**
 * kode.js
 * -----------------------------------------------------------------------
 * Implementasi "Kode Generation" sesuai PRD bagian 15.4:
 *  - Default: 4 digit terakhir nomor telepon
 *  - Jika terjadi duplikasi dengan nomor lain di group yang sama: naik ke 5 digit
 * -----------------------------------------------------------------------
 */

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

/**
 * Menghitung kode unik customer di dalam satu group, berdasarkan
 * daftar customer lain yang sudah ada di group tersebut.
 *
 * @param {string} phone - nomor HP customer baru/yang dicek
 * @param {Array<{phone:string, code:string}>} existingCustomersInGroup
 * @returns {string} kode 4 atau 5 digit
 */
function generateCode(phone, existingCustomersInGroup = []) {
  const normalized = normalizePhone(phone);
  const code4 = normalized.slice(-4);

  const conflict4 = existingCustomersInGroup.find(
    (c) => normalizePhone(c.phone) !== normalized && normalizePhone(c.phone).slice(-4) === code4
  );

  if (!conflict4) {
    return code4;
  }

  // Terjadi duplikasi 4 digit terakhir -> gunakan 5 digit untuk yang baru
  return normalized.slice(-5);
}

module.exports = { generateCode, normalizePhone };
