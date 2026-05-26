function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    const next_ = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${next_}`);
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.rol !== 'admin') {
    return res.status(403).redirect('/dashboard');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
