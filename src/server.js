const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db/pool');

const authRoutes = require('./routes/auth');
const entryRoutes = require('./routes/entries');
const dataRoutes = require('./routes/data');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══ MIDDLEWARE ═══
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'kg-associates-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production' && process.env.USE_HTTPS === 'true',
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ═══ ROUTES ═══
app.use('/api', authRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api', dataRoutes);

// Serve frontend for all non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ═══ SEED DEFAULT ADMIN ═══
async function seedAdmin() {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(result.rows[0].count) === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      const hash = bcrypt.hashSync(password, 10);
      await db.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, hash, 'admin']);
      console.log(`  ✓ Created default admin: ${username} / ${password}`);
    }
  } catch (e) {
    console.error('  ✗ Seed error:', e.message);
  }
}

// ═══ START ═══
async function start() {
  // Wait for DB connection
  let retries = 10;
  while (retries > 0) {
    try {
      await db.query('SELECT 1');
      console.log('  ✓ Database connected');
      break;
    } catch (e) {
      retries--;
      console.log(`  ⏳ Waiting for database... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (retries === 0) {
    console.error('  ✗ Could not connect to database');
    process.exit(1);
  }

  await seedAdmin();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'═'.repeat(52)}`);
    console.log(`  ⚖  CA Knowledge Base Server`);
    console.log(`  Kanhaiya Gautam & Associates`);
    console.log(`${'═'.repeat(52)}`);
    console.log(`  Status:  Running`);
    console.log(`  Port:    ${PORT}`);
    console.log(`  Mode:    ${process.env.NODE_ENV || 'development'}`);
    console.log(`${'═'.repeat(52)}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
