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

module.exports = router;
