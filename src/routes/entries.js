const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// List / Search entries
router.get('/', requireAuth, async (req, res) => {
  try {
    const { act, type, chapter, search, limit = 500, offset = 0 } = req.query;
    let sql = 'SELECT * FROM entries WHERE 1=1';
    const params = [];
    let idx = 1;

    if (act) { sql += ` AND act = $${idx++}`; params.push(act); }
    if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
    if (chapter) { sql += ` AND chapter = $${idx++}`; params.push(chapter); }
    if (search) {
      sql += ` AND (
        title ILIKE $${idx} OR number ILIKE $${idx} OR sub ILIKE $${idx}
        OR content ILIKE $${idx} OR act ILIKE $${idx}
        OR tags::text ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx++;
    }
    sql += ` ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single entry
router.get('/:id', requireAuth, async (req, res) => {
  const result = await db.query('SELECT * FROM entries WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// Create entry (admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id, act, type, chapter, number, title, sub, content, links, tags } = req.body;
    if (!number || !title) return res.status(400).json({ error: 'Number and title required' });

    const entryId = id || generateId(act, type, number);
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO entries (id, act, type, chapter, number, title, sub, content, links, tags, created_at, updated_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [entryId, act, type || 'section', chapter || '', number, title, sub || '',
       content || '', JSON.stringify(links || []), JSON.stringify(tags || []),
       now, now, req.session.user.username]
    );
    res.json({ id: entryId, ok: true });
  } catch (e) {
    if (e.code === '23505') {
      // Duplicate — add suffix and retry
      const altId = (req.body.id || generateId(req.body.act, req.body.type, req.body.number)) + '-' + Date.now().toString(36).slice(-4);
      try {
        const now = new Date().toISOString();
        await db.query(
          `INSERT INTO entries (id, act, type, chapter, number, title, sub, content, links, tags, created_at, updated_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [altId, req.body.act, req.body.type || 'section', req.body.chapter || '', req.body.number,
           req.body.title, req.body.sub || '', req.body.content || '',
           JSON.stringify(req.body.links || []), JSON.stringify(req.body.tags || []),
           now, now, req.session.user.username]
        );
        res.json({ id: altId, ok: true });
      } catch (e2) {
        res.status(400).json({ error: e2.message });
      }
    } else {
      res.status(400).json({ error: e.message });
    }
  }
});

// Update entry (admin)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { act, type, chapter, number, title, sub, content, links, tags } = req.body;
  const now = new Date().toISOString();
  await db.query(
    `UPDATE entries SET act=$1, type=$2, chapter=$3, number=$4, title=$5, sub=$6,
     content=$7, links=$8, tags=$9, updated_at=$10 WHERE id=$11`,
    [act, type, chapter || '', number, title, sub || '', content || '',
     JSON.stringify(links || []), JSON.stringify(tags || []), now, req.params.id]
  );
  res.json({ ok: true });
});

// Delete entry (admin)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await db.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

function generateId(act, type, number) {
  const prefix = (act || 'other').substring(0, 4).toLowerCase().replace(/[^a-z]/g, '');
  const t = (type || 's').charAt(0);
  const n = (number || '0').replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${t}${n}`;
}

module.exports = router;
