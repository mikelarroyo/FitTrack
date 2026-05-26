const express = require('express');
const router = express.Router();

// GET /entrenar/resumen/:sesionId — DEBE ir antes de /:dia_id para que no lo intercepte
router.get('/resumen/:sesionId', (req, res) => {
  const db = req.db;
  const sesionId = parseInt(req.params.sesionId, 10);

  const sesion = db.prepare(`
    SELECT s.*, d.nombre AS dia_nombre, d.plan_id, p.nombre AS plan_nombre
    FROM sesiones s
    JOIN dias d ON s.dia_id = d.id
    JOIN planes p ON d.plan_id = p.id
    WHERE s.id = ?
  `).get(sesionId);

  if (!sesion) return res.redirect('/dashboard');

  const ejercicios = db.prepare(`
    SELECT e.id, e.nombre,
           COUNT(sl.id)              AS num_sets,
           MAX(sl.peso_kg)           AS mejor_peso_sesion,
           SUM(sl.reps_reales)       AS total_reps,
           SUM(COALESCE(sl.peso_kg,0) * COALESCE(sl.reps_reales,0)) AS volumen
    FROM sets_log sl
    JOIN ejercicios e ON sl.ejercicio_id = e.id
    WHERE sl.sesion_id = ?
    GROUP BY e.id
    ORDER BY e.orden
  `).all(sesionId);

  ejercicios.forEach(ej => {
    const prevBest = db.prepare(`
      SELECT MAX(sl.peso_kg) AS mejor
      FROM sets_log sl
      JOIN sesiones s ON sl.sesion_id = s.id
      WHERE sl.ejercicio_id = ? AND s.id != ?
    `).get(ej.id, sesionId);
    ej.es_pr         = ej.mejor_peso_sesion != null &&
                       (!prevBest?.mejor || ej.mejor_peso_sesion > prevBest.mejor);
    ej.peso_anterior = prevBest?.mejor ?? null;
  });

  const numPRs       = ejercicios.filter(e => e.es_pr).length;
  const volumenTotal = Math.round(ejercicios.reduce((a, e) => a + (e.volumen || 0), 0));
  const duracionMin  = sesion.duracion_seg ? Math.round(sesion.duracion_seg / 60) : null;
  const numSets      = ejercicios.reduce((a, e) => a + e.num_sets, 0);

  res.render('resumen-sesion', {
    title: 'Resumen de entrenamiento',
    sesion,
    ejercicios,
    numPRs,
    volumenTotal,
    duracionMin,
    numSets,
    breadcrumbs: [
      { label: 'Inicio',           url: '/dashboard' },
      { label: sesion.plan_nombre, url: `/planes/${sesion.plan_id}` },
      { label: 'Resumen sesión',   active: true }
    ]
  });
});

// GET /entrenar/:dia_id — Sesión activa
router.get('/:dia_id', (req, res) => {
  const db = req.db;
  const dia = db.prepare(
    'SELECT d.*, p.nombre as plan_nombre, p.id as plan_id FROM dias d JOIN planes p ON d.plan_id=p.id WHERE d.id=?'
  ).get(req.params.dia_id);
  if (!dia) return res.redirect('/dashboard');

  const ejercicios = db.prepare('SELECT * FROM ejercicios WHERE dia_id=? ORDER BY orden').all(dia.id);
  if (!ejercicios.length) return res.redirect(`/planes/${dia.plan_id}/dias/${dia.id}/editar`);

  ejercicios.forEach(ej => {
    const lastSet = db.prepare(`
      SELECT sl.peso_kg, sl.reps_reales
      FROM sets_log sl
      JOIN sesiones s ON sl.sesion_id = s.id
      WHERE sl.ejercicio_id = ? AND s.dia_id = ?
      ORDER BY s.fecha DESC, s.id DESC, sl.num_set DESC
      LIMIT 1
    `).get(ej.id, dia.id);
    ej.ultimo_peso  = lastSet ? lastSet.peso_kg    : ej.peso_kg;
    ej.ultimas_reps = lastSet ? lastSet.reps_reales : ej.reps;

    const best = db.prepare(
      'SELECT MAX(peso_kg) as mejor FROM sets_log WHERE ejercicio_id = ?'
    ).get(ej.id);
    ej.mejor_peso_historico = best?.mejor ?? null;

    ej.historial = db.prepare(`
      SELECT s.fecha,
             MAX(sl.peso_kg)     AS mejor_peso,
             SUM(sl.reps_reales) AS total_reps,
             COUNT(sl.id)        AS num_sets
      FROM sets_log sl
      JOIN sesiones s ON sl.sesion_id = s.id
      WHERE sl.ejercicio_id = ? AND s.dia_id = ?
      GROUP BY s.id
      ORDER BY s.fecha DESC, s.id DESC
      LIMIT 5
    `).all(ej.id, dia.id);
  });

  const totalSeries = ejercicios.reduce((s, e) => s + e.series, 0);

  res.render('entrenar', {
    title: `${dia.nombre} — ${dia.plan_nombre}`,
    dia,
    ejercicios,
    totalSeries,
    breadcrumbs: [
      { label: 'Inicio',          url: '/dashboard' },
      { label: dia.plan_nombre,   url: `/planes/${dia.plan_id}` },
      { label: dia.nombre,        url: `/entrenar/${dia.id}`, active: true }
    ]
  });
});

// POST /entrenar/:dia_id/finalizar — Guardar sesión y redirigir al resumen
router.post('/:dia_id/finalizar', (req, res) => {
  const db = req.db;
  const diaId   = parseInt(req.params.dia_id, 10);
  const notas   = req.body.notas || null;
  const duracion = parseInt(req.body.duracion_seg, 10) || null;

  let payload = [];
  try { payload = JSON.parse(req.body.datos_json || '[]'); } catch { return res.redirect('/dashboard'); }
  if (!payload.length) return res.redirect('/dashboard');

  const dia = db.prepare(
    'SELECT d.*, p.id as plan_id FROM dias d JOIN planes p ON d.plan_id=p.id WHERE d.id=?'
  ).get(diaId);
  if (!dia) return res.redirect('/dashboard');

  const hoy = new Date().toISOString().slice(0, 10);
  const { lastInsertRowid: sesionId } = db.prepare(
    'INSERT INTO sesiones (dia_id, fecha, notas, duracion_seg) VALUES (?, ?, ?, ?)'
  ).run(diaId, hoy, notas, duracion);

  const insertSet = db.prepare(
    'INSERT INTO sets_log (sesion_id, ejercicio_id, num_set, peso_kg, reps_reales, rpe) VALUES (?, ?, ?, ?, ?, ?)'
  );
  payload.forEach(ej => {
    const rpe = ej.rpe || null;
    (ej.sets || []).forEach(s => {
      insertSet.run(sesionId, ej.ejercicio_id, s.num, s.peso || null, s.reps || null, rpe);
    });
  });

  res.redirect(`/entrenar/resumen/${sesionId}`);
});

module.exports = router;
