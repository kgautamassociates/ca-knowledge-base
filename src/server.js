const express = require('express');
const helmet = require('helmet');
const { clerkMiddleware } = require('@clerk/express');
const path = require('path');
const db = require('./db/pool');

const entryRoutes = require('./routes/entries');
const dataRoutes = require('./routes/data');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══ MIDDLEWARE ═══
// Defense-in-depth alongside the entry/notes sanitization in routes/entries.js:
// even if a future change reintroduces unsanitized HTML, a restrictive
// script-src means an injected <script>/event-handler still can't execute.
// style-src/font-src stay relaxed since the whole page is one inline <style>
// block plus a Google Fonts @import — tightening those isn't this fix's scope.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Reads the session JWT from the Authorization header (this app is
// cross-origin from the "KGA Staff" hub, so no shared cookie) and populates
// req.auth via getAuth(req) — see middleware/auth.js for the requireAuth/
// requireAdmin gates built on top of this.
app.use(clerkMiddleware());

// ═══ ROUTES ═══
app.use('/api/entries', entryRoutes);
app.use('/api', dataRoutes);

// Serve frontend for all non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

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
