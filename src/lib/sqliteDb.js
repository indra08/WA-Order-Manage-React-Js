/**
 * sqliteDb.js
 * -----------------------------------------------------------------------
 * Datastore berbasis SQLite SUNGGUHAN (file .db, ACID, WAL) memakai modul
 * bawaan Node.js `node:sqlite` (tersedia sejak Node.js 22.5+, tanpa flag
 * sejak Node.js 22.13 / 23.4 — lihat README bagian "Requirement Node.js").
 * Tidak butuh native addon/compile (beda dengan better-sqlite3), sehingga
 * `npm install` tetap ringan dan tidak butuh build tools (python/gcc/dll).
 *
 * Setiap "collection" (groups, books, posts, customers, replies) disimpan
 * sebagai 1 tabel SQL dengan kolom id/createdAt/updatedAt asli (bisa
 * diindeks & di-query lewat SQL biasa), sementara sisa field disimpan
 * sebagai JSON di kolom `data` -- karena bentuk field tiap record cukup
 * fleksibel (mis. hasil parsing posting yang field-nya bisa null/beda-beda).
 * Ini tetap database SQLite yang valid & bisa dibuka dengan tool SQLite
 * apa pun (DB Browser for SQLite, `sqlite3 data/app.db`, dst).
 *
 * Interface Collection (all/find/findOne/query/insert/update/remove/count)
 * SENGAJA dibuat identik dengan implementasi lama (jsonDb.js) supaya semua
 * service (orderService, webhookService, invoiceService, reports, dst)
 * tidak perlu diubah sama sekali.
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

class Collection {
  constructor(rawDb, name) {
    this.raw = rawDb;
    this.name = name;

    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS "${name}" (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    this.raw.exec(`CREATE INDEX IF NOT EXISTS "idx_${name}_createdAt" ON "${name}" (createdAt)`);

    this._selectAll = this.raw.prepare(`SELECT id, data, createdAt, updatedAt FROM "${name}" ORDER BY createdAt ASC`);
    this._selectOne = this.raw.prepare(`SELECT id, data, createdAt, updatedAt FROM "${name}" WHERE id = ?`);
    this._insertStmt = this.raw.prepare(`INSERT INTO "${name}" (id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?)`);
    this._updateStmt = this.raw.prepare(`UPDATE "${name}" SET data = ?, updatedAt = ? WHERE id = ?`);
    this._deleteStmt = this.raw.prepare(`DELETE FROM "${name}" WHERE id = ?`);
    this._countStmt = this.raw.prepare(`SELECT COUNT(*) as c FROM "${name}"`);
  }

  _rowToRecord(row) {
    if (!row) return null;
    const rest = JSON.parse(row.data);
    return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, ...rest };
  }

  all() {
    return this._selectAll.all().map((row) => this._rowToRecord(row));
  }

  find(id) {
    if (!id) return null;
    return this._rowToRecord(this._selectOne.get(id));
  }

  findOne(predicate) {
    return this.all().find(predicate) || null;
  }

  query(predicate) {
    return this.all().filter(predicate);
  }

  insert(record) {
    const now = new Date().toISOString();
    const id = record.id || randomUUID();
    const createdAt = record.createdAt || now;
    const updatedAt = now;
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = record;

    this._insertStmt.run(id, JSON.stringify(rest), createdAt, updatedAt);
    return { id, createdAt, updatedAt, ...rest };
  }

  update(id, patch) {
    const existing = this.find(id);
    if (!existing) return null;

    const { id: _ei, createdAt: existingCreatedAt, updatedAt: _eu, ...existingRest } = existing;
    const { id: _pi, createdAt: _pc, updatedAt: _pu, ...patchRest } = patch || {};
    const merged = { ...existingRest, ...patchRest };
    const updatedAt = new Date().toISOString();

    this._updateStmt.run(JSON.stringify(merged), updatedAt, id);
    return { id, createdAt: existingCreatedAt, updatedAt, ...merged };
  }

  remove(id) {
    const result = this._deleteStmt.run(id);
    return result.changes > 0;
  }

  count(predicate) {
    if (predicate) return this.query(predicate).length;
    return this._countStmt.get().c;
  }
}

class SqliteDb {
  constructor(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.filePath = filePath;
    this.raw = new DatabaseSync(filePath);
    // WAL = tulis lebih aman & lebih cepat untuk beban baca/tulis campuran
    this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec('PRAGMA busy_timeout = 5000');

    this._collections = {};
  }

  collection(name) {
    if (!this._collections[name]) {
      this._collections[name] = new Collection(this.raw, name);
    }
    return this._collections[name];
  }

  close() {
    this.raw.close();
  }
}

module.exports = { SqliteDb };
