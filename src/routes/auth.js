const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.query('SELECT id, username, password, role FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Current user
router.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

// List users (admin)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const result = await db.query('SELECT id, username, role, created_at FROM users ORDER BY id');
  res.json(result.rows);
});

// Create user (admin)
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const hash = bcrypt.hashSync(password, 10);
    await db.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, hash, role || 'viewer']);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.code === '23505' ? 'Username already exists' : e.message });
  }
});

// Delete user (admin)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.session.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  res.json({ ok: true });
});

// Change password
router.put('/users/:id/password', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const { password } = req.body;
  if (!password || password.length < 3) return res.status(400).json({ error: 'Password too short' });
  const hash = bcrypt.hashSync(password, 10);
  await db.query('UPDATE users SET password = $1 WHERE id = $2', [hash, userId]);
  res.json({ ok: true });
});

module.exports = router;
