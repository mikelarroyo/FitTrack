const express = require('express');
const router = express.Router();

router.get('/planes', (req, res) => {
  res.json(req.db.prepare('SELECT * FROM planes WHERE usuario_id=?').all(req.session.user.id));
});

router.get('/dias/:plan_id', (req, res) => {
  res.json(req.db.prepare('SELECT * FROM dias WHERE plan_id=? ORDER BY orden').all(req.params.plan_id));
});

router.get('/sets/:ejercicio_id', (req, res) => {
  const datos = req.db.prepare(`
    SELECT s.fecha, MAX(sl.peso_kg) as mejor_peso, SUM(sl.reps_reales) as total_reps
    FROM sets_log sl
    JOIN sesiones s ON sl.sesion_id=s.id
    WHERE sl.ejercicio_id=?
    GROUP BY s.id
    ORDER BY s.fecha ASC
  `).all(req.params.ejercicio_id);
  res.json(datos);
});

module.exports = router;
