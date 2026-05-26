const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const db = req.db;

  const planes = db.prepare('SELECT id, nombre FROM planes WHERE usuario_id=? ORDER BY id').all(req.session.user.id);
  const planId = parseInt(req.query.plan, 10) || (planes[0]?.id ?? null);
  const ejId   = parseInt(req.query.ej, 10) || null;

  if (!planId) {
    return res.render('progreso', {
      title: 'Mi Progreso', planes, dias: [], datos: [], datosJson: '[]',
      stats: {}, ejercicioNombre: '—',
      breadcrumbs: [{ label: 'Inicio', url: '/dashboard' }, { label: 'Progreso', url: '/progreso', active: true }]
    });
  }

  // Marcar plan seleccionado
  planes.forEach(p => { p.sel = p.id === planId; });

  // Todos los ejercicios del plan agrupados por día
  const ejerciciosFlat = db.prepare(`
    SELECT e.id, e.nombre, d.id as dia_id, d.nombre as dia_nombre
    FROM ejercicios e
    JOIN dias d ON e.dia_id=d.id
    WHERE d.plan_id=?
    ORDER BY d.orden, e.orden
  `).all(planId);

  // Agrupar por día para el template
  const diasMap = {};
  ejerciciosFlat.forEach(e => {
    if (!diasMap[e.dia_id]) diasMap[e.dia_id] = { dia_nombre: e.dia_nombre, ejercicios: [] };
    diasMap[e.dia_id].ejercicios.push(e);
  });
  const dias = Object.values(diasMap);

  const ejSel = ejerciciosFlat.find(e => e.id === ejId) || ejerciciosFlat[0];
  dias.forEach(d => d.ejercicios.forEach(e => { e.sel = ejSel && e.id === ejSel.id; }));

  if (!ejSel) {
    return res.render('progreso', {
      title: 'Mi Progreso', planes, dias, datos: [], datosJson: '[]',
      stats: {}, ejercicioNombre: '—', planId,
      breadcrumbs: [{ label: 'Inicio', url: '/dashboard' }, { label: 'Progreso', url: '/progreso', active: true }]
    });
  }

  // Mejor set por sesión (x = fecha, y = peso)
  const datos = db.prepare(`
    SELECT s.fecha,
           MAX(sl.peso_kg)   as mejor_peso,
           MAX(sl.reps_reales) as mejores_reps,
           COUNT(sl.id)       as num_sets,
           SUM(sl.peso_kg * sl.reps_reales) as volumen
    FROM sets_log sl
    JOIN sesiones s ON sl.sesion_id=s.id
    JOIN dias d ON s.dia_id=d.id
    WHERE sl.ejercicio_id=? AND d.plan_id=?
    GROUP BY s.id
    ORDER BY s.fecha ASC, s.id ASC
  `).all(ejSel.id, planId);

  // 1RM estimado (Epley): peso × (1 + reps/30)
  datos.forEach(d => {
    if (d.mejor_peso && d.mejores_reps) {
      d.epley = +(d.mejor_peso * (1 + d.mejores_reps / 30)).toFixed(1);
    }
    d.peso_kg = d.mejor_peso;
    d.reps_reales = d.mejores_reps;
  });

  const stats = {};
  const pesos = datos.map(d => d.mejor_peso).filter(Boolean);
  if (pesos.length) {
    stats.mejor = Math.max(...pesos);
    stats.ultimo = datos[datos.length - 1].mejor_peso;
    stats.diferencia = +(stats.ultimo - pesos[0]).toFixed(2);
    stats.positivo = stats.diferencia > 0;
    stats.epleyMax = Math.max(...datos.map(d => d.epley).filter(Boolean));
  }

  res.render('progreso', {
    title: 'Mi Progreso',
    planes, planId,
    dias,
    ejercicioNombre: ejSel.nombre,
    ejId: ejSel.id,
    datos,
    datosJson: JSON.stringify(datos),
    stats,
    breadcrumbs: [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Progreso', url: '/progreso', active: true }
    ]
  });
});

module.exports = router;
