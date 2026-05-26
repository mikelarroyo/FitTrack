const express = require('express');
const router = express.Router();

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function buildDias(diaActual) {
  return DIAS.map(d => ({ valor: d, seleccionado: d === diaActual }));
}

router.get('/nueva', (req, res) => {
  res.render('rutina-form', {
    title: 'Nueva Rutina',
    dias: buildDias(null),
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Rutinas', url: '/rutinas' },
      { label: 'Nueva Rutina', url: '/rutinas/nueva', active: true }
    ]
  });
});

router.post('/nueva', (req, res) => {
  const { nombre, descripcion, dia_semana } = req.body;
  req.db.prepare('INSERT INTO rutinas (usuario_id, nombre, descripcion, dia_semana) VALUES (1, ?, ?, ?)')
    .run(nombre, descripcion, dia_semana);
  res.redirect('/dashboard');
});

router.get('/:id/editar', (req, res) => {
  const db = req.db;
  const rutina = db.prepare('SELECT * FROM rutinas WHERE id = ?').get(req.params.id);
  if (!rutina) return res.redirect('/dashboard');
  const ejercicios = db.prepare('SELECT * FROM ejercicios WHERE rutina_id = ?').all(req.params.id);
  res.render('rutina-form', {
    title: 'Editar Rutina',
    rutina,
    ejercicios,
    dias: buildDias(rutina.dia_semana),
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Rutinas', url: '/rutinas' },
      { label: rutina.nombre, url: `/rutinas/${rutina.id}/editar`, active: true }
    ]
  });
});

router.post('/:id/editar', (req, res) => {
  const { nombre, descripcion, dia_semana } = req.body;
  req.db.prepare('UPDATE rutinas SET nombre=?, descripcion=?, dia_semana=? WHERE id=?')
    .run(nombre, descripcion, dia_semana, req.params.id);
  res.redirect('/dashboard');
});

router.post('/:id/eliminar', (req, res) => {
  req.db.prepare('DELETE FROM rutinas WHERE id = ?').run(req.params.id);
  res.redirect('/dashboard');
});

router.post('/:id/ejercicios', (req, res) => {
  const { nombre, series, reps, peso_kg, hasta_fallo } = req.body;
  req.db.prepare(
    'INSERT INTO ejercicios (rutina_id, nombre, series, reps, peso_kg, hasta_fallo) VALUES (?,?,?,?,?,?)'
  ).run(req.params.id, nombre, series, reps, peso_kg || null, hasta_fallo ? 1 : 0);
  res.redirect(`/rutinas/${req.params.id}/editar`);
});

router.post('/ejercicios/:eid/eliminar', (req, res) => {
  const db = req.db;
  const ej = db.prepare('SELECT rutina_id FROM ejercicios WHERE id=?').get(req.params.eid);
  db.prepare('DELETE FROM ejercicios WHERE id=?').run(req.params.eid);
  res.redirect(ej ? `/rutinas/${ej.rutina_id}/editar` : '/dashboard');
});

module.exports = router;
