/* ============================================================
   Lightweight JSON API (optional client-side consumption)
   ============================================================ */
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { nullIfEmpty } = require('../utils/helpers');

router.get('/products', async (req, res, next) => {
  try {
    const products = await query('usp_Product_GetAll', {
      CategorySlug: nullIfEmpty(req.query.category),
      Search: nullIfEmpty(req.query.q),
      IncludeInactive: 0,
    });
    res.json({ ok: true, count: products.length, products });
  } catch (err) { next(err); }
});

router.get('/categories', async (req, res, next) => {
  try {
    res.json({ ok: true, categories: await query('usp_Category_GetAll', { IncludeInactive: 0 }) });
  } catch (err) { next(err); }
});

router.get('/industries', async (req, res, next) => {
  try {
    res.json({ ok: true, industries: await query('usp_Industry_GetAll', { IncludeInactive: 0 }) });
  } catch (err) { next(err); }
});

module.exports = router;
