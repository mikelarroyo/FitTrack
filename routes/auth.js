const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');

// ── GET / — Landing page pública ─────────────────────────────────────────────
router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('landing', { layout: 'landing', title: 'Bienvenido a FitTrack' });
});

// ── GET /login ────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { layout: 'auth', title: 'Iniciar Sesión', next: req.query.next || '' });
});

// ── POST /login ───────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const fail = (msg) => res.render('login', {
    layout: 'auth', title: 'Iniciar Sesión',
    error: msg, email
  });

  if (!email?.trim() || !password) return fail('Completa todos los campos.');

  const user = req.db.prepare(
    'SELECT * FROM usuarios WHERE email = ? AND activo = 1'
  ).get(email.trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return fail('Email o contraseña incorrectos.');
  }

  req.session.regenerate((err) => {
    if (err) return fail('Error interno. Inténtalo de nuevo.');
    req.session.user = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol };
    const dest = req.body.next && req.body.next.startsWith('/') ? req.body.next : '/dashboard';
    res.redirect(dest);
  });
});

// ── GET /registro ─────────────────────────────────────────────────────────────
router.get('/registro', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('registro', { layout: 'auth', title: 'Crear Cuenta' });
});

// ── POST /registro ────────────────────────────────────────────────────────────
router.post('/registro', (req, res) => {
  const { nombre, email, password, password2 } = req.body;

  const fail = (msg) => res.render('registro', {
    layout: 'auth', title: 'Crear Cuenta',
    error: msg, nombre, email
  });

  if (!nombre?.trim() || !email?.trim() || !password) return fail('Todos los campos son obligatorios.');
  if (password.length < 6)  return fail('La contraseña debe tener al menos 6 caracteres.');
  if (password !== password2) return fail('Las contraseñas no coinciden.');

  const normalEmail = email.trim().toLowerCase();
  if (req.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(normalEmail)) {
    return fail('Ya existe una cuenta con ese email.');
  }

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = req.db.prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?)'
  ).run(nombre.trim(), normalEmail, hash, 'user', 1);

  req.session.regenerate((err) => {
    if (err) return res.redirect('/login');
    req.session.user = { id: lastInsertRowid, nombre: nombre.trim(), email: normalEmail, rol: 'user' };
    res.redirect('/dashboard');
  });
});

// ── POST /logout ──────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ── GET /perfil ───────────────────────────────────────────────────────────────
router.get('/perfil', requireAuth, (req, res) => {
  const db   = req.db;
  const uid  = req.session.user.id;
  const user = db.prepare('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios WHERE id = ?').get(uid);
  if (!user) return req.session.destroy(() => res.redirect('/login'));

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT p.id)  as planes,
      COUNT(DISTINCT s.id)  as sesiones,
      COUNT(DISTINCT d.id)  as dias
    FROM planes p
    LEFT JOIN dias d     ON d.plan_id  = p.id
    LEFT JOIN sesiones s ON s.dia_id   = d.id
    WHERE p.usuario_id = ?
  `).get(uid);

  const ultimasSesiones = db.prepare(`
    SELECT s.fecha, d.nombre as dia_nombre, p.nombre as plan_nombre, s.duracion_seg
    FROM sesiones s
    JOIN dias d   ON s.dia_id   = d.id
    JOIN planes p ON d.plan_id  = p.id
    WHERE p.usuario_id = ?
    ORDER BY s.fecha DESC, s.id DESC
    LIMIT 5
  `).all(uid);

  res.render('perfil', {
    title: 'Mi Perfil',
    user,
    stats,
    ultimasSesiones,
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Mi Perfil', active: true }
    ]
  });
});

// ── POST /perfil/editar ───────────────────────────────────────────────────────
router.post('/perfil/editar', requireAuth, (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) return res.redirect('/perfil');

  req.db.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?')
    .run(nombre.trim(), req.session.user.id);
  req.session.user.nombre = nombre.trim();
  res.redirect('/perfil');
});

// ── POST /perfil/cambiar-password ─────────────────────────────────────────────
router.post('/perfil/cambiar-password', requireAuth, (req, res) => {
  const { password_actual, password_nuevo, password_nuevo2 } = req.body;
  const db  = req.db;
  const uid = req.session.user.id;

  const renderFail = (error, tab = 'password') => {
    const user  = db.prepare('SELECT id,nombre,email,rol,activo,creado_en FROM usuarios WHERE id=?').get(uid);
    const stats = db.prepare(`SELECT COUNT(DISTINCT p.id) as planes, COUNT(DISTINCT s.id) as sesiones, COUNT(DISTINCT d.id) as dias FROM planes p LEFT JOIN dias d ON d.plan_id=p.id LEFT JOIN sesiones s ON s.dia_id=d.id WHERE p.usuario_id=?`).get(uid);
    const ultimasSesiones = db.prepare(`SELECT s.fecha, d.nombre as dia_nombre, p.nombre as plan_nombre, s.duracion_seg FROM sesiones s JOIN dias d ON s.dia_id=d.id JOIN planes p ON d.plan_id=p.id WHERE p.usuario_id=? ORDER BY s.fecha DESC LIMIT 5`).all(uid);
    res.render('perfil', { title: 'Mi Perfil', user, stats, ultimasSesiones, error, tab, breadcrumbs: [{label:'Inicio',url:'/dashboard'},{label:'Mi Perfil',active:true}] });
  };

  if (!password_actual || !password_nuevo) return renderFail('Completa todos los campos.');
  if (password_nuevo.length < 6) return renderFail('La nueva contraseña debe tener al menos 6 caracteres.');
  if (password_nuevo !== password_nuevo2) return renderFail('Las contraseñas no coinciden.');

  const user = db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(uid);
  if (!bcrypt.compareSync(password_actual, user.password_hash)) {
    return renderFail('La contraseña actual es incorrecta.');
  }

  const newHash = bcrypt.hashSync(password_nuevo, 10);
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(newHash, uid);
  res.redirect('/perfil?ok=password');
});

module.exports = router;
