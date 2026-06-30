/* Auth + view-helper middleware */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

// Make current user + flash messages available to all admin templates
function exposeLocals(req, res, next) {
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.activePath = req.path;
  res.locals.flash = req.flash ? {
    success: req.flash('success'),
    error: req.flash('error'),
  } : { success: [], error: [] };
  next();
}

module.exports = { requireAuth, exposeLocals };
