const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');

// Todos los endpoints de /admin requieren rol admin
router.use(requireAdmin);

// ── GET /admin — Panel principal ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = req.db;

  const usuarios = db.prepare(
    'SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY id'
  ).all();

  usuarios.forEach(u => {
    const s = db.prepare(`
      SELECT COUNT(DISTINCT p.id) as planes,
             COUNT(DISTINCT s.id) as sesiones
      FROM planes p
      LEFT JOIN dias d     ON d.plan_id = p.id
      LEFT JOIN sesiones s ON s.dia_id  = d.id
      WHERE p.usuario_id = ?
    `).get(u.id);
    u.num_planes   = s.planes;
    u.num_sesiones = s.sesiones;
  });

  const globalStats = {
    usuarios: usuarios.length,
    activos:  usuarios.filter(u => u.activo).length,
    planes:   db.prepare('SELECT COUNT(*) as n FROM planes').get().n,
    sesiones: db.prepare('SELECT COUNT(*) as n FROM sesiones').get().n,
  };

  res.render('admin/panel', {
    title: 'Panel de Administración',
    usuarios,
    globalStats,
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Admin', active: true }
    ]
  });
});

// ── GET /admin/usuarios/:id — Detalle de usuario ──────────────────────────────
router.get('/usuarios/:id', (req, res) => {
  const db      = req.db;
  const usuario = db.prepare(
    'SELECT id, nombre, email, rol, activo, creado_en FROM usuarios WHERE id = ?'
  ).get(req.params.id);

  if (!usuario) return res.redirect('/admin');

  const planes = db.prepare('SELECT * FROM planes WHERE usuario_id = ? ORDER BY id').all(usuario.id);
  planes.forEach(p => {
    p.num_dias     = db.prepare('SELECT COUNT(*) as n FROM dias WHERE plan_id = ?').get(p.id).n;
    p.num_sesiones = db.prepare(`
      SELECT COUNT(*) as n FROM sesiones s
      JOIN dias d ON s.dia_id = d.id WHERE d.plan_id = ?
    `).get(p.id).n;
    const ultima = db.prepare(`
      SELECT s.fecha FROM sesiones s
      JOIN dias d ON s.dia_id = d.id
      WHERE d.plan_id = ? ORDER BY s.fecha DESC LIMIT 1
    `).get(p.id);
    p.ultima_sesion = ultima?.fecha ?? null;
  });

  const ultimasSesiones = db.prepare(`
    SELECT s.id, s.fecha, s.duracion_seg,
           d.nombre as dia_nombre, p.nombre as plan_nombre
    FROM sesiones s
    JOIN dias d   ON s.dia_id  = d.id
    JOIN planes p ON d.plan_id = p.id
    WHERE p.usuario_id = ?
    ORDER BY s.fecha DESC, s.id DESC
    LIMIT 10
  `).all(usuario.id);

  ultimasSesiones.forEach(s => {
    s.duracion_fmt = s.duracion_seg ? `${Math.round(s.duracion_seg / 60)} min` : '—';
  });

  res.render('admin/usuario-detalle', {
    title: `Usuario: ${usuario.nombre}`,
    usuario,
    planes,
    ultimasSesiones,
    breadcrumbs: [
      { label: 'Inicio',  url: '/dashboard' },
      { label: 'Admin',   url: '/admin' },
      { label: usuario.nombre, active: true }
    ]
  });
});

// ── POST /admin/usuarios/:id/toggle-activo ────────────────────────────────────
router.post('/usuarios/:id/toggle-activo', (req, res) => {
  const db      = req.db;
  const usuario = db.prepare('SELECT id, activo, rol FROM usuarios WHERE id = ?').get(req.params.id);
  if (!usuario || usuario.rol === 'admin') return res.redirect('/admin');

  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?')
    .run(usuario.activo ? 0 : 1, usuario.id);
  res.redirect('/admin');
});

// ── POST /admin/usuarios/:id/cambiar-rol ──────────────────────────────────────
router.post('/usuarios/:id/cambiar-rol', (req, res) => {
  const { rol } = req.body;
  if (!['user', 'admin'].includes(rol)) return res.redirect('/admin');

  // No permitir quitarse a uno mismo el rol admin
  if (parseInt(req.params.id) === req.session.user.id && rol !== 'admin') {
    return res.redirect('/admin');
  }

  req.db.prepare('UPDATE usuarios SET rol = ? WHERE id = ?').run(rol, req.params.id);
  res.redirect('/admin');
});

// ── POST /admin/usuarios/:id/eliminar ─────────────────────────────────────────
router.post('/usuarios/:id/eliminar', (req, res) => {
  const uid = parseInt(req.params.id);
  // No permitir eliminar al propio admin logueado
  if (uid === req.session.user.id) return res.redirect('/admin');

  req.db.prepare('DELETE FROM usuarios WHERE id = ?').run(uid);
  res.redirect('/admin');
});

module.exports = router;
