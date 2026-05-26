const express = require('express');
const router  = express.Router();

// / ya está en routes/auth.js como ruta pública

router.get('/dashboard', (req, res) => {
  const db    = req.db;
  const uid   = req.session.user.id;
  const exito = req.query.exito === '1';

  const planesRaw = db.prepare('SELECT * FROM planes WHERE usuario_id = ? ORDER BY es_actual DESC, id').all(uid);

  function enrichPlan(p) {
    p.dias = db.prepare('SELECT * FROM dias WHERE plan_id = ? ORDER BY orden').all(p.id);
    p.dias.forEach(d => {
      d.ejercicios = db.prepare('SELECT * FROM ejercicios WHERE dia_id = ? ORDER BY orden').all(d.id);
      const ultima = db.prepare('SELECT fecha FROM sesiones WHERE dia_id = ? ORDER BY fecha DESC LIMIT 1').get(d.id);
      d.ultima_sesion = ultima?.fecha ?? null;
    });
    const stats = db.prepare(`
      SELECT COUNT(*) as total, MAX(s.fecha) as ultima
      FROM sesiones s JOIN dias d ON s.dia_id = d.id
      WHERE d.plan_id = ?
    `).get(p.id);
    p.total_sesiones = stats.total;
    p.ultima_sesion  = stats.ultima;
  }

  planesRaw.forEach(enrichPlan);

  const planActual   = planesRaw.find(p => p.es_actual === 1) || null;
  const otrosPlanes  = planesRaw.filter(p => p.es_actual !== 1);

  res.render('dashboard', {
    title: 'Dashboard',
    planActual,
    otrosPlanes,
    hayPlanes: planesRaw.length > 0,
    exito,
    breadcrumbs: [{ label: 'Inicio', url: '/dashboard', active: true }]
  });
});

router.get('/mapa-web', (req, res) => res.render('mapa-web', {
  title: 'Mapa Web',
  breadcrumbs: [{ label: 'Inicio', url: '/dashboard' }, { label: 'Mapa Web', active: true }]
}));

router.get('/sobre-nosotros', (req, res) => res.render('sobre-nosotros', {
  title: 'Sobre Nosotros',
  breadcrumbs: [{ label: 'Inicio', url: '/dashboard' }, { label: 'Sobre Nosotros', active: true }]
}));

router.get('/analisis', (req, res) => res.render('analisis', {
  title: 'Análisis y Vídeos',
  breadcrumbs: [{ label: 'Inicio', url: '/dashboard' }, { label: 'Análisis', active: true }]
}));

module.exports = router;
