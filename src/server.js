/* ============================================================
   INHYMA Website — Express server entry
   ============================================================ */
require('dotenv').config();
const path = require('path');
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const flash = require('connect-flash');
const nunjucks = require('nunjucks');

const { exposeLocals } = require('./middleware/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const ROOT = path.join(__dirname, '..');

/* ---------- Compression middleware ---------- */
app.use(compression());

/* ---------- Request timing (visible in server logs) ---------- */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 100) console.log(`⏱ ${req.method} ${req.originalUrl} — ${ms}ms`);
  });
  next();
});

/* ---------- View engine (Nunjucks / Jinja-style) ---------- */
const env = nunjucks.configure(path.join(ROOT, 'views'), {
  autoescape: true,
  express: app,
  watch: process.env.NODE_ENV !== 'production',
});
app.set('view engine', 'njk');

// Template filters
env.addFilter('date', (d, fmt) => {
  if (!d) return '';
  const dt = new Date(d);
  const opts = { year: 'numeric', month: 'long', day: '2-digit' };
  return dt.toLocaleDateString('en-US', opts);
});
env.addFilter('isodate', (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString().slice(0, 10);
});
env.addFilter('truncate', (s, n) => {
  if (!s) return '';
  return s.length > n ? s.slice(0, n).trim() + '…' : s;
});

/* ---------- Body parsing & static ---------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public'), {
  maxAge: '1d', // Cache static assets for 1 day
  etag: true,
}));

/* ---------- Sessions & flash ---------- */
app.use(session({
  secret: process.env.SESSION_SECRET || 'inhyma-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8h
}));
app.use(flash());
app.use(exposeLocals);

/* ---------- Routes ---------- */
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);
app.use('/', publicRoutes);

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).render('public/404', { title: 'Page Not Found' });
});

/* ---------- Error handler ---------- */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500);
  if (req.path.startsWith('/admin')) {
    req.flash && req.flash('error', err.message || 'Something went wrong');
    return res.redirect('back');
  }
  res.render('public/error', { title: 'Error', message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
});

const PORT = parseInt(process.env.PORT, 10) || 5000;
const MAX_PORT_TRIES = 10;

function startServer(port, attempt = 0) {
  const server = app.listen(port, () => {
    console.log(`\n🚀 INHYMA site running:  http://localhost:${port}`);
    console.log(`🔐 Admin panel:         http://localhost:${port}/admin\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES) {
      const next = port + 1;
      console.warn(`⚠ Port ${port} is in use — trying ${next}...`);
      startServer(next, attempt + 1);
    } else {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    }
  });
}

startServer(PORT);

// Pre-warm DB pool + caches on startup so first request is instant
(async () => {
  try {
    const { getPool } = require('./db');
    await getPool(); // open connection pool ahead of time
    const { loadSettings, cache } = require('./utils/helpers');
    const { query } = require('./db');
    await loadSettings(); // pre-cache settings
    cache.navCategories = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    cache.navIndustries = await query('usp_Industry_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    console.log('✓ Caches pre-warmed (settings, categories, industries)');
  } catch (e) {
    console.warn('⚠ Cache pre-warm failed (will lazy-load):', e.message);
  }
})();

module.exports = app;
