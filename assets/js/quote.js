(() => {
  const form = document.querySelector('[data-quote-form]');
  const status = document.querySelector('[data-quote-status]');
  const copyButton = document.querySelector('[data-copy-quote]');
  if (!form) return;

  function buildSummary() {
    const data = new FormData(form);
    const lines = [
      'SOLICITUD DE PRESUPUESTO — SUDAMERICANA TRABAJO AÉREO',
      '',
      `Nombre: ${data.get('nombre') || '-'}`,
      `Teléfono: ${data.get('telefono') || '-'}`,
      `Email: ${data.get('email') || '-'}`,
      `Localidad: ${data.get('localidad') || '-'}`,
      `Servicio: ${data.get('servicio') || '-'}`,
      `Superficie estimada: ${data.get('superficie') || '-'}`,
      `Fecha deseada: ${data.get('fecha') || '-'}`,
      '',
      'Detalle:',
      `${data.get('detalle') || '-'}`
    ];
    return lines.join('\n');
  }

  function buildSubject() {
    const data = new FormData(form);
    const service = data.get('servicio') || 'Consulta';
    const location = data.get('localidad') || 'Sin localidad';
    return `Solicitud de presupuesto — ${service} — ${location}`;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const to = 'stachaco@gmail.com';
    const cc = 'guido@kindwerley.com';
    const url = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(buildSubject())}&body=${encodeURIComponent(buildSummary())}`;

    status.textContent = 'Abriendo tu aplicación de correo con el mensaje preparado para ambos destinatarios…';
    window.location.href = url;
  });

  copyButton?.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    try {
      await navigator.clipboard.writeText(buildSummary());
      status.textContent = 'Solicitud copiada al portapapeles.';
    } catch {
      status.textContent = 'No se pudo copiar automáticamente. Revisá los permisos del navegador.';
    }
  });
})();
