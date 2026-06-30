/* ============================================================
   Import the real INHYMA catalog (scraped from inhyma.com)
   into the database.

   - Creates categories + products + spec rows via stored procedures
   - Downloads each product image into public/uploads/products/
     and records the path via usp_ProductImage_Create
   - Idempotent: products whose slug already exists are skipped
     (run with `--fresh` to wipe existing products & categories first)

   Usage:
     npm run import:inhyma
     npm run import:inhyma -- --fresh
   ============================================================ */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const slugify = require('slugify');
const { sql, getPool, execProc, query } = require('../db');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'inhyma-products.json');
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'products');
const FRESH = process.argv.includes('--fresh');

const makeSlug = (s) => slugify(String(s || ''), { lower: true, strict: true, trim: true }).slice(0, 200);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(dest, () => {});
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, () => {}); return reject(new Error('HTTP ' + res.statusCode)); }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
  });
}

async function ensureCategories(categoryNames) {
  const existing = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
  const bySlug = new Map(existing.map((c) => [c.Slug, c.CategoryId]));
  const map = new Map(); // name -> categoryId
  let order = 1;
  for (const name of categoryNames) {
    const slug = makeSlug(name);
    if (bySlug.has(slug)) { map.set(name, bySlug.get(slug)); continue; }
    const r = await execProc('usp_Category_Manage', {
      Action: 'CREATE',
      Name: name, Slug: slug, Description: { type: sql.NVarChar(500), value: null },
      ImagePath: { type: sql.NVarChar(400), value: null }, DisplayOrder: order++, IsActive: 1,
    });
    map.set(name, r.recordset[0].CategoryId);
    console.log('  + category:', name);
  }
  return map;
}

async function wipe() {
  console.log('--fresh: removing existing products & categories...');
  const prods = await query('usp_Product_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
  for (const p of prods) await execProc('usp_Product_Manage', { Action: 'DELETE', ProductId: p.ProductId });
  const cats = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
  for (const c of cats) await execProc('usp_Category_Manage', { Action: 'DELETE', CategoryId: c.CategoryId });
  // remove downloaded image files
  if (fs.existsSync(UPLOAD_DIR)) for (const f of fs.readdirSync(UPLOAD_DIR)) fs.unlinkSync(path.join(UPLOAD_DIR, f));
}

(async () => {
  try {
    if (!fs.existsSync(DATA_FILE)) throw new Error('Dataset not found: ' + DATA_FILE);
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    await getPool();
    if (FRESH) await wipe();

    const catMap = await ensureCategories(data.categories);

    // existing slugs to skip
    const existingProducts = await query('usp_Product_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
    const existingSlugs = new Set(existingProducts.map((p) => p.Slug));
    const usedSlugs = new Set(existingSlugs);

    let created = 0, skipped = 0, imgOk = 0, imgFail = 0;

    for (const p of data.products) {
      let slug = makeSlug(p.name);
      if (existingSlugs.has(slug)) { skipped++; continue; }
      // de-dup slug within this run
      let s = slug, n = 2; while (usedSlugs.has(s)) s = `${slug}-${n++}`; slug = s; usedSlugs.add(slug);

      const categoryId = catMap.get(p.category) || null;
      const r = await execProc('usp_Product_Manage', {
        Action: 'CREATE',
        CategoryId: categoryId ? categoryId : { type: sql.Int, value: null },
        Name: p.name, Slug: slug, CategoryLabel: p.category,
        ShortDescription: { type: sql.NVarChar(600), value: (p.shortDescription || '').slice(0, 600) },
        Description: { type: sql.NVarChar(sql.MAX), value: p.description || null },
        Badge: { type: sql.NVarChar(60), value: p.modelNo && p.modelNo !== p.name ? String(p.modelNo).slice(0, 60) : null },
        // feature the first few so the homepage isn't empty right after import
        IsFeatured: (p.displayOrder && p.displayOrder <= 8) ? 1 : 0,
        IsActive: 1, DisplayOrder: p.displayOrder || 0,
      });
      const productId = r.recordset[0].ProductId;
      created++;

      // specs
      for (let i = 0; i < (p.specs || []).length; i++) {
        const sp = p.specs[i];
        await execProc('usp_Product_Manage', {
          Action: 'CREATE_SPEC',
          ProductId: productId, SpecName: sp.name.slice(0, 160), SpecValue: sp.value.slice(0, 400), DisplayOrder: i,
        });
      }

      // images
      for (let i = 0; i < (p.images || []).length; i++) {
        const url = p.images[i];
        const ext = (url.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif|avif)$/i) || ['.jpg'])[0].toLowerCase();
        const filename = `${slug}-${i + 1}${ext}`;
        const dest = path.join(UPLOAD_DIR, filename);
        try {
          await download(url, dest);
          await execProc('usp_Product_Manage', {
            Action: 'CREATE_IMAGE',
            ProductId: productId, FilePath: `/uploads/products/${filename}`,
            FileName: filename, AltText: { type: sql.NVarChar(200), value: p.name.slice(0, 200) },
            IsPrimary: i === 0 ? 1 : 0, DisplayOrder: i,
          });
          imgOk++;
        } catch (e) { imgFail++; console.warn(`    ! image failed (${p.name}): ${e.message}`); }
      }
      console.log(`  + product: ${p.name} [${p.category}] (${(p.specs || []).length} specs, ${(p.images || []).length} img)`);
    }

    console.log(`\n✅ Import complete. Created ${created} products, skipped ${skipped} (already existed).`);
    console.log(`   Images: ${imgOk} downloaded, ${imgFail} failed.`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Import failed:', err.message);
    process.exit(1);
  }
})();
