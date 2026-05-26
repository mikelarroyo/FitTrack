const express = require('express');
const session = require('express-session');
const { engine } = require('express-handlebars');
const path = require('path');
const { getDB, dbProxy } = require('./db/database');
const { requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Handlebars ───────────────────────────────────────────────────────────────
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir:  path.join(__dirname, 'views', 'layouts'),
  partialsDir: path.join(__dirname, 'views', 'partials'),
  helpers: {
    eq:       (a, b) => a === b,
    add:      (a, b) => a + b,
    json:     (obj)  => JSON.stringify(obj),
    range:    (start, end) => Array.from({ length: end - start }, (_, i) => start + i),
    eachN(n, options) {
      let out = '';
      for (let i = 1; i <= n; i++) out += options.fn({ num: i });
      return out;
    },
    gt:       (a, b) => a > b,
    ternary:  (cond, t, f) => cond ? t : f,
    navActive(currentPath, target) {
      if (!currentPath || !target) return '';
      if (currentPath === target) return 'active';
      if (target.length > 1 && currentPath.startsWith(target + '/')) return 'active';
      return '';
    },
    navDropActive(currentPath, ...targets) {
      const paths = targets.slice(0, -1);
      return paths.some(t => currentPath === t || currentPath.startsWith(t + '/')) ? 'active' : '';
    },
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// ── Middlewares base ──────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/bootstrap',       express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use('/vendor/bootstrap-icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons/font')));

// ── Sesión ────────────────────────────────────────────────────────────────────
app.use(session({
  secret: 'fittrack-v2-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 días
}));

// ── Temas pedagógicos ─────────────────────────────────────────────────────────
const VALID_THEMES = ['theme-base', 'theme-usability', 'theme-accessibility'];

app.post('/set-tema', (req, res) => {
  const tema = req.body.tema;
  if (VALID_THEMES.includes(tema)) req.session.theme = tema;
  res.json({ ok: true });
});

// ── Inyectar DB + contexto global en templates ────────────────────────────────
app.use((req, res, next) => {
  req.db = dbProxy;
  res.locals.currentUser     = req.session.user || null;
  res.locals.isAdmin         = req.session.user?.rol === 'admin';
  res.locals.currentPath     = req.path;
  const theme = VALID_THEMES.includes(req.session.theme) ? req.session.theme : 'theme-base';
  res.locals.currentTheme    = theme;
  res.locals.isUsabilidad    = theme === 'theme-usability';
  res.locals.isAccesibilidad = theme === 'theme-accessibility';
  next();
});

// ── Rutas públicas (login / registro / logout) ────────────────────────────────
app.use('/', require('./routes/auth'));

// ── Rutas protegidas (requieren sesión) ───────────────────────────────────────
app.use(requireAuth);

app.use('/',          require('./routes/index'));
app.use('/planes',    require('./routes/planes'));
app.use('/entrenar',  require('./routes/entrenar'));
app.use('/historial', require('./routes/historial'));
app.use('/progreso',  require('./routes/progreso'));
app.use('/api',       require('./routes/api'));
app.use('/admin',     require('./routes/admin'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('404', { title: 'Página no encontrada' }));

// ── Arranque ──────────────────────────────────────────────────────────────────
getDB().then(() => {
  app.listen(PORT, () => console.log(`FitTrack corriendo en http://localhost:${PORT}`));
}).catch(err => { console.error(err); process.exit(1); });
