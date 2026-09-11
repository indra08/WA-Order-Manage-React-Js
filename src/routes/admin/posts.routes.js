/**
 * Web Admin — Post Data Model (PRD bagian 11 & 15.3 Multiple Posts)
 */
const express = require('express');
const { posts, books, groups } = require('../../db/store');

const router = express.Router();

router.get('/', (req, res) => {
  const { groupId, bookId } = req.query;
  let result = posts.all();
  if (groupId) result = result.filter((p) => p.groupId === groupId);
  if (bookId) result = result.filter((p) => p.bookId === bookId);

  const enriched = result
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .map((p) => ({
      ...p,
      book: p.bookId ? books.find(p.bookId) : null,
      group: groups.find(p.groupId),
    }));
  res.json(enriched);
});

router.get('/:id', (req, res) => {
  const post = posts.find(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });
  res.json({ ...post, book: post.bookId ? books.find(post.bookId) : null });
});

// POST /api/admin/posts - Buat posting baru (tanpa WhatsApp)
router.post('/', (req, res) => {
  const { groupId, bookId, title, prefix, price, originalText, stock, image, previewUrl, additionalNote } = req.body;
  
  if (!groupId) return res.status(400).json({ error: 'Field "groupId" wajib diisi' });
  
  const group = groups.find(groupId);
  if (!group) return res.status(404).json({ error: 'Group tidak ditemukan' });
  
  let book = null;
  
  // Jika bookId diberikan, gunakan buku yang sudah ada
  if (bookId) {
    book = books.find(bookId);
    if (!book) return res.status(404).json({ error: 'Buku tidak ditemukan' });
  }
  // Jika title diberikan tanpa bookId, cari atau buat buku baru
  else if (title) {
    const normalizedTitle = title.trim().toLowerCase();
    book = books.findOne((b) => b.title.trim().toLowerCase() === normalizedTitle);
    
    if (!book) {
      // Buat buku baru
      book = books.insert({
        title: title,
        prefix: prefix || null,
        price: price || null,
        nettPrice: price || null,
        stock: stock ?? 0,
        status: 'Active',
      });
    } else if (price) {
      // Update harga jika buku sudah ada
      book = books.update(book.id, { 
        nettPrice: price,
        prefix: prefix || book.prefix,
        stock: stock !== undefined ? stock : book.stock,
      });
    }
  }
  
  // Format originalText: "BB Nexus - 20k" atau "Nexus - 20k" (tanpa prefix, tanpa slash)
  let priceDisplay = '';
  if (price) {
    if (price >= 1000) {
      priceDisplay = Math.round(price / 1000) + 'k';
    } else {
      priceDisplay = String(price);
    }
  }
  
  let textPrefix = prefix || '';
  const post = posts.insert({
    groupId,
    bookId: book ? book.id : null,
    admin: 'admin',
    postedAt: new Date().toISOString(),
    originalText: originalText || (title ? `${textPrefix}${textPrefix ? ' ' : ''}${title} - ${priceDisplay} nett`.trim() : ''),
    image: image || null,
    previewUrl: previewUrl || null,
    priceSnapshot: price || (book ? book.nettPrice : null),
    stockSnapshot: stock !== undefined ? stock : (book ? book.stock : null),
    additionalNote: additionalNote || null,
    retryAllowed: false,
    status: 'Active',
  });
  
  res.status(201).json({
    ...post,
    book: book ? { id: book.id, title: book.title, prefix: book.prefix, price: book.nettPrice, stock: book.stock } : null,
  });
});

module.exports = router;
