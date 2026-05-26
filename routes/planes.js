const express = require('express');
const router = express.Router();

const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const buildDias = (actual) => DIAS_SEMANA.map(d => ({ valor: d, sel: d === actual }));

// ── PLANES ────────────────────────────────────────────────────────────────────

router.get('/nuevo', (req, res) => {
  res.render('plan-form', {
    title: 'Nuevo Plan',
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Nuevo Plan', url: '/planes/nuevo', active: true }
    ]
  });
});

router.post('/nuevo', (req, res) => {
  const { nombre, descripcion } = req.body;
  const { lastInsertRowid } = req.db.prepare(
    'INSERT INTO planes (usuario_id, nombre, descripcion) VALUES (?, ?, ?)'
  ).run(req.session.user.id, nombre, descripcion);
  res.redirect(`/planes/${lastInsertRowid}?ok=creado`);
});

router.get('/:id', (req, res) => {
  const db = req.db;
  const plan = db.prepare('SELECT * FROM planes WHERE id = ?').get(req.params.id);
  if (!plan) return res.redirect('/dashboard');

  const dias = db.prepare('SELECT * FROM dias WHERE plan_id = ? ORDER BY orden').all(plan.id);
  dias.forEach(d => {
    d.ejercicios = db.prepare('SELECT * FROM ejercicios WHERE dia_id = ? ORDER BY orden').all(d.id);
    const ultima = db.prepare(`
      SELECT fecha FROM sesiones WHERE dia_id = ? ORDER BY fecha DESC, id DESC LIMIT 1
    `).get(d.id);
    d.ultima_sesion = ultima ? ultima.fecha : null;
    d.num_sesiones = db.prepare('SELECT COUNT(*) as n FROM sesiones WHERE dia_id = ?').get(d.id).n;
  });

  const stats = db.prepare(`
    SELECT COUNT(*) as total_sesiones,
           MAX(fecha) as ultima_fecha
    FROM sesiones s
    JOIN dias d ON s.dia_id = d.id
    WHERE d.plan_id = ?
  `).get(plan.id);

  const ultimasSesiones = db.prepare(`
    SELECT s.id, s.fecha, s.notas, s.duracion_seg, d.nombre as dia_nombre
    FROM sesiones s
    JOIN dias d ON s.dia_id = d.id
    WHERE d.plan_id = ?
    ORDER BY s.fecha DESC, s.id DESC
    LIMIT 5
  `).all(plan.id);

  ultimasSesiones.forEach(s => {
    s.duracion_fmt = s.duracion_seg ? Math.round(s.duracion_seg / 60) + ' min' : '—';
  });

  const ok = req.query.ok;
  res.render('plan-detalle', {
    title: plan.nombre,
    plan,
    dias,
    stats,
    ultimasSesiones,
    exito: ok === 'creado' ? 'Plan creado correctamente.' : ok === 'guardado' ? 'Cambios guardados.' : null,
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: plan.nombre, url: `/planes/${plan.id}`, active: true }
    ]
  });
});

router.get('/:id/editar', (req, res) => {
  const plan = req.db.prepare('SELECT * FROM planes WHERE id = ?').get(req.params.id);
  if (!plan) return res.redirect('/dashboard');
  res.render('plan-form', {
    title: 'Editar Plan',
    plan,
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: plan.nombre, url: `/planes/${plan.id}` },
      { label: 'Editar', url: `/planes/${plan.id}/editar`, active: true }
    ]
  });
});

router.post('/:id/editar', (req, res) => {
  const { nombre, descripcion } = req.body;
  req.db.prepare('UPDATE planes SET nombre=?, descripcion=? WHERE id=?')
    .run(nombre, descripcion, req.params.id);
  res.redirect(`/planes/${req.params.id}?ok=guardado`);
});

router.post('/:id/activar', (req, res) => {
  const db  = req.db;
  const uid = req.session.user.id;
  db.prepare('UPDATE planes SET es_actual = 0 WHERE usuario_id = ?').run(uid);
  db.prepare('UPDATE planes SET es_actual = 1 WHERE id = ? AND usuario_id = ?').run(req.params.id, uid);
  res.redirect('/dashboard');
});

router.post('/:id/eliminar', (req, res) => {
  req.db.prepare('DELETE FROM planes WHERE id = ?').run(req.params.id);
  res.redirect('/dashboard');
});

// ── DÍAS ──────────────────────────────────────────────────────────────────────

router.get('/:id/dias/nuevo', (req, res) => {
  const plan = req.db.prepare('SELECT * FROM planes WHERE id = ?').get(req.params.id);
  if (!plan) return res.redirect('/dashboard');
  res.render('dia-form', {
    title: 'Nuevo Día',
    plan,
    diasSemana: buildDias(null),
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: plan.nombre, url: `/planes/${plan.id}` },
      { label: 'Nuevo Día', url: `/planes/${plan.id}/dias/nuevo`, active: true }
    ]
  });
});

router.post('/:id/dias/nuevo', (req, res) => {
  const { nombre, descripcion, dia_semana } = req.body;
  const plan = req.db.prepare('SELECT id FROM planes WHERE id = ?').get(req.params.id);
  if (!plan) return res.redirect('/dashboard');
  const maxOrden = req.db.prepare('SELECT COALESCE(MAX(orden),0) as m FROM dias WHERE plan_id = ?').get(plan.id).m;
  const { lastInsertRowid } = req.db.prepare(
    'INSERT INTO dias (plan_id, nombre, descripcion, dia_semana, orden) VALUES (?, ?, ?, ?, ?)'
  ).run(plan.id, nombre, descripcion, dia_semana, maxOrden + 1);
  res.redirect(`/planes/${plan.id}/dias/${lastInsertRowid}/editar`);
});

router.get('/:id/dias/:dia_id/editar', (req, res) => {
  const db = req.db;
  const plan = db.prepare('SELECT * FROM planes WHERE id = ?').get(req.params.id);
  const dia  = db.prepare('SELECT * FROM dias WHERE id = ? AND plan_id = ?').get(req.params.dia_id, req.params.id);
  if (!plan || !dia) return res.redirect('/dashboard');
  const ejercicios = db.prepare('SELECT * FROM ejercicios WHERE dia_id = ? ORDER BY orden').all(dia.id);
  res.render('dia-form', {
    title: `Editar: ${dia.nombre}`,
    plan,
    dia,
    ejercicios,
    diasSemana: buildDias(dia.dia_semana),
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: plan.nombre, url: `/planes/${plan.id}` },
      { label: dia.nombre, url: `/planes/${plan.id}/dias/${dia.id}/editar`, active: true }
    ]
  });
});

router.post('/:id/dias/:dia_id/editar', (req, res) => {
  const { nombre, descripcion, dia_semana } = req.body;
  req.db.prepare('UPDATE dias SET nombre=?, descripcion=?, dia_semana=? WHERE id=? AND plan_id=?')
    .run(nombre, descripcion, dia_semana, req.params.dia_id, req.params.id);
  res.redirect(`/planes/${req.params.id}?ok=guardado`);
});

router.post('/:id/dias/:dia_id/eliminar', (req, res) => {
  req.db.prepare('DELETE FROM dias WHERE id = ? AND plan_id = ?')
    .run(req.params.dia_id, req.params.id);
  res.redirect(`/planes/${req.params.id}`);
});

// ── EJERCICIOS ────────────────────────────────────────────────────────────────

router.post('/:id/dias/:dia_id/ejercicios', (req, res) => {
  const db = req.db;
  const { nombre, series, reps, peso_kg, hasta_fallo } = req.body;
  const maxOrden = db.prepare('SELECT COALESCE(MAX(orden),0) as m FROM ejercicios WHERE dia_id=?').get(req.params.dia_id).m;
  db.prepare(
    'INSERT INTO ejercicios (dia_id, nombre, series, reps, peso_kg, hasta_fallo, orden) VALUES (?,?,?,?,?,?,?)'
  ).run(req.params.dia_id, nombre, series, reps, peso_kg || null, hasta_fallo ? 1 : 0, maxOrden + 1);
  res.redirect(`/planes/${req.params.id}/dias/${req.params.dia_id}/editar`);
});

router.post('/ejercicios/:eid/editar', (req, res) => {
  const db = req.db;
  const { nombre, series, reps, peso_kg, hasta_fallo } = req.body;
  const ej = db.prepare(
    'SELECT e.dia_id, d.plan_id FROM ejercicios e JOIN dias d ON e.dia_id=d.id WHERE e.id=?'
  ).get(req.params.eid);
  db.prepare(
    'UPDATE ejercicios SET nombre=?, series=?, reps=?, peso_kg=?, hasta_fallo=? WHERE id=?'
  ).run(nombre, parseInt(series), parseInt(reps), peso_kg || null, hasta_fallo ? 1 : 0, req.params.eid);
  if (ej) res.redirect(`/planes/${ej.plan_id}/dias/${ej.dia_id}/editar`);
  else res.redirect('/dashboard');
});

router.post('/ejercicios/:eid/eliminar', (req, res) => {
  const db = req.db;
  const ej = db.prepare(`
    SELECT e.dia_id, d.plan_id FROM ejercicios e JOIN dias d ON e.dia_id=d.id WHERE e.id=?
  `).get(req.params.eid);
  db.prepare('DELETE FROM ejercicios WHERE id=?').run(req.params.eid);
  if (ej) res.redirect(`/planes/${ej.plan_id}/dias/${ej.dia_id}/editar`);
  else res.redirect('/dashboard');
});

module.exports = router;
