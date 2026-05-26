# FitTrack

Aplicación web de seguimiento de entrenamientos personales, desarrollada como práctica del módulo de **Diseño de Interfaces Web** (DAW).

El proyecto sirve de lienzo pedagógico para demostrar principios de usabilidad, Gestalt y accesibilidad web mediante un sistema de **tres temas CSS intercambiables en tiempo real**.

---

## Características

- Crear planes de entrenamiento con días y ejercicios (series, repeticiones, peso, hasta el fallo)
- Ejecutar sesiones registrando el peso real por serie y detectar récords personales (PR)
- Historial de sesiones y gráficos de progreso por ejercicio (Chart.js)
- Panel de administración: gestión de usuarios, roles y cuentas
- Sistema de tres skins CSS que introduce errores de usabilidad y accesibilidad de forma controlada
- 30 vídeos de análisis integrados (Responsive, Usabilidad, Accesibilidad)
- Diseño responsive con Bootstrap 5

## Temas CSS (skins)

| Tema | Propósito |
|---|---|
| ✅ **Base** | Diseño correcto — referencia de buenas prácticas |
| ❌ **Usabilidad** | Malas prácticas extraídas de las 10 heurísticas de Nielsen |
| ♿ **Accesibilidad** | Errores WCAG 2.1 detectables con ARC Toolkit |

Los errores se introducen **exclusivamente mediante CSS**, sin tocar el HTML ni la lógica de servidor.

## Tecnologías

Node.js 20 · Express 4 · SQLite 3 (`better-sqlite3`) · Handlebars · Bootstrap 5 · Chart.js · Docker

---

## Inicio rápido

### Con Docker (recomendado)

```bash
docker compose up -d
```

Abre **http://localhost:3000** en el navegador.

### Sin Docker

```bash
npm install
node server.js
```

## Credenciales de prueba

Se generan automáticamente en el primer arranque si la base de datos está vacía.

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@fittrack.com | admin123 |
| Usuario demo | usuario@fittrack.com | user123 |

---

## Autor

**Mikel Arroyo Gómez** — 2º DAW Presencial · Graduado en CAFYD  
Módulo: Diseño de Interfaces Web
