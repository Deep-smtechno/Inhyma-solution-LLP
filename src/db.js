/* ============================================================
   Database layer — SQL Server via mssql (TDS)
   ALL access goes through stored procedures. No raw queries.
   ============================================================ */
const sql = require('mssql');

// Parse "HOST\INSTANCE" or "HOST,PORT" from DB_SERVER
function buildConfig() {
  const raw = (process.env.DB_SERVER || 'localhost').trim();
  let server = raw;
  let instanceName;
  let port;

  if (raw.includes('\\')) {
    const [host, inst] = raw.split('\\');
    server = host;
    instanceName = inst;
  } else if (raw.includes(',')) {
    const [host, p] = raw.split(',');
    server = host;
    port = parseInt(p, 10);
  }

  const config = {
    server,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: String(process.env.DB_ENCRYPT).toLowerCase() === 'true',
      trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE).toLowerCase() !== 'false',
      enableArithAbort: true,
    },
  };
  if (instanceName) config.options.instanceName = instanceName;
  if (port) config.port = port;
  return config;
}

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(buildConfig())
      .connect()
      .then((pool) => {
        console.log('✓ Connected to SQL Server:', process.env.DB_DATABASE);
        return pool;
      })
      .catch((err) => {
        poolPromise = null; // allow retry on next call
        throw err;
      });
  }
  return poolPromise;
}

/**
 * Execute a stored procedure.
 * @param {string} procName  e.g. 'usp_Product_GetAll'
 * @param {Object} params    { name: value } or { name: { type, value } }
 * @returns {Promise<{recordset, recordsets, output, rowsAffected}>}
 */
async function execProc(procName, params = {}) {
  const pool = await getPool();
  const request = pool.request();

  for (const [key, val] of Object.entries(params)) {
    if (val && typeof val === 'object' && 'type' in val) {
      request.input(key, val.type, val.value);
    } else {
      request.input(key, val);
    }
  }
  return request.execute(procName);
}

/** Convenience: return first recordset rows. */
async function query(procName, params = {}) {
  const result = await execProc(procName, params);
  return result.recordset || [];
}

/** Convenience: return first row of first recordset (or null). */
async function queryOne(procName, params = {}) {
  const rows = await query(procName, params);
  return rows[0] || null;
}

module.exports = { sql, getPool, execProc, query, queryOne };
