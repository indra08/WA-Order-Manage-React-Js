/**
 * waService.js
 * -----------------------------------------------------------------------
 * "System Monitor" - koneksi langsung ke WhatsApp memakai Baileys
 * (PRD bagian 17.1 Option 1 & 17.2: direkomendasikan untuk MVP/Development,
 * gratis, full control). Menggantikan integrasi provider berbayar
 * (DripSender) yang ada di draft PRD sebelumnya.
 *
 * Tanggung jawab modul ini:
 *  - Membuat koneksi WhatsApp Web (via QR code) & menjaganya tetap hidup
 *  - Menyediakan status koneksi + QR code untuk ditampilkan di dashboard
 *  - Menangkap semua pesan group masuk & meneruskannya ke webhookService
 *    lewat waMessageMapper (lihat file tsb untuk mapping format pesan)
 *  - Menyediakan daftar group WhatsApp yang diikuti akun ini, supaya admin
 *    tinggal pilih dari dashboard alih-alih input manual (PRD 38.5 STEP 1)
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const env = require('../config/env');
const logger = require('../utils/logger');
const { mapBaileysMessage } = require('./waMessageMapper');
const webhookService = require('./webhookService');

const STATUS = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  QR_READY: 'QR_READY',
  CONNECTED: 'CONNECTED',
};

let sock = null;
let status = STATUS.DISCONNECTED;
let currentQr = null;
let waUser = null;
let startingPromise = null;

async function start() {
  if (startingPromise) return startingPromise; // hindari start ganda bersamaan
  startingPromise = _start().finally(() => {
    startingPromise = null;
  });
  return startingPromise;
}

async function _start() {
  status = STATUS.CONNECTING;
  currentQr = null;

  try {
    await _startSocket();
  } catch (err) {
    status = STATUS.DISCONNECTED;
    logger.error('[baileys] Gagal memulai koneksi WhatsApp:', err.message);
    throw err;
  }
}

async function _startSocket() {
  fs.mkdirSync(env.baileysAuthDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(env.baileysAuthDir);

  // fetchLatestBaileysVersion butuh akses internet ke server versi Baileys.
  // Jika gagal (mis. tidak ada koneksi saat startup), tetap lanjut memakai
  // versi default yang sudah dibundel di package -- jangan sampai gagal total.
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (err) {
    logger.warn('[baileys] Gagal mengambil versi WhatsApp Web terbaru, memakai versi default:', err.message);
  }

  sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['WA Book Order System', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      status = STATUS.QR_READY;
      logger.info('[baileys] QR code baru tersedia. Buka dashboard -> menu "WhatsApp Connection" untuk scan.');
    }

    if (connection === 'open') {
      status = STATUS.CONNECTED;
      currentQr = null;
      waUser = sock.user || null;
      logger.info(`[baileys] Terhubung ke WhatsApp sebagai ${waUser ? waUser.id : 'unknown'}`);
    }

    if (connection === 'close') {
      status = STATUS.DISCONNECTED;
      currentQr = null;
      const statusCode =
        lastDisconnect && lastDisconnect.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : null;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn(`[baileys] Koneksi terputus (statusCode=${statusCode}). loggedOut=${loggedOut}`);

      if (loggedOut) {
        waUser = null;
      } else {
        // reconnect otomatis, sesuai PRD 41 "Reliability: retry logic"
        setTimeout(() => {
          start().catch((err) => logger.error('[baileys] Gagal reconnect:', err.message));
        }, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const payload = mapBaileysMessage(msg, waUser ? waUser.id : sock.user && sock.user.id);
        if (!payload) continue;
        webhookService.processWebhookEvent(payload);
      } catch (err) {
        logger.error('[baileys] Gagal memproses pesan masuk:', err.message);
      }
    }
  });
}

/**
 * Status koneksi untuk ditampilkan di dashboard. QR dikembalikan sebagai
 * data URL PNG (base64) supaya bisa langsung dipasang ke tag <img>.
 */
async function getStatus() {
  return {
    status,
    qrDataUrl: currentQr ? await QRCode.toDataURL(currentQr, { margin: 1, scale: 6 }) : null,
    waNumber: waUser ? waUser.id.split(':')[0].split('@')[0] : null,
    waName: waUser ? waUser.name || null : null,
  };
}

/** Daftar group WhatsApp yang diikuti akun ini (PRD 38.5 STEP 1). */
async function listWhatsappGroups() {
  if (!sock || status !== STATUS.CONNECTED) {
    const err = new Error('WhatsApp belum terhubung. Scan QR terlebih dahulu.');
    err.status = 409;
    throw err;
  }
  const map = await sock.groupFetchAllParticipating();
  return Object.values(map).map((g) => ({
    waGroupId: g.id,
    name: g.subject,
    participants: Array.isArray(g.participants) ? g.participants.length : null,
  }));
}

/** Putuskan koneksi & hapus sesi login, supaya bisa scan QR baru (akun berbeda). */
async function logout() {
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      logger.warn('[baileys] logout() error (diabaikan):', err.message);
    }
  }
  status = STATUS.DISCONNECTED;
  currentQr = null;
  waUser = null;
  sock = null;

  try {
    fs.rmSync(path.resolve(env.baileysAuthDir), { recursive: true, force: true });
  } catch (err) {
    logger.warn('[baileys] Gagal menghapus folder sesi:', err.message);
  }
}

module.exports = { start, getStatus, listWhatsappGroups, logout, STATUS };
