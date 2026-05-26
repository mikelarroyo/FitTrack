(function () {
  'use strict';

  const select = document.querySelector('.skin-select');
  if (!select) return;

  // Sincronizar el <select> con el tema activo (viene del servidor via body.className)
  const body = document.getElementById('app-body');
  if (body) {
    const active = ['theme-base', 'theme-usability', 'theme-accessibility']
      .find(t => body.classList.contains(t));
    if (active) select.value = active;

    // A-lang: quitar lang="es" del <html> en tema no accesible (WCAG 3.1.1)
    if (active === 'theme-accessibility') {
      document.documentElement.removeAttribute('lang');
    }
  }

  select.addEventListener('change', function () {
    select.disabled = true;
    fetch('/set-tema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tema: this.value })
    }).then(() => location.reload());
  });
})();
