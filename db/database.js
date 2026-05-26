/**
 * database.js — FitTrack v2
 * Esquema: Usuario → Planes → Días → Ejercicios → Sesiones → Sets
 */
const initSqlJs = require('sql.js');
const bcrypt    = require('bcryptjs');
const fs        = require('fs');
const path      = require('path');

const DB_PATH = path.join(__dirname, 'fittrack.db');

let _db    = null;
let _ready = null;

async function getDB() {
  if (_db) return _db;
  if (_ready) return _ready;

  _ready = (async () => {
    const SQL        = await initSqlJs();
    const fileBuffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
    _db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

    _db.run('PRAGMA foreign_keys = ON;');

    // ── Detectar esquema antiguo (columna 'password' en vez de 'password_hash') ──
    const colInfo = _db.exec("PRAGMA table_info('usuarios')");
    if (colInfo.length && colInfo[0].values.length) {
      const cols = colInfo[0].values.map(r => r[1]);
      if (cols.includes('password') && !cols.includes('password_hash')) {
        // Esquema v1 → limpiar y recrear
        ['sets_log','sesiones','ejercicios','dias','planes','usuarios'].forEach(t =>
          _db.run(`DROP TABLE IF EXISTS ${t}`)
        );
      }
    }

    // ── Crear tablas ────────────────────────────────────────────────────────────
    _db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre        TEXT    NOT NULL,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        rol           TEXT    NOT NULL DEFAULT 'user',
        activo        INTEGER NOT NULL DEFAULT 1,
        creado_en     TEXT    NOT NULL DEFAULT (date('now'))
      );

      CREATE TABLE IF NOT EXISTS planes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        nombre      TEXT    NOT NULL,
        descripcion TEXT,
        activo      INTEGER NOT NULL DEFAULT 1,
        creado_en   DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dias (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id     INTEGER NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
        nombre      TEXT    NOT NULL,
        descripcion TEXT,
        dia_semana  TEXT,
        orden       INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ejercicios (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        dia_id      INTEGER NOT NULL REFERENCES dias(id) ON DELETE CASCADE,
        nombre      TEXT    NOT NULL,
        series      INTEGER NOT NULL DEFAULT 3,
        reps        INTEGER NOT NULL DEFAULT 10,
        peso_kg     REAL,
        hasta_fallo INTEGER NOT NULL DEFAULT 0,
        orden       INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sesiones (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        dia_id       INTEGER NOT NULL REFERENCES dias(id) ON DELETE CASCADE,
        fecha        DATE    NOT NULL DEFAULT (date('now')),
        notas        TEXT,
        duracion_seg INTEGER
      );

      CREATE TABLE IF NOT EXISTS sets_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id    INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
        ejercicio_id INTEGER NOT NULL REFERENCES ejercicios(id) ON DELETE CASCADE,
        num_set      INTEGER NOT NULL DEFAULT 1,
        peso_kg      REAL,
        reps_reales  INTEGER,
        hasta_fallo  INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Migración: añadir es_actual si no existe
    try { _db.run('ALTER TABLE planes ADD COLUMN es_actual INTEGER NOT NULL DEFAULT 0'); } catch(e) {}
    // Migración: añadir rpe (esfuerzo percibido) a sets_log
    try { _db.run('ALTER TABLE sets_log ADD COLUMN rpe INTEGER'); } catch(e) {}

    const count = _db.exec('SELECT COUNT(*) FROM usuarios');
    if ((count[0]?.values[0][0] ?? 0) === 0) _seed();

    persist();
    return _db;
  })();

  return _ready;
}

function _seed() {
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash  = bcrypt.hashSync('user123',  10);

  // Admin
  _db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES
    ('Administrador', 'admin@fittrack.com', '${adminHash}', 'admin', 1)`);

  // Usuario demo
  _db.run(`INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES
    ('Mikel Demo', 'usuario@fittrack.com', '${userHash}', 'user', 1)`);

  const demoId = _db.exec('SELECT id FROM usuarios WHERE email="usuario@fittrack.com"')[0].values[0][0];

  // ── Plan 1: Push Pull Legs ─────────────────────────────────────────────────
  _db.run(`INSERT INTO planes (usuario_id, nombre, descripcion) VALUES (${demoId},
    'Push Pull Legs (PPL)',
    'Clásica división de 3 días que trabaja cada grupo muscular con alta frecuencia semanal.')`);
  const pplId = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id, nombre, descripcion, dia_semana, orden) VALUES
    (${pplId},'Push','Pecho, hombros y tríceps','Lunes',1)`);
  const dPush = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id, nombre, descripcion, dia_semana, orden) VALUES
    (${pplId},'Pull','Espalda y bíceps','Miércoles',2)`);
  const dPull = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id, nombre, descripcion, dia_semana, orden) VALUES
    (${pplId},'Legs','Cuádriceps, femoral y gemelos','Viernes',3)`);
  const dLegs = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  [['Press banca',4,8,80],['Press banca inclinado',3,10,65],['Press militar',4,10,50],
   ['Fondos (dips)',3,12,null],['Extensiones tríceps polea',3,15,25]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dPush},'${n}',${s},${r},${p??'null'},${i})`));

  [['Dominadas',4,6,null],['Remo con barra',4,8,70],['Jalón al pecho',3,10,60],
   ['Curl bíceps con barra',3,12,30],['Curl martillo',3,12,14]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dPull},'${n}',${s},${r},${p??'null'},${i})`));

  [['Sentadilla',4,8,100],['Peso muerto rumano',3,10,80],['Prensa de piernas',3,15,150],
   ['Curl femoral',3,12,40],['Elevación de gemelos',4,20,60]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dLegs},'${n}',${s},${r},${p??'null'},${i})`));

  // ── Plan 2: Fuerza 5×5 ──────────────────────────────────────────────────────
  _db.run(`INSERT INTO planes (usuario_id, nombre, descripcion) VALUES (${demoId},
    'Fuerza Base 5×5',
    'Programa de fuerza con 2 entrenamientos alternos. Ideal para ganar fuerza máxima.')`);
  const fxfId = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id, nombre, descripcion, dia_semana, orden) VALUES
    (${fxfId},'Entrenamiento A','Sentadilla + Press banca + Remo','Lunes',1)`);
  const dA = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id, nombre, descripcion, dia_semana, orden) VALUES
    (${fxfId},'Entrenamiento B','Sentadilla + Press militar + Peso muerto','Miércoles',2)`);
  const dB = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  [['Sentadilla',5,5,80],['Press banca',5,5,60],['Remo con barra',5,5,65]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dA},'${n}',${s},${r},${p},${i})`));
  [['Sentadilla',5,5,80],['Press militar',5,5,45],['Peso muerto',1,5,100]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dB},'${n}',${s},${r},${p},${i})`));

  // ── Historial PPL (6 semanas) ────────────────────────────────────────────────
  const pushEjIds = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dPush} ORDER BY orden`)[0].values.map(r=>r[0]);
  const legsEjIds = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dLegs} ORDER BY orden`)[0].values.map(r=>r[0]);

  [['2026-04-06',[77.5,65,47.5]],['2026-04-13',[80,67.5,50]],['2026-04-20',[80,67.5,50]],
   ['2026-04-27',[82.5,70,52.5]],['2026-05-04',[82.5,70,52.5]],['2026-05-11',[85,72.5,55]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dPush},'${fecha}',2700)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${pushEjIds[0]},${s},${pesos[0]},${s<=3?8:7},0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${pushEjIds[1]},${s},${pesos[1]},10,0)`);
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${pushEjIds[2]},${s},${pesos[2]},10,0)`);
  });

  [['2026-04-10',[97.5,77.5,140]],['2026-04-17',[100,80,150]],['2026-04-24',[100,80,150]],
   ['2026-05-01',[102.5,82.5,160]],['2026-05-08',[105,85,160]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dLegs},'${fecha}',3000)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${legsEjIds[0]},${s},${pesos[0]},8,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${legsEjIds[1]},${s},${pesos[1]},10,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${legsEjIds[2]},${s},${pesos[2]},15,0)`);
  });

  // ── Plan 3: Torso / Pierna (Upper/Lower) ────────────────────────────────────
  _db.run(`INSERT INTO planes (usuario_id, nombre, descripcion) VALUES (${demoId},
    'Torso / Pierna',
    'Split de 4 días que trabaja cada músculo dos veces por semana. Combina fuerza e hipertrofia.')`);
  const ulId = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${ulId},'Torso A','Empuje y tirón de fuerza','Lunes',1)`);
  const dTorsoA = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${ulId},'Pierna A','Cuádriceps y femoral con fuerza','Martes',2)`);
  const dPiernaA = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${ulId},'Torso B','Empuje y tirón en hipertrofia','Jueves',3)`);
  const dTorsoB = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${ulId},'Pierna B','Glúteo, femoral y gemelos','Viernes',4)`);
  const dPiernaB = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  [['Press banca',4,5,82.5],['Remo con barra',4,5,72.5],['Press militar',4,6,52.5],
   ['Dominadas',3,6,null],['Curl bíceps con barra',3,8,32.5]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dTorsoA},'${n}',${s},${r},${p??'null'},${i})`));

  [['Sentadilla',4,5,102.5],['Peso muerto',3,5,122.5],['Prensa de piernas',3,10,162.5],
   ['Curl femoral',3,10,42.5]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dPiernaA},'${n}',${s},${r},${p},${i})`));

  [['Press inclinado mancuernas',4,10,30],['Jalón al pecho',4,10,65],
   ['Vuelos laterales',4,15,10],['Fondos (dips)',3,12,null],
   ['Extensiones tríceps polea',4,15,27.5],['Curl martillo',3,12,16]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dTorsoB},'${n}',${s},${r},${p??'null'},${i})`));

  [['Sentadilla búlgara',4,10,22.5],['Hip thrust',4,12,80],
   ['Extensiones cuádriceps',4,15,42.5],['Curl femoral tumbado',4,12,37.5],
   ['Elevación de gemelos',4,20,65]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dPiernaB},'${n}',${s},${r},${p},${i})`));

  // Historial Torso/Pierna — 5 semanas
  const torsoAEjs  = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dTorsoA}  ORDER BY orden`)[0].values.map(r=>r[0]);
  const piernaAEjs = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dPiernaA} ORDER BY orden`)[0].values.map(r=>r[0]);
  const torsoBEjs  = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dTorsoB}  ORDER BY orden`)[0].values.map(r=>r[0]);

  // Torso A: press banca progresa 77.5→82.5, remo 67.5→72.5, press militar 47.5→52.5
  [['2026-04-07',[77.5,67.5,47.5]],['2026-04-14',[80,70,50]],['2026-04-21',[80,70,50]],
   ['2026-04-28',[82.5,72.5,52.5]],['2026-05-05',[82.5,72.5,52.5]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dTorsoA},'${fecha}',3300)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoAEjs[0]},${s},${pesos[0]},5,0)`);
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoAEjs[1]},${s},${pesos[1]},5,0)`);
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoAEjs[2]},${s},${pesos[2]},6,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoAEjs[4]},${s},30,10,0)`);
  });

  // Pierna A: sentadilla 95→102.5, peso muerto 115→122.5
  [['2026-04-08',[95,115,155,40]],['2026-04-15',[97.5,117.5,157.5,42.5]],
   ['2026-04-22',[100,120,160,42.5]],['2026-04-29',[100,120,160,42.5]],
   ['2026-05-06',[102.5,122.5,162.5,42.5]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dPiernaA},'${fecha}',3600)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${piernaAEjs[0]},${s},${pesos[0]},5,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${piernaAEjs[1]},${s},${pesos[1]},5,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${piernaAEjs[2]},${s},${pesos[2]},10,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${piernaAEjs[3]},${s},${pesos[3]},10,0)`);
  });

  // Torso B: press inclinado 26→30, jalón 60→65
  [['2026-04-10',[26,60]],['2026-04-17',[27.5,62.5]],['2026-04-24',[27.5,62.5]],
   ['2026-05-01',[30,65]],['2026-05-08',[30,65]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dTorsoB},'${fecha}',3000)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoBEjs[0]},${s},${pesos[0]},10,0)`);
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoBEjs[1]},${s},${pesos[1]},10,0)`);
    for (let s=1;s<=4;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoBEjs[2]},${s},10,15,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${torsoBEjs[4]},${s},27.5,15,0)`);
  });

  // ── Plan 4: Full Body 3 días ─────────────────────────────────────────────────
  _db.run(`INSERT INTO planes (usuario_id, nombre, descripcion) VALUES (${demoId},
    'Full Body 3 Días',
    'Entrena todo el cuerpo cada sesión. Ideal para mantener fuerza y frecuencia alta con poco tiempo.')`);
  const fbId = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${fbId},'Día A','Sentadilla + Press banca + Remo','Lunes',1)`);
  const dFbA = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${fbId},'Día B','Peso muerto + Press inclinado + Jalón','Miércoles',2)`);
  const dFbB = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  _db.run(`INSERT INTO dias (plan_id,nombre,descripcion,dia_semana,orden) VALUES (${fbId},'Día C','Prensa + Fondos + Dominadas + Hip thrust','Viernes',3)`);
  const dFbC = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  [['Sentadilla',3,8,72.5],['Press banca',3,8,67.5],['Remo con barra',3,8,62.5],
   ['Press militar',3,10,42.5],['Curl bíceps',3,12,24]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dFbA},'${n}',${s},${r},${p},${i})`));

  [['Peso muerto',3,5,105],['Press inclinado',3,10,57.5],['Jalón al pecho',3,10,57.5],
   ['Vuelos laterales',3,15,9],['Tríceps polea',3,12,24]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dFbB},'${n}',${s},${r},${p},${i})`));

  [['Prensa de piernas',3,12,145],['Fondos (dips)',3,10,null],['Dominadas',3,8,null],
   ['Hip thrust',3,12,72.5],['Elevación de gemelos',4,20,52.5]].forEach(([n,s,r,p],i) =>
    _db.run(`INSERT INTO ejercicios (dia_id,nombre,series,reps,peso_kg,orden) VALUES (${dFbC},'${n}',${s},${r},${p??'null'},${i})`));

  // Historial Full Body — 6 semanas
  const fbAEjs = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dFbA} ORDER BY orden`)[0].values.map(r=>r[0]);
  const fbBEjs = _db.exec(`SELECT id FROM ejercicios WHERE dia_id=${dFbB} ORDER BY orden`)[0].values.map(r=>r[0]);

  [['2026-04-06',[65,60,55]],['2026-04-13',[67.5,62.5,57.5]],['2026-04-20',[67.5,62.5,57.5]],
   ['2026-04-27',[70,65,60]],['2026-05-04',[70,65,60]],['2026-05-11',[72.5,67.5,62.5]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dFbA},'${fecha}',2400)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbAEjs[0]},${s},${pesos[0]},8,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbAEjs[1]},${s},${pesos[1]},8,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbAEjs[2]},${s},${pesos[2]},8,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbAEjs[4]},${s},22.5,12,0)`);
  });

  [['2026-04-08',[97.5,52.5,52.5]],['2026-04-15',[100,55,55]],['2026-04-22',[100,55,55]],
   ['2026-04-29',[102.5,57.5,57.5]],['2026-05-06',[102.5,57.5,57.5]],['2026-05-13',[105,57.5,57.5]]
  ].forEach(([fecha,pesos]) => {
    _db.run(`INSERT INTO sesiones (dia_id,fecha,duracion_seg) VALUES (${dFbB},'${fecha}',2400)`);
    const sid = _db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbBEjs[0]},${s},${pesos[0]},5,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbBEjs[1]},${s},${pesos[1]},10,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbBEjs[2]},${s},${pesos[2]},10,0)`);
    for (let s=1;s<=3;s++) _db.run(`INSERT INTO sets_log VALUES (null,${sid},${fbBEjs[4]},${s},22.5,12,0)`);
  });
}

function persist() {
  if (!_db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

function makeStmt(sql) {
  return {
    run(...params) {
      _db.run(sql, params.flat());
      const rows = _db.exec('SELECT last_insert_rowid()');
      persist();
      return { lastInsertRowid: rows[0]?.values[0][0] };
    },
    get(...params) {
      const res = _db.exec(sql, params.flat());
      if (!res.length || !res[0].values.length) return undefined;
      return rowToObj(res[0].columns, res[0].values[0]);
    },
    all(...params) {
      const res = _db.exec(sql, params.flat());
      if (!res.length) return [];
      return res[0].values.map(row => rowToObj(res[0].columns, row));
    },
  };
}

function rowToObj(columns, row) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

const dbProxy = {
  prepare: (sql) => makeStmt(sql),
  exec:    (sql) => { _db.run(sql); persist(); },
};

module.exports = { getDB, dbProxy };
