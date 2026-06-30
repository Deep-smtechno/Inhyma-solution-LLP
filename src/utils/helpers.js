/* Small shared helpers */
const slugify = require('slugify');
const { sql, query } = require('../db');

function makeSlug(text) {
  return slugify(String(text || ''), { lower: true, strict: true, trim: true });
}

// Load all site settings into a flat { key: value } object
async function loadSettings() {
  const rows = await query('usp_Setting_Manage', { Action: 'GET_ALL' });
  const map = {};
  for (const r of rows) map[r.SettingKey] = r.SettingValue;
  return map;
}

// Parse a multi-row "child collection" coming from form fields.
// Accepts arrays (text[]) and returns trimmed non-empty entries.
function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// Coerce checkbox/string to bit (0/1)
function toBit(v) {
  return v === '1' || v === 'on' || v === true || v === 1 ? 1 : 0;
}

function toInt(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

function nullIfEmpty(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

module.exports = { sql, makeSlug, loadSettings, asArray, toBit, toInt, nullIfEmpty };
