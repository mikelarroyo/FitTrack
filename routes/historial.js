const express = require('express');
const router = express.Router();

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

router.get('/', (req, res) => {
  const db = req.db;
  const planFiltro = parseInt(req.query.plan, 10) || null;
  const planes = db.prepare('SELECT id, nombre FROM planes WHERE usuario_id=? ORDER BY id').all(req.session.user.id);

  let sesiones;
  if (planFiltro) {
    sesiones = db.prepare(`
      SELECT s.id, s.fecha, s.notas, s.duracion_seg,
             d.nombre as dia_nombre, d.id as dia_id,
             p.nombre as plan_nombre, p.id as plan_id
      FROM sesiones s
      JOIN dias d ON s.dia_id=d.id
      JOIN planes p ON d.plan_id=p.id
      WHERE p.id=? AND p.usuario_id=?
      ORDER BY s.fecha DESC, s.id DESC
    `).all(planFiltro, req.session.user.id);
  } else {
    sesiones = db.prepare(`
      SELECT s.id, s.fecha, s.notas, s.duracion_seg,
             d.nombre as dia_nombre, d.id as dia_id,
             p.nombre as plan_nombre, p.id as plan_id
      FROM sesiones s
      JOIN dias d ON s.dia_id=d.id
      JOIN planes p ON d.plan_id=p.id
      WHERE p.usuario_id=?
      ORDER BY s.fecha DESC, s.id DESC
      LIMIT 50
    `).all(req.session.user.id);
  }

  sesiones.forEach(s => {
    const d = new Date(s.fecha + 'T00:00:00');
    s.dia  = String(d.getDate()).padStart(2, '0');
    s.mes  = MESES[d.getMonth()];
    s.anio = d.getFullYear();
    s.duracion_fmt = s.duracion_seg ? `${Math.round(s.duracion_seg / 60)} min` : '—';

    // Ejercicios + mejor set de esa sesión
    s.ejercicios = db.prepare(`
      SELECT e.nombre,
             MAX(sl.peso_kg) as mejor_peso,
             SUM(sl.reps_reales) as total_reps,
             COUNT(*) as num_sets
      FROM sets_log sl
      JOIN ejercicios e ON sl.ejercicio_id=e.id
      WHERE sl.sesion_id=?
      GROUP BY sl.ejercicio_id
      ORDER BY e.orden
    `).all(s.id);
  });

  res.render('historial', {
    title: 'Historial de Entrenamientos',
    sesiones,
    planes,
    planFiltro,
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Historial', url: '/historial', active: true }
    ]
  });
});

router.post('/:id/eliminar', (req, res) => {
  req.db.prepare('DELETE FROM sesiones WHERE id=?').run(req.params.id);
  res.redirect(req.get('Referer') || '/historial');
});

module.exports = router;
