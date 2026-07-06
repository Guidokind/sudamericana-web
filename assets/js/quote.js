(() => {
  const form = document.querySelector('[data-quote-form]');
  const status = document.querySelector('[data-quote-status]');
  const copyButton = document.querySelector('[data-copy-quote]');
  if (!form) return;

  const submitButton = form.querySelector('button[type="submit"]');

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? '#9d1630' : '';
  }

  function buildPayload() {
    const data = new FormData(form);
    return {
      nombre: String(data.get('nombre') || '').trim(),
      telefono: String(data.get('telefono') || '').trim(),
      email: String(data.get('email') || '').trim(),
      localidad: String(data.get('localidad') || '').trim(),
      servicio: String(data.get('servicio') || '').trim(),
      superficie: String(data.get('superficie') || '').trim(),
      fecha: String(data.get('fecha') || '').trim(),
      detalle: String(data.get('detalle') || '').trim(),
      empresa: String(data.get('empresa') || '').trim()
    };
  }

  function buildSummary() {
    const data = buildPayload();
    return [
      'SOLICITUD DE CONTACTO — SUDAMERICANA TRABAJO AÉREO',
      '',
      `Nombre: ${data.nombre || '-'}`,
      `Teléfono: ${data.telefono || '-'}`,
      `Email: ${data.email || '-'}`,
      `Localidad: ${data.localidad || '-'}`,
      `Servicio: ${data.servicio || '-'}`,
      `Superficie estimada: ${data.superficie || '-'}`,
      `Fecha deseada: ${data.fecha || '-'}`,
      '',
      'Detalle:',
      data.detalle || '-'
    ].join('\n');
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) return;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Enviando…' : 'Enviar solicitud';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    setSubmitting(true);
    setStatus('Enviando tu solicitud…');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(buildPayload()),
        signal: controller.signal
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        // Respuesta no JSON: se maneja con el estado HTTP.
      }

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || 'No se pudo enviar la solicitud.');
      }

      form.reset();
      setStatus('Solicitud enviada. Recibimos tus datos y nos pondremos en contacto.');

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'contact_form_success' });
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'El envío demoró demasiado. Probá nuevamente.'
        : (error?.message || 'No se pudo enviar la solicitud. Probá nuevamente.');
      setStatus(message, true);
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  });

  copyButton?.addEventListener('click', async () => {
    if (!form.reportValidity()) return;

    try {
      await navigator.clipboard.writeText(buildSummary());
      setStatus('Solicitud copiada al portapapeles.');
    } catch {
      setStatus('No se pudo copiar automáticamente. Revisá los permisos del navegador.', true);
    }
  });
})();
