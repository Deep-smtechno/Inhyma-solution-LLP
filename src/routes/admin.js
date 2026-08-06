/* ============================================================
   Admin panel routes — auth + full CMS CRUD
   ============================================================ */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');

const { sql, query, queryOne, execProc } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { uploader, webPath, removeByWebPath } = require('../utils/upload');
const { makeSlug, asArray, toBit, toInt, nullIfEmpty, loadSettings, clearCache } = require('../utils/helpers');

function normalizeStatusFilter(value) {
  return ['active', 'hidden'].includes(value) ? value : '';
}

function matchesSearch(item, search, fields) {
  if (!search) return true;
  const searchLower = search.toLowerCase();
  return fields.some((field) => String(item[field] || '').toLowerCase().includes(searchLower));
}

function matchesStatus(item, status) {
  return !status
    || (status === 'active' && Boolean(item.IsActive))
    || (status === 'hidden' && !item.IsActive);
}

const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'closed', 'lost'];

function normalizeDateFilter(value) {
  const date = nullIfEmpty(value) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function getLeadFilters(queryParams) {
  return {
    search: nullIfEmpty(queryParams.q) || '',
    status: LEAD_STATUSES.includes(queryParams.status) ? queryParams.status : '',
    source: nullIfEmpty(queryParams.source) || '',
    dateFrom: normalizeDateFilter(queryParams.dateFrom),
    dateTo: normalizeDateFilter(queryParams.dateTo),
  };
}

function filterLeads(leads, filters) {
  const fromTime = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
  const toTime = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;

  return leads.filter((lead) => {
    const createdTime = new Date(lead.CreatedAt).getTime();
    return matchesSearch(lead, filters.search, [
      'Name', 'Company', 'Mobile', 'Email', 'Industry', 'ProductRequirement', 'Subject', 'Message',
    ])
      && (!filters.status || lead.Status === filters.status)
      && (!filters.source || lead.Source === filters.source)
      && (fromTime === null || createdTime >= fromTime)
      && (toTime === null || createdTime <= toTime);
  });
}

function buildLeadFilterQuery(filters) {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params.toString();
}

function createExportWorkbook(sheetName, subject, columns) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'INHYMA Admin';
  workbook.subject = subject;
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  worksheet.columns = columns;
  return { workbook, worksheet };
}

function styleExportWorksheet(worksheet, lastColumn, wrapColumns = []) {
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF183B64' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.autoFilter = { from: 'A1', to: `${lastColumn}1` };
  worksheet.properties.defaultRowHeight = 20;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    row.alignment = { ...row.alignment, vertical: 'top' };
    if (rowNumber % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FC' } };
    }
  });

  for (const column of wrapColumns) {
    worksheet.getColumn(column).alignment = { vertical: 'top', wrapText: true };
  }

  const border = { style: 'thin', color: { argb: 'FFD7DEE8' } };
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
      worksheet.getCell(rowNumber, columnNumber).border = {
        top: border,
        left: border,
        bottom: border,
        right: border,
      };
    }
  }
}

async function sendExcelWorkbook(res, workbook, filenamePrefix) {
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}-${date}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(Buffer.from(buffer));
}

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
    const user = await queryOne('usp_User_Manage', { Action: 'GET_BY_LOGIN', Login: login });
    if (!user || !user.IsActive || !(await bcrypt.compare(password, user.PasswordHash))) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    await execProc('usp_User_Manage', { Action: 'UPDATE_LAST_LOGIN', UserId: user.UserId });
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
    const recentLeads = await query('usp_Lead_Manage', { Action: 'GET_ALL' });
    res.render('admin/dashboard', { title: 'Dashboard', counts, recentLeads: recentLeads.slice(0, 8) });
  } catch (err) { next(err); }
});

/* ============================================================
   CATEGORIES
   ============================================================ */
router.get('/categories', async (req, res, next) => {
  try {
    const search = nullIfEmpty(req.query.q) || '';
    const status = normalizeStatusFilter(req.query.status);
    const allItems = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
    const items = allItems.filter((category) => (
      matchesSearch(category, search, ['Name', 'Slug', 'Description']) && matchesStatus(category, status)
    ));
    const filterParams = new URLSearchParams();
    if (search) filterParams.set('q', search);
    if (status) filterParams.set('status', status);

    res.render('admin/categories/list', {
      title: 'Categories',
      items,
      search,
      status,
      hasFilters: Boolean(search || status),
      filterQuery: filterParams.toString(),
      totalCategories: items.length,
    });
  } catch (err) { next(err); }
});

router.get('/categories/export', async (req, res, next) => {
  try {
    const search = nullIfEmpty(req.query.q) || '';
    const status = normalizeStatusFilter(req.query.status);
    const allItems = await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
    const categories = allItems.filter((category) => (
      matchesSearch(category, search, ['Name', 'Slug', 'Description']) && matchesStatus(category, status)
    ));
    const { workbook, worksheet } = createExportWorkbook('Categories', 'Product category export', [
      { header: 'Category ID', key: 'categoryId', width: 13 },
      { header: 'Name', key: 'name', width: 32 },
      { header: 'Slug', key: 'slug', width: 30 },
      { header: 'Description', key: 'description', width: 55 },
      { header: 'Subcategories', key: 'subcategoryCount', width: 15 },
      { header: 'Products', key: 'productCount', width: 12 },
      { header: 'Display Order', key: 'displayOrder', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Show on Home', key: 'showOnHome', width: 14 },
      { header: 'Image Path', key: 'imagePath', width: 48 },
    ]);

    for (const category of categories) {
      worksheet.addRow({
        categoryId: category.CategoryId,
        name: category.Name || '',
        slug: category.Slug || '',
        description: category.Description || '',
        subcategoryCount: category.SubcategoryCount || 0,
        productCount: category.ProductCount || 0,
        displayOrder: category.DisplayOrder,
        status: category.IsActive ? 'Active' : 'Hidden',
        showOnHome: category.ShowOnHome ? 'Yes' : 'No',
        imagePath: category.ImagePath || '',
      });
    }

    styleExportWorksheet(worksheet, 'J', ['description', 'imagePath']);
    await sendExcelWorkbook(res, workbook, 'categories-export');
  } catch (err) { next(err); }
});

router.get('/categories/new', (req, res) => {
  res.render('admin/categories/form', { title: 'New Category', item: null });
});

router.get('/categories/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Category_Manage', { Action: 'GET_BY_ID', CategoryId: toInt(req.params.id) });
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
      ShowOnHome: toBit(b.showOnHome)
    };
    if (id) {
      await execProc('usp_Category_Manage', { Action: 'UPDATE', CategoryId: id, ...params });
      req.flash('success', 'Category updated');
    } else {
      await execProc('usp_Category_Manage', { Action: 'CREATE', ...params });
      req.flash('success', 'Category created');
    }
    clearCache();
    res.redirect('/admin/categories');
  } catch (err) { next(err); }
});

router.post('/categories/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Category_Manage', { Action: 'DELETE', CategoryId: toInt(req.params.id) });
    req.flash('success', 'Category deleted');
    clearCache();
    res.redirect('/admin/categories');
  } catch (err) { next(err); }
});

/* ============================================================
   SUBCATEGORIES
   ============================================================ */
router.get('/subcategories', async (req, res, next) => {
  try {
    const search = nullIfEmpty(req.query.q) || '';
    const category = nullIfEmpty(req.query.category) || '';
    const status = normalizeStatusFilter(req.query.status);
    const [allItems, categories] = await Promise.all([
      query('usp_Subcategory_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
    ]);
    const items = allItems.filter((subcategory) => {
      const matchesCategory = !category || subcategory.CategorySlug === category;
      return matchesSearch(subcategory, search, ['Name', 'Slug', 'CategoryName', 'Description'])
        && matchesCategory
        && matchesStatus(subcategory, status);
    });
    const filterParams = new URLSearchParams();
    if (search) filterParams.set('q', search);
    if (category) filterParams.set('category', category);
    if (status) filterParams.set('status', status);

    res.render('admin/subcategories/list', {
      title: 'Subcategories',
      items,
      categories,
      search,
      category,
      status,
      hasFilters: Boolean(search || category || status),
      filterQuery: filterParams.toString(),
      totalSubcategories: items.length,
    });
  } catch (err) { next(err); }
});

router.get('/subcategories/export', async (req, res, next) => {
  try {
    const search = nullIfEmpty(req.query.q) || '';
    const category = nullIfEmpty(req.query.category) || '';
    const status = normalizeStatusFilter(req.query.status);
    const allItems = await query('usp_Subcategory_Manage', { Action: 'GET_ALL', IncludeInactive: 1 });
    const subcategories = allItems.filter((subcategory) => (
      matchesSearch(subcategory, search, ['Name', 'Slug', 'CategoryName', 'Description'])
      && (!category || subcategory.CategorySlug === category)
      && matchesStatus(subcategory, status)
    ));
    const { workbook, worksheet } = createExportWorkbook('Subcategories', 'Product subcategory export', [
      { header: 'Subcategory ID', key: 'subcategoryId', width: 16 },
      { header: 'Name', key: 'name', width: 32 },
      { header: 'Slug', key: 'slug', width: 30 },
      { header: 'Category', key: 'category', width: 30 },
      { header: 'Description', key: 'description', width: 55 },
      { header: 'Products', key: 'productCount', width: 12 },
      { header: 'Display Order', key: 'displayOrder', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Image Path', key: 'imagePath', width: 48 },
    ]);

    for (const subcategory of subcategories) {
      worksheet.addRow({
        subcategoryId: subcategory.SubcategoryId,
        name: subcategory.Name || '',
        slug: subcategory.Slug || '',
        category: subcategory.CategoryName || '',
        description: subcategory.Description || '',
        productCount: subcategory.ProductCount || 0,
        displayOrder: subcategory.DisplayOrder,
        status: subcategory.IsActive ? 'Active' : 'Hidden',
        imagePath: subcategory.ImagePath || '',
      });
    }

    styleExportWorksheet(worksheet, 'I', ['description', 'imagePath']);
    await sendExcelWorkbook(res, workbook, 'subcategories-export');
  } catch (err) { next(err); }
});

router.get('/subcategories/new', async (req, res, next) => {
  try {
    res.render('admin/subcategories/form', {
      title: 'New Subcategory',
      item: null,
      categories: await query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
    });
  } catch (err) { next(err); }
});

router.get('/subcategories/:id/edit', async (req, res, next) => {
  try {
    const [item, categories] = await Promise.all([
      queryOne('usp_Subcategory_Manage', { Action: 'GET_BY_ID', SubcategoryId: toInt(req.params.id) }),
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
    ]);
    if (!item) { req.flash('error', 'Subcategory not found'); return res.redirect('/admin/subcategories'); }
    res.render('admin/subcategories/form', { title: 'Edit Subcategory', item, categories });
  } catch (err) { next(err); }
});

router.post('/subcategories/:id?', uploader('subcategories').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const imagePath = req.file ? webPath('subcategories', req.file.filename) : null;
    const params = {
      CategoryId: toInt(b.categoryId),
      Name: b.name,
      Slug: nullIfEmpty(b.slug) || makeSlug(b.name),
      Description: nullIfEmpty(b.description),
      ImagePath: imagePath,
      DisplayOrder: toInt(b.displayOrder),
      IsActive: toBit(b.isActive),
    };
    if (id) {
      await execProc('usp_Subcategory_Manage', { Action: 'UPDATE', SubcategoryId: id, ...params });
      req.flash('success', 'Subcategory updated');
    } else {
      await execProc('usp_Subcategory_Manage', { Action: 'CREATE', ...params });
      req.flash('success', 'Subcategory created');
    }
    clearCache();
    res.redirect('/admin/subcategories');
  } catch (err) { next(err); }
});

router.post('/subcategories/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Subcategory_Manage', { Action: 'DELETE', SubcategoryId: toInt(req.params.id) });
    req.flash('success', 'Subcategory deleted');
    clearCache();
    res.redirect('/admin/subcategories');
  } catch (err) { next(err); }
});

/* ============================================================
   PRODUCTS
   ============================================================ */
router.get('/products', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const search = nullIfEmpty(req.query.q) || '';
    const category = nullIfEmpty(req.query.category) || '';
    const subcategory = nullIfEmpty(req.query.subcategory) || '';

    const [allProducts, categories, subcategories] = await Promise.all([
      query('usp_Product_Manage', {
        Action: 'GET_ALL',
        Search: search || null,
        CategorySlug: category || null,
        SubcategorySlug: subcategory || null,
        IncludeInactive: 1,
      }),
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
      query('usp_Subcategory_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
    ]);
    const totalProducts = allProducts.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const offset = (currentPage - 1) * limit;
    const items = allProducts.slice(offset, offset + limit);
    const filterParams = new URLSearchParams();
    if (search) filterParams.set('q', search);
    if (category) filterParams.set('category', category);
    if (subcategory) filterParams.set('subcategory', subcategory);

    res.render('admin/products/list', {
      title: 'Products',
      items,
      categories,
      subcategories,
      search,
      category,
      subcategory,
      hasFilters: Boolean(search || category || subcategory),
      filterQuery: filterParams.toString(),
      currentPage,
      totalPages,
      totalProducts
    });
  } catch (err) { next(err); }
});

router.get('/products/export', async (req, res, next) => {
  try {
    const search = nullIfEmpty(req.query.q) || '';
    const category = nullIfEmpty(req.query.category) || '';
    const subcategory = nullIfEmpty(req.query.subcategory) || '';
    const result = await execProc('usp_Product_Manage', {
      Action: 'GET_EXPORT',
      Search: search || null,
      CategorySlug: category || null,
      SubcategorySlug: subcategory || null,
      IncludeInactive: 1,
    });
    const products = result.recordsets[0] || [];
    const featuresByProduct = new Map();
    const specsByProduct = new Map();
    const applicationsByProduct = new Map();

    for (const feature of result.recordsets[1] || []) {
      if (!featuresByProduct.has(feature.ProductId)) featuresByProduct.set(feature.ProductId, []);
      featuresByProduct.get(feature.ProductId).push(feature.FeatureText);
    }
    for (const spec of result.recordsets[2] || []) {
      if (!specsByProduct.has(spec.ProductId)) specsByProduct.set(spec.ProductId, []);
      specsByProduct.get(spec.ProductId).push(spec);
    }
    for (const application of result.recordsets[3] || []) {
      if (!applicationsByProduct.has(application.ProductId)) applicationsByProduct.set(application.ProductId, []);
      applicationsByProduct.get(application.ProductId).push(application.AppText);
    }

    const { workbook, worksheet } = createExportWorkbook('Products', 'Product catalogue export', [
      { header: 'Product ID', key: 'productId', width: 12 },
      { header: 'Name', key: 'name', width: 38 },
      { header: 'Category', key: 'category', width: 28 },
      { header: 'Subcategory', key: 'subcategory', width: 28 },
      { header: 'Feature Chips', key: 'features', width: 40 },
      { header: 'Specification Name', key: 'specificationNames', width: 34 },
      { header: 'Specification Value', key: 'specificationValues', width: 42 },
      { header: 'Application Chips', key: 'applications', width: 40 },
    ]);

    const mergedProductGroups = [];
    for (const product of products) {
      const features = featuresByProduct.get(product.ProductId) || [];
      const specs = specsByProduct.get(product.ProductId) || [];
      const applications = applicationsByProduct.get(product.ProductId) || [];
      const specificationRows = specs.length ? specs : [{ SpecName: '', SpecValue: '' }];
      const startRow = worksheet.rowCount + 1;
      const detailLines = Math.max(features.length, applications.length, specificationRows.length, 1);
      const rowHeight = Math.min(
        Math.max(24, Math.ceil((18 + (detailLines * 15)) / specificationRows.length)),
        180,
      );

      specificationRows.forEach((spec, index) => {
        const isFirstRow = index === 0;
        const row = worksheet.addRow({
          productId: isFirstRow ? product.ProductId : '',
          name: isFirstRow ? product.Name || '' : '',
          category: isFirstRow ? product.CategoryName || '' : '',
          subcategory: isFirstRow ? product.SubcategoryName || '' : '',
          features: isFirstRow ? features.join('\n') : '',
          specificationNames: spec.SpecName || '',
          specificationValues: spec.SpecValue || '',
          applications: isFirstRow ? applications.join('\n') : '',
        });
        row.height = rowHeight;
      });

      const endRow = worksheet.rowCount;
      if (endRow > startRow) {
        for (const column of ['A', 'B', 'C', 'D', 'E', 'H']) {
          worksheet.mergeCells(`${column}${startRow}:${column}${endRow}`);
        }
        mergedProductGroups.push({ startRow, endRow });
      }
    }

    styleExportWorksheet(worksheet, 'H', ['features', 'specificationNames', 'specificationValues', 'applications']);
    for (const { startRow } of mergedProductGroups) {
      for (const column of ['A', 'B', 'C', 'D', 'E', 'H']) {
        worksheet.getCell(`${column}${startRow}`).alignment = {
          vertical: 'middle',
          wrapText: ['B', 'C', 'D', 'E', 'H'].includes(column),
        };
      }
    }
    await sendExcelWorkbook(res, workbook, 'products-export');
  } catch (err) { next(err); }
});

router.get('/products/new', async (req, res, next) => {
  try {
    const [categories, subcategories] = await Promise.all([
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
      query('usp_Subcategory_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
    ]);
    res.render('admin/products/form', {
      title: 'New Product', item: null, categories, subcategories,
      features: [], specs: [], applications: [], images: [],
    });
  } catch (err) { next(err); }
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const result = await execProc('usp_Product_Manage', { Action: 'GET_BY_ID', ProductId: toInt(req.params.id) });
    const item = result.recordsets[0] && result.recordsets[0][0];
    if (!item) { req.flash('error', 'Product not found'); return res.redirect('/admin/products'); }
    const [categories, subcategories] = await Promise.all([
      query('usp_Category_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
      query('usp_Subcategory_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }),
    ]);
    res.render('admin/products/form', {
      title: 'Edit Product', item,
      categories, subcategories,
      features: result.recordsets[1] || [], specs: result.recordsets[2] || [],
      applications: result.recordsets[3] || [], images: result.recordsets[4] || [],
    });
  } catch (err) { next(err); }
});

// Save product main row + child collections (all via stored procedures)
async function saveProductChildren(productId, b) {
  // Features
  await execProc('usp_Product_Manage', { Action: 'DELETE_FEATURES', ProductId: productId });
  const feats = asArray(b.feature).map((s) => String(s).trim()).filter(Boolean);
  for (let i = 0; i < feats.length; i++)
    await execProc('usp_Product_Manage', { Action: 'CREATE_FEATURE', ProductId: productId, FeatureText: feats[i], DisplayOrder: i });

  // Specs (paired arrays)
  await execProc('usp_Product_Manage', { Action: 'DELETE_SPECS', ProductId: productId });
  const sn = asArray(b.spec_name); const sv = asArray(b.spec_value);
  let so = 0;
  for (let i = 0; i < sn.length; i++) {
    const name = String(sn[i] || '').trim(); const val = String(sv[i] || '').trim();
    if (name && val) await execProc('usp_Product_Manage', { Action: 'CREATE_SPEC', ProductId: productId, SpecName: name, SpecValue: val, DisplayOrder: so++ });
  }

  // Applications
  await execProc('usp_Product_Manage', { Action: 'DELETE_APPS', ProductId: productId });
  const apps = asArray(b.application).map((s) => String(s).trim()).filter(Boolean);
  for (let i = 0; i < apps.length; i++)
    await execProc('usp_Product_Manage', { Action: 'CREATE_APP', ProductId: productId, AppText: apps[i], DisplayOrder: i });
}

router.post('/products/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = {
      CategoryId: nullIfEmpty(b.categoryId) ? toInt(b.categoryId) : { type: sql.Int, value: null },
      SubcategoryId: nullIfEmpty(b.subcategoryId) ? toInt(b.subcategoryId) : { type: sql.Int, value: null },
      Name: b.name, Slug: nullIfEmpty(b.slug) || makeSlug(b.name),
      CategoryLabel: nullIfEmpty(b.categoryLabel),
      ShortDescription: nullIfEmpty(b.shortDescription),
      Description: { type: sql.NVarChar(sql.MAX), value: nullIfEmpty(b.description) },
      Badge: nullIfEmpty(b.badge), IsFeatured: toBit(b.isFeatured),
      IsActive: toBit(b.isActive), DisplayOrder: toInt(b.displayOrder),
    };
    let productId = id;
    if (id) {
      await execProc('usp_Product_Manage', { Action: 'UPDATE', ProductId: id, ...params });
    } else {
      const r = await execProc('usp_Product_Manage', { Action: 'CREATE', ...params });
      productId = r.recordset[0].ProductId;
    }
    await saveProductChildren(productId, b);
    clearCache();
    req.flash('success', id ? 'Product updated' : 'Product created — now add images');
    res.redirect(`/admin/products/${productId}/edit`);
  } catch (err) { next(err); }
});

router.post('/products/:id/delete', async (req, res, next) => {
  try {
    const imgs = await query('usp_Product_Manage', { Action: 'GET_IMAGES', ProductId: toInt(req.params.id) });
    await execProc('usp_Product_Manage', { Action: 'DELETE', ProductId: toInt(req.params.id) });
    imgs.forEach((im) => removeByWebPath(im.FilePath));
    clearCache();
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
      await execProc('usp_Product_Manage', {
        Action: 'CREATE_IMAGE',
        ProductId: productId, FilePath: webPath('products', files[i].filename),
        FileName: files[i].originalname, AltText: nullIfEmpty(req.body.altText),
        IsPrimary: i === 0 && toBit(req.body.makePrimary) ? 1 : 0, DisplayOrder: i,
      });
    }
    clearCache();
    req.flash('success', `${files.length} image(s) uploaded`);
    res.redirect(`/admin/products/${productId}/edit`);
  } catch (err) { next(err); }
});

router.post('/products/images/:imageId/primary', async (req, res, next) => {
  try {
    const img = await queryOne('usp_Product_Manage', { Action: 'GET_IMAGE_BY_ID', ImageId: toInt(req.params.imageId) });
    await execProc('usp_Product_Manage', { Action: 'SET_PRIMARY_IMAGE', ImageId: toInt(req.params.imageId) });
    clearCache();
    res.redirect(`/admin/products/${img.ProductId}/edit`);
  } catch (err) { next(err); }
});

router.post('/products/images/:imageId/delete', async (req, res, next) => {
  try {
    const img = await queryOne('usp_Product_Manage', { Action: 'GET_IMAGE_BY_ID', ImageId: toInt(req.params.imageId) });
    await execProc('usp_Product_Manage', { Action: 'DELETE_IMAGE', ImageId: toInt(req.params.imageId) });
    if (img) removeByWebPath(img.FilePath);
    clearCache();
    res.redirect(`/admin/products/${img ? img.ProductId : ''}/edit`);
  } catch (err) { next(err); }
});

/* ============================================================
   INDUSTRIES
   ============================================================ */
router.get('/industries', async (req, res, next) => {
  try {
    res.render('admin/industries/list', { title: 'Industries', items: await query('usp_Industry_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});

router.get('/industries/new', (req, res) => {
  res.render('admin/industries/form', { title: 'New Industry', item: null, tags: [] });
});

router.get('/industries/:id/edit', async (req, res, next) => {
  try {
    const result = await execProc('usp_Industry_Manage', { Action: 'GET_BY_ID', IndustryId: toInt(req.params.id) });
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
    if (id) await execProc('usp_Industry_Manage', { Action: 'UPDATE', IndustryId: id, ...params });
    else industryId = (await execProc('usp_Industry_Manage', { Action: 'CREATE', ...params })).recordset[0].IndustryId;

    await execProc('usp_Industry_Manage', { Action: 'DELETE_TAGS', IndustryId: industryId });
    const tags = asArray(b.tag).map((t) => String(t).trim()).filter(Boolean);
    for (let i = 0; i < tags.length; i++)
      await execProc('usp_Industry_Manage', { Action: 'CREATE_TAG', IndustryId: industryId, TagText: tags[i], DisplayOrder: i });

    req.flash('success', id ? 'Industry updated' : 'Industry created');
    clearCache();
    res.redirect('/admin/industries');
  } catch (err) { next(err); }
});

router.post('/industries/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Industry_Manage', { Action: 'DELETE', IndustryId: toInt(req.params.id) });
    req.flash('success', 'Industry deleted');
    clearCache();
    res.redirect('/admin/industries');
  } catch (err) { next(err); }
});

/* ============================================================
   SOLUTIONS
   ============================================================ */
router.get('/solutions', async (req, res, next) => {
  try {
    res.render('admin/solutions/list', { title: 'Solutions', items: await query('usp_Solution_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});

router.get('/solutions/new', (req, res) => {
  res.render('admin/solutions/form', { title: 'New Solution', item: null, features: [] });
});

router.get('/solutions/:id/edit', async (req, res, next) => {
  try {
    const result = await execProc('usp_Solution_Manage', { Action: 'GET_BY_ID', SolutionId: toInt(req.params.id) });
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
    if (id) await execProc('usp_Solution_Manage', { Action: 'UPDATE', SolutionId: id, ...params });
    else solutionId = (await execProc('usp_Solution_Manage', { Action: 'CREATE', ...params })).recordset[0].SolutionId;

    await execProc('usp_Solution_Manage', { Action: 'DELETE_FEATURES', SolutionId: solutionId });
    const feats = asArray(b.feature).map((t) => String(t).trim()).filter(Boolean);
    for (let i = 0; i < feats.length; i++)
      await execProc('usp_Solution_Manage', { Action: 'CREATE_FEATURE', SolutionId: solutionId, FeatureText: feats[i], DisplayOrder: i });

    req.flash('success', id ? 'Solution updated' : 'Solution created');
    res.redirect('/admin/solutions');
  } catch (err) { next(err); }
});

router.post('/solutions/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Solution_Manage', { Action: 'DELETE', SolutionId: toInt(req.params.id) });
    req.flash('success', 'Solution deleted');
    res.redirect('/admin/solutions');
  } catch (err) { next(err); }
});

/* ============================================================
   BLOG
   ============================================================ */
router.get('/blog', async (req, res, next) => {
  try {
    res.render('admin/blog/list', { title: 'Blog Posts', items: await query('usp_Blog_Manage', { Action: 'GET_ALL', IncludeUnpublished: 1 }) });
  } catch (err) { next(err); }
});

router.get('/blog/new', (req, res) => {
  res.render('admin/blog/form', { title: 'New Post', item: null });
});

router.get('/blog/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Blog_Manage', { Action: 'GET_BY_ID', PostId: toInt(req.params.id) });
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
    if (id) { await execProc('usp_Blog_Manage', { Action: 'UPDATE', PostId: id, ...params }); req.flash('success', 'Post updated'); }
    else { await execProc('usp_Blog_Manage', { Action: 'CREATE', ...params }); req.flash('success', 'Post created'); }
    res.redirect('/admin/blog');
  } catch (err) { next(err); }
});

router.post('/blog/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Blog_Manage', { Action: 'DELETE', PostId: toInt(req.params.id) });
    req.flash('success', 'Post deleted');
    res.redirect('/admin/blog');
  } catch (err) { next(err); }
});

/* ============================================================
   TEAM
   ============================================================ */
router.get('/team', async (req, res, next) => {
  try {
    res.render('admin/team/list', { title: 'Team', items: await query('usp_Team_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/team/new', (req, res) => res.render('admin/team/form', { title: 'New Member', item: null }));
router.get('/team/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Team_Manage', { Action: 'GET_BY_ID', MemberId: toInt(req.params.id) });
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
    if (id) { await execProc('usp_Team_Manage', { Action: 'UPDATE', MemberId: id, ...params }); req.flash('success', 'Member updated'); }
    else { await execProc('usp_Team_Manage', { Action: 'CREATE', ...params }); req.flash('success', 'Member added'); }
    res.redirect('/admin/team');
  } catch (err) { next(err); }
});
router.post('/team/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Team_Manage', { Action: 'DELETE', MemberId: toInt(req.params.id) });
    req.flash('success', 'Member deleted'); res.redirect('/admin/team');
  } catch (err) { next(err); }
});

/* ============================================================
   TESTIMONIALS
   ============================================================ */
router.get('/testimonials', async (req, res, next) => {
  try {
    res.render('admin/testimonials/list', { title: 'Testimonials', items: await query('usp_Testimonial_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/testimonials/new', (req, res) => res.render('admin/testimonials/form', { title: 'New Testimonial', item: null }));
router.get('/testimonials/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Testimonial_Manage', { Action: 'GET_BY_ID', TestimonialId: toInt(req.params.id) });
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
      await execProc('usp_Testimonial_Manage', { Action: 'UPDATE', TestimonialId: id, ...params });
      req.flash('success', 'Testimonial updated');
    } else {
      await execProc('usp_Testimonial_Manage', { Action: 'CREATE', ...params });
      req.flash('success', 'Testimonial added');
    }
    res.redirect('/admin/testimonials');
  } catch (err) { next(err); }
});
router.post('/testimonials/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_Testimonial_Manage', { Action: 'DELETE', TestimonialId: toInt(req.params.id) });
    req.flash('success', 'Testimonial deleted');
    res.redirect('/admin/testimonials');
  } catch (err) { next(err); }
});

/* ============================================================
   CLIENT LOGOS
   ============================================================ */
router.get('/client-logos', async (req, res, next) => {
  try {
    res.render('admin/client-logos/list', { title: 'Client Logos', items: await query('usp_ClientLogo_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/client-logos/new', (req, res) => res.render('admin/client-logos/form', { title: 'New Client Logo', item: null }));
router.get('/client-logos/:id/edit', async (req, res, next) => {
  try {
    const item = (await query('usp_ClientLogo_Manage', { Action: 'GET_BY_ID', LogoId: toInt(req.params.id) }))[0];
    if (!item) { req.flash('error', 'Logo not found'); return res.redirect('/admin/client-logos'); }
    res.render('admin/client-logos/form', { title: 'Edit Client Logo', item });
  } catch (err) { next(err); }
});
router.post('/client-logos/:id?', uploader('logos').single('image'), async (req, res, next) => {
  try {
    const b = req.body;
    let imagePath = req.file ? webPath('logos', req.file.filename) : b.currentImage;
    if (b.removeImage === '1') { if (b.currentImage) removeByWebPath(b.currentImage); imagePath = null; }
    
    if (!imagePath) {
      req.flash('error', 'A logo image is required.');
      return res.redirect(req.params.id ? `/admin/client-logos/${req.params.id}/edit` : '/admin/client-logos/new');
    }

    const params = {
      Name: b.name, ImagePath: imagePath,
      DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive)
    };
    if (req.params.id) {
      await execProc('usp_ClientLogo_Manage', { Action: 'UPDATE', LogoId: toInt(req.params.id), ...params });
      req.flash('success', 'Logo updated');
    } else {
      await execProc('usp_ClientLogo_Manage', { Action: 'CREATE', ...params });
      req.flash('success', 'Logo added');
    }
    clearCache();
    res.redirect('/admin/client-logos');
  } catch (err) { next(err); }
});
router.post('/client-logos/:id/delete', async (req, res, next) => {
  try {
    await execProc('usp_ClientLogo_Manage', { Action: 'DELETE', LogoId: toInt(req.params.id) });
    req.flash('success', 'Logo deleted');
    clearCache();
    res.redirect('/admin/client-logos');
  } catch (err) { next(err); }
});


/* ============================================================
   CORE VALUES
   ============================================================ */
router.get('/values', async (req, res, next) => {
  try {
    res.render('admin/values/list', { title: 'Core Values', items: await query('usp_Value_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/values/new', (req, res) => res.render('admin/values/form', { title: 'New Value', item: null }));
router.get('/values/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Value_Manage', { Action: 'GET_BY_ID', ValueId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Value not found'); return res.redirect('/admin/values'); }
    res.render('admin/values/form', { title: 'Edit Value', item });
  } catch (err) { next(err); }
});
router.post('/values/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = { Icon: nullIfEmpty(b.icon), Title: b.title, Body: nullIfEmpty(b.body), DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive) };
    if (id) { await execProc('usp_Value_Manage', { Action: 'UPDATE', ValueId: id, ...params }); req.flash('success', 'Value updated'); }
    else { await execProc('usp_Value_Manage', { Action: 'CREATE', ...params }); req.flash('success', 'Value added'); }
    res.redirect('/admin/values');
  } catch (err) { next(err); }
});
router.post('/values/:id/delete', async (req, res, next) => {
  try { await execProc('usp_Value_Manage', { Action: 'DELETE', ValueId: toInt(req.params.id) }); req.flash('success', 'Value deleted'); res.redirect('/admin/values'); }
  catch (err) { next(err); }
});

/* ============================================================
   STATS
   ============================================================ */
router.get('/stats', async (req, res, next) => {
  try {
    res.render('admin/stats/list', { title: 'Stats', items: await query('usp_Stat_Manage', { Action: 'GET_ALL', IncludeInactive: 1 }) });
  } catch (err) { next(err); }
});
router.get('/stats/new', (req, res) => res.render('admin/stats/form', { title: 'New Stat', item: null }));
router.get('/stats/:id/edit', async (req, res, next) => {
  try {
    const item = await queryOne('usp_Stat_Manage', { Action: 'GET_BY_ID', StatId: toInt(req.params.id) });
    if (!item) { req.flash('error', 'Stat not found'); return res.redirect('/admin/stats'); }
    res.render('admin/stats/form', { title: 'Edit Stat', item });
  } catch (err) { next(err); }
});
router.post('/stats/:id?', async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? toInt(req.params.id) : null;
    const params = { Label: b.label, Value: toInt(b.value), Suffix: nullIfEmpty(b.suffix), DisplayOrder: toInt(b.displayOrder), IsActive: toBit(b.isActive) };
    if (id) { await execProc('usp_Stat_Manage', { Action: 'UPDATE', StatId: id, ...params }); req.flash('success', 'Stat updated'); }
    else { await execProc('usp_Stat_Manage', { Action: 'CREATE', ...params }); req.flash('success', 'Stat added'); }
    res.redirect('/admin/stats');
  } catch (err) { next(err); }
});
router.post('/stats/:id/delete', async (req, res, next) => {
  try { await execProc('usp_Stat_Manage', { Action: 'DELETE', StatId: toInt(req.params.id) }); req.flash('success', 'Stat deleted'); res.redirect('/admin/stats'); }
  catch (err) { next(err); }
});

/* ============================================================
   LEADS
   ============================================================ */
router.get('/leads', async (req, res, next) => {
  try {
    const filters = getLeadFilters(req.query);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;

    const allLeads = await query('usp_Lead_Manage', { Action: 'GET_ALL', Status: null });
    const filteredLeads = filterLeads(allLeads, filters);
    const sources = [...new Set(allLeads.map((lead) => lead.Source).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const totalLeads = filteredLeads.length;
    const totalPages = Math.ceil(totalLeads / limit);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const offset = (currentPage - 1) * limit;
    const items = filteredLeads.slice(offset, offset + limit);

    res.render('admin/leads/list', {
      title: 'Leads',
      items,
      ...filters,
      sources,
      hasFilters: Object.values(filters).some(Boolean),
      filterQuery: buildLeadFilterQuery(filters),
      currentPage,
      totalPages,
      totalLeads,
      allLeadCount: allLeads.length,
    });
  } catch (err) { next(err); }
});

router.get('/leads/export', async (req, res, next) => {
  try {
    const filters = getLeadFilters(req.query);
    const allLeads = await query('usp_Lead_Manage', { Action: 'GET_ALL', Status: null });
    const leads = filterLeads(allLeads, filters);
    const { workbook, worksheet } = createExportWorkbook('CRM Leads', 'CRM leads export', [
      { header: 'Lead ID', key: 'leadId', width: 11 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Company', key: 'company', width: 30 },
      { header: 'Mobile', key: 'mobile', width: 18 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Industry', key: 'industry', width: 24 },
      { header: 'Product Requirement', key: 'productRequirement', width: 38 },
      { header: 'Quantity', key: 'quantity', width: 16 },
      { header: 'Budget', key: 'budget', width: 18 },
      { header: 'Subject', key: 'subject', width: 34 },
      { header: 'Message', key: 'message', width: 55 },
      { header: 'Source', key: 'source', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Next Reminder', key: 'nextReminderDate', width: 21 },
      { header: 'Created At', key: 'createdAt', width: 21 },
    ]);

    for (const lead of leads) {
      worksheet.addRow({
        leadId: lead.LeadId,
        name: lead.Name || '',
        company: lead.Company || '',
        mobile: lead.Mobile || '',
        email: lead.Email || '',
        industry: lead.Industry || '',
        productRequirement: lead.ProductRequirement || '',
        quantity: lead.Quantity || '',
        budget: lead.Budget || '',
        subject: lead.Subject || '',
        message: lead.Message || '',
        source: lead.Source || '',
        status: lead.Status || '',
        nextReminderDate: lead.NextReminderDate ? new Date(lead.NextReminderDate) : null,
        createdAt: lead.CreatedAt ? new Date(lead.CreatedAt) : null,
      });
    }

    styleExportWorksheet(worksheet, 'O', ['productRequirement', 'subject', 'message']);
    worksheet.getColumn('nextReminderDate').numFmt = 'yyyy-mm-dd hh:mm';
    worksheet.getColumn('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
    await sendExcelWorkbook(res, workbook, 'crm-leads-export');
  } catch (err) { next(err); }
});

router.get('/leads/:id', async (req, res, next) => {
  try {
    const leadId = toInt(req.params.id);
    const item = await queryOne('usp_Lead_Manage', { Action: 'GET_BY_ID', LeadId: leadId });
    if (!item) { req.flash('error', 'Lead not found'); return res.redirect('/admin/leads'); }
    const callLogs = await query('usp_Lead_Manage', { Action: 'GET_CALL_LOGS', LeadId: leadId });
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

    await execProc('usp_Lead_Manage', {
      Action: 'CREATE_CALL_LOG',
      LeadId: leadId,
      Notes: notes,
      NextReminderDate: nextReminderDate
    });

    req.flash('success', 'Call log details and reminder saved successfully');
    res.redirect('/admin/leads/' + leadId);
  } catch (err) { next(err); }
});
router.post('/leads/:id/status', async (req, res, next) => {
  try { await execProc('usp_Lead_Manage', { Action: 'UPDATE_STATUS', LeadId: toInt(req.params.id), Status: req.body.status }); req.flash('success', 'Status updated'); res.redirect('/admin/leads/' + req.params.id); }
  catch (err) { next(err); }
});
router.post('/leads/:id/delete', async (req, res, next) => {
  try { await execProc('usp_Lead_Manage', { Action: 'DELETE', LeadId: toInt(req.params.id) }); req.flash('success', 'Lead deleted'); res.redirect('/admin/leads'); }
  catch (err) { next(err); }
});

/* ============================================================
   SITE SETTINGS
   ============================================================ */
router.get('/settings', async (req, res, next) => {
  try {
    const rows = await query('usp_Setting_Manage', { Action: 'GET_ALL' });
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
      await execProc('usp_Setting_Manage', { Action: 'UPSERT', SettingKey: key, SettingValue: { type: sql.NVarChar(sql.MAX), value: val } });
    }
    clearCache();
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
    const user = await queryOne('usp_User_Manage', { Action: 'GET_BY_ID', UserId: req.session.user.id });
    if (!user || !(await bcrypt.compare(currentPassword, user.PasswordHash))) {
      req.flash('error', 'Current password is incorrect'); return res.redirect('/admin/account');
    }
    if (!newPassword || newPassword.length < 6) {
      req.flash('error', 'New password must be at least 6 characters'); return res.redirect('/admin/account');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await execProc('usp_User_Manage', { Action: 'UPDATE_PASSWORD', UserId: req.session.user.id, PasswordHash: hash });
    req.flash('success', 'Password updated');
    res.redirect('/admin/account');
  } catch (err) { next(err); }
});

module.exports = router;
