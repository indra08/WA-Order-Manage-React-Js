/**
 * Web Admin — Product/Book Data Model (PRD bagian 10, 26 Stock Management)
 */
const express = require('express');
const { books } = require('../../db/store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(books.all());
});

router.get('/:id', (req, res) => {
  const book = books.find(req.params.id);
  if (!book) return res.status(404).json({ error: 'Buku tidak ditemukan' });
  res.json(book);
});

router.post('/', (req, res) => {
  const { title, publisher, prefix, isbn, price, nettPrice, image, previewUrl, description, stock } = req.body;
  if (!title) return res.status(400).json({ error: 'Field "title" wajib diisi' });

  const book = books.insert({
    title,
    publisher: publisher || null,
    prefix: prefix || null,
    isbn: isbn || null,
    price: price ?? null,
    nettPrice: nettPrice ?? price ?? null,
    image: image || null,
    previewUrl: previewUrl || null,
    description: description || null,
    stock: stock ?? 0,
    status: 'Active',
  });
  res.status(201).json(book);
});

router.put('/:id', (req, res) => {
  const book = books.find(req.params.id);
  if (!book) return res.status(404).json({ error: 'Buku tidak ditemukan' });
  res.json(books.update(req.params.id, req.body));
});

// PATCH /api/admin/books/:id/stock  { stock: number }
router.patch('/:id/stock', (req, res) => {
  const book = books.find(req.params.id);
  if (!book) return res.status(404).json({ error: 'Buku tidak ditemukan' });
  if (typeof req.body.stock !== 'number') {
    return res.status(400).json({ error: 'Field "stock" harus berupa number' });
  }
  res.json(books.update(req.params.id, { stock: req.body.stock }));
});

module.exports = router;
