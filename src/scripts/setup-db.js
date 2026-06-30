/* ============================================================
   DB setup runner — executes the SQL files in order, then
   creates the seed admin user (bcrypt-hashed) if none exists.

   Usage: npm run db:setup
   ============================================================ */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sql = require('mssql');
const { getPool, execProc, queryOne } = require('../db');

const SQL_DIR = path.join(__dirname, '..', '..', 'sql');
const FILES = ['01_schema.sql', '02_procedures.sql', '03_seed.sql'];

// Split a sqlcmd-style script on lines containing only GO
function splitBatches(text) {
  return text
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length);
}

async function runFile(pool, file) {
  const full = path.join(SQL_DIR, file);
  const text = fs.readFileSync(full, 'utf8');
  const batches = splitBatches(text);
  console.log(`\n→ ${file} (${batches.length} batches)`);
  for (let i = 0; i < batches.length; i++) {
    try {
      await pool.request().batch(batches[i]);
    } catch (err) {
      console.error(`  ✗ Batch ${i + 1} in ${file} failed:`, err.message);
      throw err;
    }
  }
  console.log(`  ✓ ${file} done`);
}

async function seedAdmin() {
  const countRow = await queryOne('usp_User_Manage', { Action: 'COUNT' });
  if (countRow && countRow.Cnt > 0) {
    console.log('\nAdmin user already exists — skipping admin seed.');
    return;
  }
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@inhyma.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const hash = await bcrypt.hash(password, 10);

  await execProc('usp_User_Manage', {
    Action: 'CREATE',
    Username: username,
    Email: email,
    PasswordHash: hash,
    FullName: { type: sql.NVarChar(120), value: 'Administrator' },
    Role: 'admin',
  });
  console.log(`\n✓ Seed admin created — username: "${username}"  password: "${password}"`);
  console.log('  ** Change this password after first login. **');
}

(async () => {
  try {
    // The target DB may not exist yet, so connect to master first and create it.
    const mPool = await new sql.ConnectionPool(buildMasterConfig()).connect();
    await mPool.request().batch(
      `IF DB_ID('${process.env.DB_DATABASE}') IS NULL CREATE DATABASE [${process.env.DB_DATABASE}];`
    );
    await mPool.close();

    // Now connect to the target DB and run the scripts.
    const pool = await getPool();
    for (const f of FILES) await runFile(pool, f);
    await seedAdmin();

    console.log('\n✅ Database setup complete.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    process.exit(1);
  }
})();

function buildMasterConfig() {
  const raw = (process.env.DB_SERVER || 'localhost').trim();
  let server = raw, instanceName, port;
  if (raw.includes('\\')) { const [h, i] = raw.split('\\'); server = h; instanceName = i; }
  else if (raw.includes(',')) { const [h, p] = raw.split(','); server = h; port = parseInt(p, 10); }
  const cfg = {
    server, database: 'master', user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    options: {
      encrypt: String(process.env.DB_ENCRYPT).toLowerCase() === 'true',
      trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE).toLowerCase() !== 'false',
      enableArithAbort: true,
    },
  };
  if (instanceName) cfg.options.instanceName = instanceName;
  if (port) cfg.port = port;
  return cfg;
}
