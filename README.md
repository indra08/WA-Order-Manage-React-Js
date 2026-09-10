# WhatsApp Group Book Order Management System
### Web Admin + System Monitor dalam **1 project Node.js** — database **SQLite lokal**, terhubung ke WhatsApp lewat **Baileys** (scan QR, gratis, tanpa provider berbayar)

Project ini adalah implementasi MVP dari PRD *WhatsApp Group Book Order
Management System*. Web Admin (PRD 38.2.A) dan System Monitor (PRD 38.2.B)
digabung jadi satu aplikasi Express.js di satu port. Data disimpan di
**file SQLite sungguhan** (`data/app.db`), dan koneksi ke WhatsApp memakai
**Baileys** (PRD 17.1 Option 1) — cukup scan QR code dari dashboard, tidak
perlu API key atau langganan provider pihak ketiga.

> **Requirement penting: Node.js >= 22.13.0**
> Database memakai modul bawaan Node.js `node:sqlite` (tanpa native addon,
> tanpa `npm install` yang butuh compiler C++). Modul ini baru tersedia
> tanpa flag mulai Node.js 22.13 / 23.4. Cek versi Anda dengan `node -v`.
> Jika versi lebih lama, lihat bagian 3 untuk cara ganti ke `better-sqlite3`.

```
/api/admin/whatsapp/... -> koneksi WhatsApp (status, QR, daftar group, logout)
/api/admin/...           -> Web Admin (group, buku, incoming replies, invoice, reports)
/api/monitor/...         -> System Monitor (health, stats, webhook simulasi/testing)
/api/customer/...        -> Customer check (publik, tanpa token)
/                        -> Dashboard admin (SPA statis di folder /public)
```

## ⚠️ Catatan Jujur Soal Status Pengujian

Kode ini ditulis & diuji di lingkungan **tanpa akses internet**, sehingga:

- ✅ **Sudah diuji dan dipastikan benar**: seluruh business logic (parsing
  posting, deteksi intent, confirm/reject/fix-ulang, generate kode, rekap
  tagihan), mapping format pesan Baileys → payload internal, **dan
  database SQLite** (CRUD penuh + persistensi lintas restart proses sudah
  diverifikasi dengan file `.db` sungguhan).
- ❓ **Belum bisa diuji langsung** (butuh internet + WhatsApp sungguhan):
  apakah `makeWASocket()` benar-benar berhasil connect ke server WhatsApp,
  dan apakah QR yang muncul valid saat di-scan. Kode mengikuti pola resmi
  terbaru dari dokumentasi `@whiskeysockets/baileys` (sudah dicek ulang
  saat ini juga), tapi tetap perlu Anda coba jalankan sendiri untuk
  konfirmasi akhir.
- Jika saat `npm start` ada error terkait koneksi WhatsApp, salin pesan
  errornya dan saya bantu debug.

## 1. Menjalankan Project

```bash
npm install
cp .env.example .env
# edit .env, minimal ganti ADMIN_TOKEN

npm run seed     # opsional: isi data contoh (group & buku)
npm start         # jalan di http://localhost:3000
```

Buka `http://localhost:3000`, isi **Admin Token** (sesuai `.env`) di sidebar
kiri bawah lalu klik **Simpan**.

## 2. Menghubungkan WhatsApp (Scan QR)

1. Buka menu **WhatsApp Connection** di sidebar.
2. Klik **Hubungkan / Refresh QR** — QR code akan muncul dalam beberapa detik
   (dashboard otomatis polling status setiap 3 detik).
3. Di HP: **WhatsApp → Setelan → Perangkat Tertaut → Tautkan Perangkat**, lalu
   scan QR di layar.
4. Setelah status berubah menjadi **Terhubung**, session tersimpan otomatis
   di folder `data/baileys_auth/` sehingga tidak perlu scan ulang setiap
   restart server.
5. Di kartu **Group WhatsApp Terdeteksi**, klik **Daftarkan & Aktifkan**
   pada group yang ingin dimonitor sistem — group langsung aktif dan siap
   menangkap posting buku, reply customer, dan reaksi ✅/❌ admin.

> Gunakan nomor WhatsApp **khusus admin toko** untuk konek (bukan nomor
> pribadi utama), karena semua pesan/reaction yang dikirim dari nomor ini
> di dalam group yang dimonitor akan diproses sebagai aksi admin (posting
> buku / konfirmasi order). Baileys bukan API resmi WhatsApp (reverse-
> engineered) — pakai nomor cadangan dulu untuk uji coba, ada risiko kecil
> nomor kena flag jika dianggap aktivitas mencurigakan oleh WhatsApp.

Tombol **Putuskan Sesi** akan logout dan menghapus session tersimpan,
berguna jika ingin ganti nomor WhatsApp yang terhubung.

## 3. Database SQLite

Semua data (group, buku, posting, customer, reply/order) disimpan di
**`data/app.db`** — file SQLite asli, bisa dibuka dengan tool apa pun
seperti [DB Browser for SQLite](https://sqlitebrowser.org/) atau CLI
`sqlite3 data/app.db`.

Implementasinya memakai modul bawaan Node.js `node:sqlite`
(`src/lib/sqliteDb.js`) — **tanpa dependency npm tambahan**, tanpa native
compile. Tiap collection (`groups`, `books`, `posts`, `customers`,
`replies`) adalah 1 tabel SQL dengan kolom `id`/`createdAt`/`updatedAt`
asli (bisa diindeks & di-query SQL biasa), sementara field lain disimpan
sebagai JSON di kolom `data` karena bentuknya fleksibel antar record.

**Jika Node.js Anda lebih lama dari 22.13** (`node:sqlite` belum tersedia
tanpa flag), ada 2 opsi:
1. Jalankan dengan flag: `node --experimental-sqlite src/server.js`
   (Node 22.5 - 22.12 / 23.0 - 23.3).
2. Upgrade Node.js ke versi 22.13+ (disarankan — LTS terbaru).
3. Atau ganti ke `better-sqlite3` (native addon, butuh build tools):
   `npm install better-sqlite3`, lalu sesuaikan `src/lib/sqliteDb.js`
   memakai API `better-sqlite3` (mirip, tinggal ganti `require('node:sqlite')`
   menjadi `require('better-sqlite3')` dan sesuaikan pemanggilan `.prepare()`).

## 4. Struktur Folder

```
src/
  server.js                entry point, menggabungkan semua route + auto-connect Baileys
  config/env.js             load environment variables
  db/store.js                koleksi data (groups, books, posts, customers, replies)
  lib/sqliteDb.js             datastore SQLite asli (node:sqlite bawaan Node.js)
  services/
    waService.js             koneksi WhatsApp via Baileys (QR, status, daftar group, logout)
    waMessageMapper.js        mapping pesan Baileys -> payload event ternormalisasi
    postParser.js             parsing teks posting buku (format bebas, PRD bag. 9)
    intentDetector.js          deteksi purchase intent + quantity (PRD bag. 13-14)
    orderService.js            lifecycle status reply, confirm/reject/fix-ulang (PRD bag. 4-8, 25)
    invoiceService.js          rekap tagihan per customer (PRD bag. 16, 18)
    webhookService.js          distribusi event (book publication/reply/reaction) ke orderService
  middleware/
    auth.js                   proteksi endpoint admin (header x-admin-token)
    errorHandler.js
  routes/
    admin/                    Web Admin API (termasuk whatsapp.routes.js)
    monitor/                   System Monitor API (health, stats, webhook simulasi)
    customer/                  Customer check API (publik)
public/                      dashboard admin — sidebar layout, HTML/CSS/JS vanilla
scripts/seed.js              data contoh
data/app.db                  file database SQLite (dibuat otomatis, jangan di-commit)
data/baileys_auth/           session login WhatsApp (dibuat otomatis, JANGAN di-commit/share)
```

## 5. Konsep Bisnis yang Diimplementasikan

- **Reply customer BUKAN otomatis order diterima** (PRD 4.1). Reply seperti
  `Fix`/`Mau` hanya dianggap `PURCHASE_INTENT` dan masuk status
  `WAITING_STOCK_CHECK`. Order baru dianggap diterima setelah admin
  memberi reaksi ✅ di WhatsApp (atau klik **Confirm** di dashboard).
- **✅ = business confirmation**, buku masuk tagihan (`includeInInvoice: true`,
  status `INVOICED`), stok otomatis berkurang.
- **❌ = REJECTED**, `includeInInvoice: false`, tidak masuk rekapan.
- **Fix ulang**: reply yang `REJECTED` bisa dipicu ulang lewat tombol
  **Fix Ulang**, membuat reply baru yang tetap terhubung (`retryOfReplyId`)
  ke reply asal — histori tetap tertelusuri (PRD 8, 25).
- **Kode Generation**: 4 digit terakhir nomor HP, upgrade ke 5 digit jika
  ada duplikasi di group yang sama (PRD 15.4).
- **Original text posting selalu disimpan apa adanya**, walau parser tidak
  berhasil mengekstrak semua field (PRD 11).

## 6. Alur Data: WhatsApp → Sistem

```
Pesan masuk di group WA (via Baileys, event messages.upsert)
        │
        ▼
waMessageMapper.mapBaileysMessage()   -> payload ternormalisasi
        │        (image_with_caption | text | reaction)
        ▼
webhookService.processWebhookEvent()  -> deteksi jenis event
        │
        ├─ image_with_caption -> postParser -> books/posts (posting buku)
        ├─ text + reply        -> intentDetector -> orderService.receiveReply()
        └─ reaction ✅/❌       -> orderService.confirmReply() / rejectReply()
```

Alur yang sama juga dipakai oleh endpoint `/api/monitor/webhook` (lihat
bagian 7) sehingga logic bisnis hanya ditulis sekali.

## 7. Menguji Tanpa WhatsApp Sungguhan (Simulasi)

Jika belum sempat scan QR, seluruh alur bisa dites lewat endpoint simulasi
`/api/monitor/webhook` (dilindungi `x-admin-token`, format payload sama
seperti yang dihasilkan `waMessageMapper`):

```bash
# a. Simulasikan posting buku
curl -X POST http://localhost:3000/api/monitor/webhook \
  -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "group_id": "1203630xxxx@g.us",
    "sender": { "name": "Admin Toko" },
    "message": { "id": "MSG_100", "type": "image_with_caption",
      "caption": "BB/ Pop Up Learning All about Animals - 130k nett✨",
      "timestamp": "2026-09-09T07:00:00Z" }
  }'

# b. Simulasikan reply customer "Fix"
curl -X POST http://localhost:3000/api/monitor/webhook \
  -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "group_id": "1203630xxxx@g.us",
    "sender": { "name": "Sintha", "phone": "6281234567890" },
    "message": { "id": "MSG_101", "type": "text", "text": "Fix", "timestamp": "2026-09-09T07:05:00Z" },
    "reply_to": "MSG_100"
  }'

# c. Simulasikan admin memberi reaksi ✅
curl -X POST http://localhost:3000/api/monitor/webhook \
  -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "group_id": "1203630xxxx@g.us",
    "sender": { "name": "Admin Toko" },
    "message": { "id": "MSG_102", "type": "reaction", "reaction": "✅", "timestamp": "2026-09-09T07:06:00Z" },
    "reply_to": "MSG_101"
  }'
```

Catatan: untuk endpoint `image_with_caption`, buku baru dibuat dengan
`stock: 0` kecuali caption mengandung catatan stok (mis. "cuma nemu 1").
Set stok awal buku lewat menu **Buku** di dashboard atau
`PATCH /api/admin/books/:id/stock` sebelum melakukan `confirm`.

Admin juga bisa melakukan confirm/reject/fix-ulang langsung lewat dashboard
(menu **Incoming Replies**) tanpa lewat webhook maupun WhatsApp sama sekali.

### d. Customer cek rekapan
```bash
curl "http://localhost:3000/api/customer/check?group=Group%206&code=7890"
```

## 8. Menjalankan dengan Docker

```bash
cp .env.example .env
docker compose up --build
```

Folder `data/` (termasuk `data/baileys_auth/`) di-mount sebagai volume
supaya session WhatsApp tidak hilang saat container di-restart.

## 9. Migrasi ke Database Production

SQLite (`data/app.db`) sudah merupakan database sungguhan dan cukup kuat
untuk skala 1 toko/beberapa group WhatsApp (SQLite dipakai banyak aplikasi
production untuk beban serupa). Jika skala berkembang jauh lebih besar
(banyak instance paralel, ratusan group aktif bersamaan) dan sesuai
rekomendasi PRD (PostgreSQL + Redis + Google Sheets sync):

1. Ganti `src/lib/sqliteDb.js` / `src/db/store.js` dengan koneksi
   Prisma/Knex ke PostgreSQL — interface `collection()`
   (`all/find/insert/update/remove/query`) di `services/*.js` sengaja
   dibuat sederhana agar mudah diganti tanpa menyentuh business logic.
2. Tambahkan job/queue (Bull + Redis) untuk sinkronisasi ke Google Sheet
   sesuai PRD bag. 38.3 & 38.5 STEP 3.
3. Tambahkan proses backup terjadwal untuk `data/app.db` dan
   `data/baileys_auth/` (PRD 38.8) — untuk SQLite, cukup salin file
   `.db` saat aplikasi idle, atau pakai perintah `VACUUM INTO`.

## 10. Memisahkan Kembali Menjadi 2 Service (jika load membesar)

Karena struktur `routes/admin`, `routes/monitor`, dan `services/*` sudah
modular, project ini bisa dipecah kembali menjadi 2 proses terpisah
(seperti desain awal PRD 38.1):

1. Buat 2 entry point (`admin-server.js` dan `monitor-server.js`).
2. `waService.js` (koneksi Baileys) sebaiknya tetap berjalan di proses
   "monitor" saja — proses "admin" cukup memanggil API-nya lewat HTTP
   internal atau message queue.
3. Ganti `src/db/store.js` agar menunjuk ke database eksternal yang sama
   supaya kedua proses tetap berbagi data.

## 11. Catatan Keamanan

- Semua endpoint `/api/admin/*` (termasuk `/api/admin/whatsapp/*` dan
  webhook simulasi di `/api/monitor/webhook`) wajib header `x-admin-token`.
- Endpoint `/api/customer/check` sengaja publik (tanpa token) sesuai PRD
  bag. 16, karena dipakai customer langsung.
- **Jangan pernah membagikan folder `data/baileys_auth/`** — folder ini
  berisi kredensial sesi WhatsApp yang aktif, setara dengan akses login
  penuh ke akun WhatsApp tersebut.
- QR code yang ditampilkan di dashboard hanya valid beberapa puluh detik
  dan otomatis diperbarui oleh Baileys selama status masih `QR_READY`.
