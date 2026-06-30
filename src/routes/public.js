/* ============================================================
   Public site routes (server-rendered with Nunjucks)
   ============================================================ */
const express = require('express');
const router = express.Router();
const { query, queryOne, execProc } = require('../db');
const { loadSettings, nullIfEmpty, cache } = require('../utils/helpers');

// Load settings + footer nav for every public page
router.use(async (req, res, next) => {
  try {
    res.locals.settings = await loadSettings();
    if (!cache.navCategories) {
      cache.navCategories = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    }
    res.locals.navCategories = cache.navCategories;

    if (!cache.navIndustries) {
      cache.navIndustries = await query('usp_Industry_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    }
    res.locals.navIndustries = cache.navIndustries;

    res.locals.activePath = req.path;
    next();
  } catch (err) { next(err); }
});

/* ---------------- Home ---------------- */
router.get('/', async (req, res, next) => {
  try {
    const [featured, categories, industries, stats, blogs, testimonials] = await Promise.all([
      query('usp_Product_Manage', { Action: 'GET_ALL', FeaturedOnly: 1, Top: 6 }),
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Industry_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Stat_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Blog_Manage', { Action: 'GET_ALL', Top: 3 }),
      query('usp_Testimonial_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
    ]);
    res.render('public/index', {
      title: 'INHYMA Solutions LLP — Industrial Packaging & Automation',
      metaDescription: 'INHYMA Solutions LLP is India\'s leading industrial hyper market, providing innovative packaging machinery, material handling equipment, and factory automation systems.',
      featured,
      categories,
      industries,
      stats,
      blogs,
      testimonials
    });
  } catch (err) { next(err); }
});

/* ---------------- Products ---------------- */
router.get('/products', async (req, res, next) => {
  try {
    const categorySlug = nullIfEmpty(req.query.category);
    const search = nullIfEmpty(req.query.q);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 12;

    const [allProducts, categories] = await Promise.all([
      query('usp_Product_Manage', { Action: 'GET_ALL', CategorySlug: categorySlug, Search: search, IncludeInactive: 0 }),
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
    ]);

    const totalProducts = allProducts.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const offset = (currentPage - 1) * limit;
    const products = allProducts.slice(offset, offset + limit);

    res.render('public/products', {
      title: 'Industrial Packaging Machinery & Equipment',
      metaDescription: 'Browse our comprehensive catalog of high-performance packaging machines, filling systems, coding & marking systems, and end-of-line packaging automation.',
      products,
      categories,
      activeCategory: categorySlug,
      search,
      currentPage,
      totalPages,
      totalProducts
    });
  } catch (err) { next(err); }
});

router.get('/products/:slug', async (req, res, next) => {
  try {
    const result = await execProc('usp_Product_Manage', { Action: 'GET_BY_SLUG', Slug: req.params.slug });
    const product = result.recordsets[0] && result.recordsets[0][0];
    if (!product) return res.status(404).render('public/404', { title: 'Product Not Found' });
    const data = {
      product,
      features: result.recordsets[1] || [],
      specs: result.recordsets[2] || [],
      applications: result.recordsets[3] || [],
      images: result.recordsets[4] || [],
    };
    const related = await query('usp_Product_Manage', { Action: 'GET_RELATED', ProductId: product.ProductId, Top: 3 });
    res.render('public/product-detail', {
      title: product.Name + ' | Packaging Machinery',
      metaDescription: product.ShortDescription ? product.ShortDescription.slice(0, 160) : `Learn details, technical specifications, and key features of ${product.Name} from INHYMA Solutions LLP.`,
      ...data,
      related
    });
  } catch (err) { next(err); }
});

router.get('/industries', async (req, res, next) => {
  try {
    const industries = await query('usp_Industry_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    res.render('public/industries', {
      title: 'Industrial Verticals & Sectors Served',
      metaDescription: 'Tailored packaging and factory automation solutions for Food Processing, Pharmaceutical, Cosmetics, FMCG, Chemical, Logistics, and Manufacturing industries.',
      industries
    });
  } catch (err) { next(err); }
});

router.get('/industries/:slug', async (req, res, next) => {
  try {
    const result = await execProc('usp_Industry_Manage', { Action: 'GET_BY_SLUG', Slug: req.params.slug });
    const industry = result.recordsets[0] && result.recordsets[0][0];
    if (!industry) return res.status(404).render('public/404', { title: 'Industry Not Found' });
    const tags = result.recordsets[1] || [];
    res.render('public/industry-detail', {
      title: industry.Name + ' Packaging & Automation Solutions',
      metaDescription: industry.ShortDescription ? industry.ShortDescription.slice(0, 160) : `Custom industrial packaging and automation systems designed specifically for the ${industry.Name} industry.`,
      industry,
      tags
    });
  } catch (err) { next(err); }
});

/* ---------------- Solutions ---------------- */
router.get('/solutions', async (req, res, next) => {
  try {
    const result = await execProc('usp_Solution_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    const solutions = result.recordsets[0] || [];
    const features = result.recordsets[1] || [];
    
    // Group features by SolutionId
    for (const s of solutions) {
      s.features = features.filter(f => f.SolutionId === s.SolutionId);
    }
    
    res.render('public/solutions', {
      title: 'Industrial Turnkey Automation Solutions',
      metaDescription: 'Complete turnkey industrial solutions including factory automation, warehouse automation, packaging automation, production line optimization, and material handling.',
      solutions
    });
  } catch (err) { next(err); }
});

/* ---------------- About ---------------- */
router.get('/about', async (req, res, next) => {
  try {
    const [team, values, stats] = await Promise.all([
      query('usp_Team_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Value_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Stat_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
    ]);
    res.render('public/about', {
      title: 'About Us — INHYMA Solutions LLP',
      metaDescription: 'Learn more about INHYMA Solutions LLP, our mission, core values, leadership team, and our footprint as India\'s leading industrial packaging hyper market.',
      team,
      values,
      stats
    });
  } catch (err) { next(err); }
});

/* ---------------- Blog ---------------- */
router.get('/blog', async (req, res, next) => {
  try {
    const posts = await query('usp_Blog_Manage', { Action: 'GET_ALL' });
    res.render('public/blog', {
      title: 'Industrial Packaging & Automation Blog',
      metaDescription: 'Get the latest industry news, buying guides, ROI studies, and tech trends about packaging machinery, factory automation, and warehouse logistics.',
      posts
    });
  } catch (err) { next(err); }
});

router.get('/blog/:slug', async (req, res, next) => {
  try {
    const post = await queryOne('usp_Blog_Manage', { Action: 'GET_BY_SLUG', Slug: req.params.slug });
    if (!post) return res.status(404).render('public/404', { title: 'Article Not Found' });
    const related = await query('usp_Blog_Manage', { Action: 'GET_RELATED', PostId: post.PostId, Top: 3 });
    res.render('public/blog-detail', {
      title: post.Title,
      metaDescription: post.Excerpt ? post.Excerpt.slice(0, 160) : `Read our article on "${post.Title}" and stay updated with industrial technology trends and insights.`,
      post,
      related
    });
  } catch (err) { next(err); }
});

/* ---------------- Contact ---------------- */
router.get('/contact', (req, res) => {
  res.render('public/contact', {
    title: 'Contact INHYMA Solutions — Get a Consultation',
    metaDescription: 'Contact our experts for customized packaging machinery, material handling, or industrial automation inquiries. Offices in Thane, Mumbai.',
    sent: req.query.sent === '1'
  });
});

const sliceString = (val, maxLen) => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str.slice(0, maxLen) : null;
};

router.post('/contact', async (req, res, next) => {
  try {
    const b = req.body;
    await execProc('usp_Lead_Manage', {
      Action: 'CREATE',
      Name: sliceString(b.name, 160) || 'Anonymous',
      Company: sliceString(b.company, 200),
      Mobile: sliceString(b.mobile, 40),
      Email: sliceString(b.email, 160),
      Subject: sliceString(b.subject, 200),
      Message: sliceString(b.message, 2000),
      Source: 'contact',
    });
    res.redirect('/contact?sent=1');
  } catch (err) { next(err); }
});

/* ---------------- Request Quote ---------------- */
router.get('/request-quote', async (req, res, next) => {
  try {
    const categories = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 0 });
    res.render('public/request-quote', {
      title: 'Request a Free Quote | INHYMA Solutions',
      metaDescription: 'Request a customized quotation for your industrial packaging machinery, conveyor systems, filling machines, or warehouse automation needs.',
      categories,
      sent: req.query.sent === '1',
      product: req.query.product || ''
    });
  } catch (err) { next(err); }
});

router.post('/request-quote', async (req, res, next) => {
  try {
    const b = req.body;
    await execProc('usp_Lead_Manage', {
      Action: 'CREATE',
      Name: sliceString(b.name, 160) || 'Anonymous',
      Company: sliceString(b.company, 200),
      Mobile: sliceString(b.mobile, 40),
      Email: sliceString(b.email, 160),
      Industry: sliceString(b.industry, 120),
      ProductRequirement: sliceString(b.product, 200),
      Quantity: sliceString(b.quantity, 80),
      Budget: sliceString(b.budget, 80),
      Message: sliceString(b.message, 2000),
      Source: 'quote',
    });
    res.redirect('/request-quote?sent=1');
  } catch (err) { next(err); }
});

/* ---------------- Industry consultation inquiry ---------------- */
router.post('/industry-inquiry', async (req, res, next) => {
  try {
    const b = req.body;
    await execProc('usp_Lead_Manage', {
      Action: 'CREATE',
      Name: sliceString(b.name, 160) || 'Anonymous',
      Company: sliceString(b.company, 200),
      Mobile: sliceString(b.mobile, 40),
      Email: sliceString(b.email, 160),
      Industry: sliceString(b.industry, 120),
      Message: sliceString(b.message, 2000),
      Source: 'industry',
    });
    res.redirect((req.get('referer') || '/industries') + '?sent=1');
  } catch (err) { next(err); }
});

/* ---------------- Sitemap.xml ---------------- */
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const domain = 'https://www.inhymasolutions.com';
    
    // Fetch all dynamic slugs
    const [products, categories, industries, solutions, blogs] = await Promise.all([
      query('usp_Product_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Industry_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Solution_Manage', { Action: 'GET_ALL', IncludeInactive: 0 }),
      query('usp_Blog_Manage', { Action: 'GET_ALL' }),
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    const statics = ['', '/products', '/industries', '/solutions', '/about', '/blog', '/contact', '/request-quote'];
    for (const p of statics) {
      xml += `  <url>\n    <loc>${domain}${p}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${p === '' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
    }

    // Dynamic products
    for (const p of products) {
      xml += `  <url>\n    <loc>${domain}/products/${p.Slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    // Dynamic categories
    for (const c of categories) {
      xml += `  <url>\n    <loc>${domain}/products?category=${c.Slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    // Dynamic industries
    for (const i of industries) {
      xml += `  <url>\n    <loc>${domain}/industries/${i.Slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    // Dynamic blog posts
    for (const b of blogs) {
      xml += `  <url>\n    <loc>${domain}/blog/${b.Slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    xml += '</urlset>';
    
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) { next(err); }
});

module.exports = router;
