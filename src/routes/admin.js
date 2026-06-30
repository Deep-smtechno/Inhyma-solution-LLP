/* ============================================================
   Admin panel routes — auth + full CMS CRUD
   ============================================================ */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const { sql, query, queryOne, execProc } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { uploader, webPath, removeByWebPath } = require('../utils/upload');
const { makeSlug, asArray, toBit, toInt, nullIfEmpty, loadSettings } = require('../utils/helpers');

/* ============================================================
   AUTH
   ============================================================ */
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', layout: false });
});

router.post('/login', async (req, res, next) => {
  try {
    const { login, password } = req.body;
    const user = await queryOne('usp_User_GetByLogin', { Login: login });
    if (!user || !user.IsActive || !(await bcrypt.compare(password, user.PasswordHash))) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    await execProc('usp_User_UpdateLastLogin', { UserId: user.UserId });
    req.session.user = { id: user.UserId, username: user.Username, name: user.FullName, role: user.Role };
    const dest = req.session.returnTo || '/admin';
    delete req.session.returnTo;
    res.redirect(dest);
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Everything below requires auth
router.use(requireAuth);

/* ============================================================
   DASHBOARD
   ============================================================ */
router.get('/', async (req, res, next) => {
  try {
    const counts = await queryOne('usp_Dashboard_Counts');
    const recentLeads = await query('usp_Lead_GetAll', {});
    res.render('admin/dashboard', { title: 'Dashboard', counts, recentLeads: recentLeads.slice(0, 8) });
  } catch (err) { next(err); }
});

/* ============================================================
   CATEGORIES
   ============================================================ */
router.get('/categories', async (req, res, next) => {
  try {
    res.render('admin/categories/list', { title: 'Categories', items: await query('usp_Category_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});

router.get('/categories/new', (req, res) => {
  res.render('admin/categories/form', { title: 'New Category', item: null });
});

router.get('/categories/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Category_GetById', { CategoryId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Category not found'); return res.redirect('/admin/categories'); }
    res.render('admin/categories/form', { title: 'Edit Category', item });
  } catch (err) { next(err); }
});

router.post('/categories/:id?', uploader('categories').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const imagePath = req.file ? webPath('categories', req.file.filename) : null;
    const params = {
      Name: b.name, Slug: nullIfEmpty(b.slug) || makeSlug(b.name),
      Description: nullIfEmpty(b.description), ImagePath: imagePath,
      DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive),
    };
    if (id) {
      await execProc('usp_Category_Update', { CategoryId: id, ...params });
      req.flash('success', 'Category updated');
    } else {
      await execProc('usp_Category_Create', params);
      req.flash('success', 'Category created');
    }
    res.redirect('/admin/categories');
  } catch (err) { next(err); }
});

router.post('/categories/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Category_Delete', { CategoryId: toInt(req.params.id) });
    req.flash('success', 'Category deleted');
    res.redirect('/admin/categories');
  } catch (err) { next(err); }
});

/* ============================================================
   PRODUCTS
   ============================================================ */
router.get('/products', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;

    const allProducts = await query('usp_Product_GetAll', { IncludeInactive: 1 });
    const totalProducts = allProducts.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const offset = (currentPage - 1) * limit;
    const items = allProducts.slice(offset, offset + limit);

    res.render('admin/products/list', {
      title: 'Products',
      items,
      currentPage,
      totalPages,
      totalProducts
    });
  } catch (err) { next(err); }
});

router.get('/products/new', async (req, res, next) => {
  try {
    res.render('admin/products/form', {
      title: 'New Product', item: null, categories: await query('usp_Category_GetAll', { IncludeInactive: 1 }),
      features: [], specs: [], applications: [], images: [],
    });
  } catch (err) { next(err); }
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const result = await execProc('usp_Product_GetById', { ProductId: toInt(req.params.id) });
    const item = result.recordsets[0] && result.recordsets[0][0];
    if (!item) { req.flash('error', 'Product not found'); return res.redirect('/admin/products'); }
    res.render('admin/products/form', {
      title: 'Edit Product', item,
      categories: await query('usp_Category_GetAll', { IncludeInactive: 1 }),
      features: result.recordsets[1] || [], specs: result.recordsets[2] || [],
      applications: result.recordsets[3] || [], images: result.recordsets[4] || [],
    });
  } catch (err) { next(err); }
});

// Save product main row + child collections (all via stored procedures)
async function saveProductChildren(productId, b) {
  // Features
  await execProc('usp_ProductFeature_DeleteByProduct', { ProductId: productId });
  const feats = asArray(b.feature).map((s) => String(s).trim()).filter(Boolean);
  for (let i = 0; i < feats.length; i++)
    await execProc('usp_ProductFeature_Create', { ProductId: productId, FeatureText: feats[i], DisplayOrder: i });

  // Specs (paired arrays)
  await execProc('usp_ProductSpec_DeleteByProduct', { ProductId: productId });
  const sn = asArray(b.spec_name); const sv = asArray(b.spec_value);
  let so = 0;
  for (let i = 0; i < sn.length; i++) {
    const name = String(sn[i] || '').trim(); const val = String(sv[i] || '').trim();
    if (name && val) await execProc('usp_ProductSpec_Create', { ProductId: productId, SpecName: name, SpecValue: val, DisplayOrder: so++ });
  }

  // Applications
  await execProc('usp_ProductApp_DeleteByProduct', { ProductId: productId });
  const apps = asArray(b.application).map((s) => String(s).trim()).filter(Boolean);
  for (let i = 0; i < apps.length; i++)
    await execProc('usp_ProductApp_Create', { ProductId: productId, AppText: apps[i], DisplayOrder: i });
}

router.post('/products/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = {
      CategoryId: nullIfEmpty(b.categoryId) ? toInt(b.categoryId) : { type: sql.Int, value: null },
      Name: b.name, Slug: nullIfEmpty(b.slug) || makeSlug(b.name),
      CategoryLabel: nullIfEmpty(b.categoryLabel),
      ShortDescription: nullIfEmpty(b.shortDescription),
      Description: { type: sql.NVarChar(sql.MAX), value: nullIfEmpty(b.description) },
      Badge: nullIfEmpty(b.badge), IsFeatured: toBit(b.isFeatured),
      IsActive: toBit(b.isActive), DisplayOrder: toInt(b.displayOrder),
    };
    let productId = id;
    if (id) {
      await execProc('usp_Product_Update', { ProductId: id, ...params });
    } else {
      const r = await execProc('usp_Product_Create', params);
      productId = r.recordset[0].ProductId;
    }
    await saveProductChildren(productId, b);
    req.flash('success', id ? 'Product updated' : 'Product created — now add images');
    res.redirect(`/admin/products/${productId}/edit`);
  } catch (err) { next(err); }
});

router.post('/products/:id/delete', async (req, res, next) => {
  try {
    const imgs = await query('usp_ProductImage_GetByProduct', { ProductId: toInt(req.params.id) });
    await execProc('usp_Product_Delete', { ProductId: toInt(req.params.id) });
    imgs.forEach((im) => removeByWebPath(im.FilePath));
    req.flash('success', 'Product deleted');
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// Product images
router.post('/products/:id/images', uploader('products').array('images', 10), async (req, res, next) => {
  try {
    const productId = toInt(req.params.id);
    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      await execProc('usp_ProductImage_Create', {
        ProductId: productId, FilePath: webPath('products', files[i].filename),
        FileName: files[i].originalname, AltText: nullIfEmpty(req.body.altText),
        IsPrimary: i === 0 && toBit(req.body.makePrimary) ? 1 : 0, DisplayOrder: i,
      });
    }
    req.flash('success', `${files.length} image(s) uploaded`);
    res.redirect(`/admin/products/${productId}/edit`);
  } catch (err) { next(err); }
});

router.post('/products/images/:imageId/primary', async (req, res, next) => {
  try {
    const img = await queryOne('usp_ProductImage_GetById', { ImageId: toInt(req.params.imageId) });
    await execProc('usp_ProductImage_SetPrimary', { ImageId: toInt(req.params.imageId) });
    res.redirect(`/admin/products/${img.ProductId}/edit`);
  } catch (err) { next(err); }
});

router.post('/products/images/:imageId/delete', async (req, res, next) => {
  try {
    const img = await queryOne('usp_ProductImage_GetById', { ImageId: toInt(req.params.imageId) });
    await execProc('usp_ProductImage_Delete', { ImageId: toInt(req.params.imageId) });
    if (img) removeByWebPath(img.FilePath);
    res.redirect(`/admin/products/${img ? img.ProductId : ''}/edit`);
  } catch (err) { next(err); }
});

/* ============================================================
   INDUSTRIES
   ============================================================ */
router.get('/industries', async (req, res, next) => {
  try {
    res.render('admin/industries/list', { title: 'Industries', items: await query('usp_Industry_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});

router.get('/industries/new', (req, res) => {
  res.render('admin/industries/form', { title: 'New Industry', item: null, tags: [] });
});

router.get('/industries/:id/edit', async (req, res, next) => {
  try {
    const result = await execProc('usp_Industry_GetById', { IndustryId: toInt(req.params.id) });
    const item = result.recordsets[0] && result.recordsets[0][0];
    if (!item) { req.flash('error', 'Industry not found'); return res.redirect('/admin/industries'); }
    res.render('admin/industries/form', { title: 'Edit Industry', item, tags: result.recordsets[1] || [] });
  } catch (err) { next(err); }
});

router.post('/industries/:id?', uploader('industries').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const imagePath = req.file ? webPath('industries', req.file.filename) : null;
    const params = {
      Name: b.name, Slug: nullIfEmpty(b.slug) || makeSlug(b.name),
      ShortDescription: nullIfEmpty(b.shortDescription),
      Description: { type: sql.NVarChar(sql.MAX), value: nullIfEmpty(b.description) },
      IconEmoji: nullIfEmpty(b.iconEmoji), ImagePath: imagePath,
      DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive),
    };
    let industryId = id;
    if (id) await execProc('usp_Industry_Update', { IndustryId: id, ...params });
    else industryId = (await execProc('usp_Industry_Create', params)).recordset[0].IndustryId;

    await execProc('usp_IndustryTag_DeleteByIndustry', { IndustryId: industryId });
    const tags = asArray(b.tag).map((t) => String(t).trim()).filter(Boolean);
    for (let i = 0; i < tags.length; i++)
      await execProc('usp_IndustryTag_Create', { IndustryId: industryId, TagText: tags[i], DisplayOrder: i });

    req.flash('success', id ? 'Industry updated' : 'Industry created');
    res.redirect('/admin/industries');
  } catch (err) { next(err); }
});

router.post('/industries/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Industry_Delete', { IndustryId: toInt(req.params.id) });
    req.flash('success', 'Industry deleted');
    res.redirect('/admin/industries');
  } catch (err) { next(err); }
});

/* ============================================================
   SOLUTIONS
   ============================================================ */
router.get('/solutions', async (req, res, next) => {
  try {
    res.render('admin/solutions/list', { title: 'Solutions', items: await query('usp_Solution_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});

router.get('/solutions/new', (req, res) => {
  res.render('admin/solutions/form', { title: 'New Solution', item: null, features: [] });
});

router.get('/solutions/:id/edit', async (req, res, next) => {
  try {
    const result = await execProc('usp_Solution_GetById', { SolutionId: toInt(req.params.id) });
    const item = result.recordsets[0] && result.recordsets[0][0];
    if (!item) { req.flash('error', 'Solution not found'); return res.redirect('/admin/solutions'); }
    res.render('admin/solutions/form', { title: 'Edit Solution', item, features: result.recordsets[1] || [] });
  } catch (err) { next(err); }
});

router.post('/solutions/:id?', uploader('solutions').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const imagePath = req.file ? webPath('solutions', req.file.filename) : null;
    const params = {
      Title: b.title, Slug: nullIfEmpty(b.slug) || makeSlug(b.title),
      Description: { type: sql.NVarChar(sql.MAX), value: nullIfEmpty(b.description) },
      ImagePath: imagePath, DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive),
    };
    let solutionId = id;
    if (id) await execProc('usp_Solution_Update', { SolutionId: id, ...params });
    else solutionId = (await execProc('usp_Solution_Create', params)).recordset[0].SolutionId;

    await execProc('usp_SolutionFeature_DeleteBySolution', { SolutionId: solutionId });
    const feats = asArray(b.feature).map((t) => String(t).trim()).filter(Boolean);
    for (let i = 0; i < feats.length; i++)
      await execProc('usp_SolutionFeature_Create', { SolutionId: solutionId, FeatureText: feats[i], DisplayOrder: i });

    req.flash('success', id ? 'Solution updated' : 'Solution created');
    res.redirect('/admin/solutions');
  } catch (err) { next(err); }
});

router.post('/solutions/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Solution_Delete', { SolutionId: toInt(req.params.id) });
    req.flash('success', 'Solution deleted');
    res.redirect('/admin/solutions');
  } catch (err) { next(err); }
});

/* ============================================================
   BLOG
   ============================================================ */
router.get('/blog', async (req, res, next) => {
  try {
    res.render('admin/blog/list', { title: 'Blog Posts', items: await query('usp_Blog_GetAll', { IncludeUnpublished: 1 }) });
  } catch (err) { next(err); }
});

router.get('/blog/new', (req, res) => {
  res.render('admin/blog/form', { title: 'New Post', item: null });
});

router.get('/blog/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Blog_GetById', { PostId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Post not found'); return res.redirect('/admin/blog'); }
    res.render('admin/blog/form', { title: 'Edit Post', item });
  } catch (err) { next(err); }
});

router.post('/blog/:id?', uploader('blog').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const imagePath = req.file ? webPath('blog', req.file.filename) : null;
    const params = {
      Title: b.title, Slug: nullIfEmpty(b.slug) || makeSlug(b.title), Tag: nullIfEmpty(b.tag),
      Excerpt: nullIfEmpty(b.excerpt),
      Body: { type: sql.NVarChar(sql.MAX), value: nullIfEmpty(b.body) },
      ImagePath: imagePath, IconEmoji: nullIfEmpty(b.iconEmoji), ReadTime: nullIfEmpty(b.readTime),
      Author: nullIfEmpty(b.author),
      PublishedDate: nullIfEmpty(b.publishedDate) ? { type: sql.Date, value: b.publishedDate } : { type: sql.Date, value: null },
      IsPublished: toBit(b.isPublished),
    };
    if (id) { await execProc('usp_Blog_Update', { PostId: id, ...params }); req.flash('success', 'Post updated'); }
    else { await execProc('usp_Blog_Create', params); req.flash('success', 'Post created'); }
    res.redirect('/admin/blog');
  } catch (err) { next(err); }
});

router.post('/blog/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Blog_Delete', { PostId: toInt(req.params.id) });
    req.flash('success', 'Post deleted');
    res.redirect('/admin/blog');
  } catch (err) { next(err); }
});

/* ============================================================
   TEAM
   ============================================================ */
router.get('/team', async (req, res, next) => {
  try {
    res.render('admin/team/list', { title: 'Team', items: await query('usp_Team_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/team/new', (req, res) => res.render('admin/team/form', { title: 'New Member', item: null }));
router.get('/team/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Team_GetById', { MemberId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Member not found'); return res.redirect('/admin/team'); }
    res.render('admin/team/form', { title: 'Edit Member', item });
  } catch (err) { next(err); }
});
router.post('/team/:id?', uploader('team').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const imagePath = req.file ? webPath('team', req.file.filename) : null;
    const params = {
      Name: b.name, Role: nullIfEmpty(b.role), Initials: nullIfEmpty(b.initials),
      ImagePath: imagePath, DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive),
    };
    if (id) { await execProc('usp_Team_Update', { MemberId: id, ...params }); req.flash('success', 'Member updated'); }
    else { await execProc('usp_Team_Create', params); req.flash('success', 'Member added'); }
    res.redirect('/admin/team');
  } catch (err) { next(err); }
});
router.post('/team/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Team_Delete', { MemberId: toInt(req.params.id) });
    req.flash('success', 'Member deleted'); res.redirect('/admin/team');
  } catch (err) { next(err); }
});

/* ============================================================
   TESTIMONIALS
   ============================================================ */
router.get('/testimonials', async (req, res, next) => {
  try {
    res.render('admin/testimonials/list', { title: 'Testimonials', items: await query('usp_Testimonial_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/testimonials/new', (req, res) => res.render('admin/testimonials/form', { title: 'New Testimonial', item: null }));
router.get('/testimonials/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Testimonial_GetById', { TestimonialId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Testimonial not found'); return res.redirect('/admin/testimonials'); }
    res.render('admin/testimonials/form', { title: 'Edit Testimonial', item });
  } catch (err) { next(err); }
});
router.post('/testimonials/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = {
      AuthorName: b.authorName,
      AuthorRole: nullIfEmpty(b.authorRole),
      Initials: nullIfEmpty(b.initials),
      Rating: toInt(b.rating) || 5,
      Content: b.content,
      DisplayOrder: toInt(b.displayOrder),
      IsActive: toBit(b.isActive),
    };
    if (id) {
      await execProc('usp_Testimonial_Update', { TestimonialId: id, ...params });
      req.flash('success', 'Testimonial updated');
    } else {
      await execProc('usp_Testimonial_Create', params);
      req.flash('success', 'Testimonial added');
    }
    res.redirect('/admin/testimonials');
  } catch (err) { next(err); }
});
router.post('/testimonials/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Testimonial_Delete', { TestimonialId: toInt(req.params.id) });
    req.flash('success', 'Testimonial deleted');
    res.redirect('/admin/testimonials');
  } catch (err) { next(err); }
});

/* ============================================================
   CORE VALUES
   ============================================================ */
router.get('/values', async (req, res, next) => {
  try {
    res.render('admin/values/list', { title: 'Core Values', items: await query('usp_Value_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/values/new', (req, res) => res.render('admin/values/form', { title: 'New Value', item: null }));
router.get('/values/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Value_GetById', { ValueId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Value not found'); return res.redirect('/admin/values'); }
    res.render('admin/values/form', { title: 'Edit Value', item });
  } catch (err) { next(err); }
});
router.post('/values/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = { Icon: nullIfEmpty(b.icon), Title: b.title, Body: nullIfEmpty(b.body), DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive) };
    if (id) { await execProc('usp_Value_Update', { ValueId: id, ...params }); req.flash('success', 'Value updated'); }
    else { await execProc('usp_Value_Create', params); req.flash('success', 'Value added'); }
    res.redirect('/admin/values');
  } catch (err) { next(err); }
});
router.post('/values/:id/delete', async (req, res, next) => {
  try { await execProc('usp_Value_Delete', { ValueId: toInt(req.params.id) }); req.flash('success', 'Value deleted'); res.redirect('/admin/values'); }
  catch (err) { next(err); }
});

/* ============================================================
   STATS
   ============================================================ */
router.get('/stats', async (req, res, next) => {
  try {
    res.render('admin/stats/list', { title: 'Stats', items: await query('usp_Stat_GetAll', { IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/stats/new', (req, res) => res.render('admin/stats/form', { title: 'New Stat', item: null }));
router.get('/stats/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Stat_GetById', { StatId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Stat not found'); return res.redirect('/admin/stats'); }
    res.render('admin/stats/form', { title: 'Edit Stat', item });
  } catch (err) { next(err); }
});
router.post('/stats/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = { Label: b.label, Value: toInt(b.value), Suffix: nullIfEmpty(b.suffix), DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive) };
    if (id) { await execProc('usp_Stat_Update', { StatId: id, ...params }); req.flash('success', 'Stat updated'); }
    else { await execProc('usp_Stat_Create', params); req.flash('success', 'Stat added'); }
    res.redirect('/admin/stats');
  } catch (err) { next(err); }
});
router.post('/stats/:id/delete', async (req, res, next) => {
  try { await execProc('usp_Stat_Delete', { StatId: toInt(req.params.id) }); req.flash('success', 'Stat deleted'); res.redirect('/admin/stats'); }
  catch (err) { next(err); }
});

/* ============================================================
   LEADS
   ============================================================ */
router.get('/leads', async (req, res, next) => {
  try {
    const status = nullIfEmpty(req.query.status);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;

    const allLeads = await query('usp_Lead_GetAll', { Status: status });
    const totalLeads = allLeads.length;
    const totalPages = Math.ceil(totalLeads / limit);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const offset = (currentPage - 1) * limit;
    const items = allLeads.slice(offset, offset + limit);

    res.render('admin/leads/list', {
      title: 'Leads',
      items,
      status,
      currentPage,
      totalPages,
      totalLeads
    });
  } catch (err) { next(err); }
});
router.get('/leads/:id', async (req, res, next) => {
  try {
    const leadId = toInt(req.params.id);
    const item = await queryOne('usp_Lead_GetById', { LeadId: leadId });
    if (!item) { req.flash('error', 'Lead not found'); return res.redirect('/admin/leads'); }
    const callLogs = await query('usp_CallLog_GetByLeadId', { LeadId: leadId });
    res.render('admin/leads/view', { title: 'Lead', item, callLogs });
  } catch (err) { next(err); }
});
router.post('/leads/:id/call-logs', async (req, res, next) => {
  try {
    const leadId = toInt(req.params.id);
    const notes = nullIfEmpty(req.body.notes);
    const reminderStr = nullIfEmpty(req.body.nextReminderDate);
    
    if (!notes) {
      req.flash('error', 'Call summary notes are required.');
      return res.redirect('/admin/leads/' + leadId);
    }

    let nextReminderDate = null;
    if (reminderStr) {
      // Local datetime input returns 'YYYY-MM-DDTHH:MM'. Node mssql driver handles Date object.
      nextReminderDate = new Date(reminderStr);
    }

    await execProc('usp_CallLog_Create', {
      LeadId: leadId,
      Notes: notes,
      NextReminderDate: nextReminderDate
    });

    req.flash('success', 'Call log details and reminder saved successfully');
    res.redirect('/admin/leads/' + leadId);
  } catch (err) { next(err); }
});
router.post('/leads/:id/status', async (req, res, next) => {
  try { await execProc('usp_Lead_UpdateStatus', { LeadId: toInt(req.params.id), Status: req.body.status }); req.flash('success', 'Status updated'); res.redirect('/admin/leads/' + req.params.id); }
  catch (err) { next(err); }
});
router.post('/leads/:id/delete', async (req, res, next) => {
  try { await execProc('usp_Lead_Delete', { LeadId: toInt(req.params.id) }); req.flash('success', 'Lead deleted'); res.redirect('/admin/leads'); }
  catch (err) { next(err); }
});

/* ============================================================
   SITE SETTINGS
   ============================================================ */
router.get('/settings', async (req, res, next) => {
  try {
    const rows = await query('usp_Setting_GetAll');
    const groups = {};
    for (const r of rows) { (groups[r.SettingGroup || 'general'] ||= []).push(r); }
    res.render('admin/settings', { title: 'Site Settings', groups });
  } catch (err) { next(err); }
});
router.post('/settings', async (req, res, next) => {
  try {
    // body: settings[key] = value
    const entries = Object.entries(req.body.settings || {});
    for (const [key, value] of entries) {
      let val = value || '';
      if (key === 'address') {
        val = val.slice(0, 500);
      } else if (['footer_about', 'hero_subtitle'].includes(key)) {
        val = val.slice(0, 1000);
      } else {
        val = val.slice(0, 200);
      }
      await execProc('usp_Setting_Upsert', { SettingKey: key, SettingValue: { type: sql.NVarChar(sql.MAX), value: val } });
    }
    req.flash('success', 'Settings saved');
    res.redirect('/admin/settings');
  } catch (err) { next(err); }
});

/* ============================================================
   ACCOUNT — change password
   ============================================================ */
router.get('/account', (req, res) => res.render('admin/account', { title: 'My Account' }));
router.post('/account/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await queryOne('usp_User_GetById', { UserId: req.session.user.id });
    if (!user || !(await bcrypt.compare(currentPassword, user.PasswordHash))) {
      req.flash('error', 'Current password is incorrect'); return res.redirect('/admin/account');
    }
    if (!newPassword || newPassword.length < 6) {
      req.flash('error', 'New password must be at least 6 characters'); return res.redirect('/admin/account');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await execProc('usp_User_UpdatePassword', { UserId: req.session.user.id, PasswordHash: hash });
    req.flash('success', 'Password updated');
    res.redirect('/admin/account');
  } catch (err) { next(err); }
});

module.exports = router;
