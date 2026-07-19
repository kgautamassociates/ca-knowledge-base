const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sanitizeEntryHtml } = require('./entries');

const router = express.Router();

// ═══ CURRENT USER ═══
// The frontend has no login of its own (see public/index.html) — it arrives
// with a Clerk token handed off from the hub and calls this once to learn
// who it is / what role they have, same shape the old local-auth /api/me
// used to return.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.auth.username, role: req.auth.role } });
});

// ═══ NOTES ═══
router.get('/notes/:entryId', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT content, updated_at FROM notes WHERE entry_id = $1 AND user_id = $2',
      [req.params.entryId, req.auth.id]
    );
    if (result.rows.length === 0) return res.json({ content: '', updated_at: null });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/notes/:entryId', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO notes (entry_id, user_id, content, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (entry_id, user_id) DO UPDATE SET content = $3, updated_at = $4`,
      [req.params.entryId, req.auth.id, sanitizeEntryHtml(content), now]
    );
    res.json({ ok: true, updated_at: now });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ SETTINGS ═══
router.get('/settings', requireAuth, async (req, res) => {
  const result = await db.query('SELECT key, value FROM settings');
  const settings = {};
  result.rows.forEach(r => { settings[r.key] = r.value; });
  res.json({ acts: settings.acts || [], types: settings.types || [] });
});

router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  const { acts, types } = req.body;
  if (acts) await db.query("INSERT INTO settings (key, value) VALUES ('acts', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(acts)]);
  if (types) await db.query("INSERT INTO settings (key, value) VALUES ('types', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(types)]);
  res.json({ ok: true });
});

// ═══ STATS ═══
router.get('/stats', requireAuth, async (req, res) => {
  const total = await db.query('SELECT COUNT(*) as count FROM entries');
  const acts = await db.query('SELECT act, COUNT(*) as count FROM entries GROUP BY act ORDER BY count DESC');
  const types = await db.query('SELECT type, COUNT(*) as count FROM entries GROUP BY type ORDER BY count DESC');
  res.json({
    total: parseInt(total.rows[0].count),
    acts: acts.rows,
    types: types.rows
  });
});

// ═══ GRAPH DATA ═══
router.get('/graph', requireAuth, async (req, res) => {
  const { act, type, chapter } = req.query;
  let sql = 'SELECT id, act, type, chapter, number, title, sub, links FROM entries WHERE 1=1';
  const params = [];
  let idx = 1;
  if (act) { sql += ` AND act = $${idx++}`; params.push(act); }
  if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
  if (chapter) { sql += ` AND chapter = $${idx++}`; params.push(chapter); }

  const result = await db.query(sql, params);
  const entries = result.rows;
  const idSet = new Set(entries.map(e => e.id));
  const edges = [];
  entries.forEach(e => {
    (e.links || []).forEach(lid => {
      if (idSet.has(lid)) edges.push({ from: e.id, to: lid });
    });
  });
  res.json({ nodes: entries, edges });
});

// ═══ BULK IMPORT ═══
router.post('/import', requireAuth, requireAdmin, async (req, res) => {
  const { entries, acts, types, mode } = req.body;
  if (!entries || !Array.isArray(entries)) return res.status(400).json({ error: 'Invalid data' });

  let imported = 0, skipped = 0;
  const now = new Date().toISOString();
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    for (const e of entries) {
      if (!e.number || !e.title) { skipped++; continue; }
      const entryId = e.id || generateId(e.act, e.type, e.number);

      try {
        if (mode === 'replace') {
          await client.query('DELETE FROM entries WHERE id = $1', [entryId]);
        }
        await client.query(
          `INSERT INTO entries (id, act, type, chapter, number, title, sub, content, links, tags, created_at, updated_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [entryId, e.act || 'Other', e.type || 'section', e.chapter || '', e.number, e.title,
           e.sub || e.subheading || '', e.content || '',
           JSON.stringify(e.links || []), JSON.stringify(e.tags || []),
           e.createdAt || e.created_at || now, e.updatedAt || e.updated_at || now,
           req.auth.username]
        );
        imported++;
      } catch (err) { skipped++; }
    }

    // Merge acts/types into settings
    if (acts && Array.isArray(acts)) {
      const existing = await client.query("SELECT value FROM settings WHERE key = 'acts'");
      const current = existing.rows.length > 0 ? existing.rows[0].value : [];
      const merged = [...new Set([...current, ...acts])].sort();
      await client.query("INSERT INTO settings (key, value) VALUES ('acts', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(merged)]);
    }
    if (types && Array.isArray(types)) {
      const existing = await client.query("SELECT value FROM settings WHERE key = 'types'");
      const current = existing.rows.length > 0 ? existing.rows[0].value : [];
      const merged = [...new Set([...current, ...types])].sort();
      await client.query("INSERT INTO settings (key, value) VALUES ('types', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(merged)]);
    }

    await client.query('COMMIT');
    res.json({ imported, skipped, total: entries.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

function generateId(act, type, number) {
  const prefix = (act || 'other').substring(0, 4).toLowerCase().replace(/[^a-z]/g, '');
  const t = (type || 's').charAt(0);
  const n = (number || '0').replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${t}${n}`;
}

// ═══ EXPORT ═══
router.get('/export', requireAuth, async (req, res) => {
  const entries = await db.query('SELECT * FROM entries ORDER BY act, number');
  const settings = await db.query('SELECT key, value FROM settings');
  const sMap = {};
  settings.rows.forEach(r => { sMap[r.key] = r.value; });

  const result = {
    acts: sMap.acts || [],
    types: sMap.types || [],
    entries: entries.rows,
    exportedAt: new Date().toISOString(),
    exportedBy: req.auth.username
  };
  res.setHeader('Content-Disposition', `attachment; filename=ca_kb_export_${new Date().toISOString().slice(0,10)}.json`);
  res.json(result);
});

module.exports = router;
