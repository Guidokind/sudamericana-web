(() => {
  'use strict';

  const config = window.SUDAMERICANA_LLUVIAS || {};
  const API_BASE = String(config.apiBase || '').replace(/\/+$/, '');
  const TURNSTILE_SITEKEY = String(config.turnstileSiteKey || '');

  const mapEl = document.getElementById('rain-map');
  if (!mapEl || !window.L) return;

  const reportDialog = document.querySelector('[data-report-dialog]');
  const verifyDialog = document.querySelector('[data-verify-dialog]');
  const reportForm = document.querySelector('[data-report-form]');
  const verifyForm = document.querySelector('[data-verify-form]');
  const reportStatus = document.querySelector('[data-report-status]');
  const verifyStatus = document.querySelector('[data-verify-status]');
  const selectedLocationEl = document.querySelector('[data-selected-location]');
  const mapStatus = document.querySelector('[data-map-status]');
  const countEl = document.querySelector('[data-report-count]');
  const maskedEmailEl = document.querySelector('[data-masked-email]');

  let hours = 24;
  let selectedPoint = null;
  let pickedMarker = null;
  let pickMode = false;
  let pendingReportId = null;
  let turnstileWidgetId = null;
  let markersLayer = L.layerGroup();
  let loadController = null;

  const DEFAULT_CENTER = [-27.573, -60.715];

  const map = L.map(mapEl, {
    zoomControl: true,
    minZoom: 4,
    maxZoom: 19
  }).setView(DEFAULT_CENTER, 8);

 L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Imagery © Esri'
  }
).addTo(map);

  markersLayer.addTo(map);

  function setStatus(el, message, type = '') {
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', type === 'error');
    el.classList.toggle('is-ok', type === 'ok');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function relativeTime(iso) {
    const t = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - t);
    const min = Math.round(diff / 60000);
    if (min < 1) return 'Ahora';
    if (min < 60) return `Hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `Hace ${h} h`;
    const d = Math.round(h / 24);
    return `Hace ${d} d`;
  }

  function intensityLabel(value) {
    return ({ weak: 'Lluvia débil', moderate: 'Lluvia moderada', strong: 'Lluvia fuerte' })[value] || 'Intensidad informada';
  }

  function makeRainIcon(report) {
    const ongoing = report.ongoing ? ' is-ongoing' : '';
    return L.divIcon({
      className: 'rain-pin-wrap',
      html: `<div class="rain-pin${ongoing}">${Number(report.millimeters).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mm</div>`,
      iconSize: [68, 42],
      iconAnchor: [14, 36],
      popupAnchor: [14, -32]
    });
  }

  function popupHtml(report) {
    const place = report.placeLabel ? `<p><strong>${escapeHtml(report.placeLabel)}</strong></p>` : '';
    const comment = report.comment ? `<p>${escapeHtml(report.comment)}</p>` : '';
    return `
      <div class="rain-popup">
        <div class="rain-popup-top">
          <span class="rain-popup-mm">${Number(report.millimeters).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mm</span>
          <time>${escapeHtml(relativeTime(report.createdAt))}</time>
        </div>
        ${place}
        ${comment}
        <div class="rain-popup-meta">
          <span>${escapeHtml(intensityLabel(report.intensity))}</span>
          ${report.ongoing ? '<span>Sigue lloviendo</span>' : '<span>Finalizada</span>'}
          ${report.measured ? '<span>Pluviómetro</span>' : '<span>Estimación</span>'}
          <span>Email verificado</span>
        </div>
      </div>
    `;
  }

  async function loadReports({ fit = false } = {}) {
    if (!API_BASE) {
      mapStatus.textContent = 'Falta configurar la API de lluvias.';
      return;
    }

    if (loadController) loadController.abort();
    loadController = new AbortController();

    mapStatus.textContent = 'Actualizando reportes…';

    try {
      const bounds = map.getBounds();
      const bbox = [
        bounds.getSouth(),
        bounds.getWest(),
        bounds.getNorth(),
        bounds.getEast()
      ].map(v => v.toFixed(5)).join(',');

      const url = `${API_BASE}/reportes?hours=${hours}&bbox=${encodeURIComponent(bbox)}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: loadController.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || 'No se pudieron cargar los reportes.');

      markersLayer.clearLayers();

      const reports = Array.isArray(data.reports) ? data.reports : [];
      for (const report of reports) {
        const marker = L.marker([report.lat, report.lng], { icon: makeRainIcon(report) });
        marker.bindPopup(popupHtml(report), { maxWidth: 300 });
        marker.addTo(markersLayer);
      }

      countEl.textContent = `${reports.length} ${reports.length === 1 ? 'reporte' : 'reportes'}`;
      mapStatus.textContent = reports.length ? `Actualizado · últimas ${hours === 168 ? '7 días' : hours === 72 ? '3 días' : `${hours} h`}` : 'Sin reportes visibles en esta zona y período.';

      if (fit && reports.length) {
        const group = L.featureGroup(markersLayer.getLayers());
        map.fitBounds(group.getBounds().pad(.18), { maxZoom: 12 });
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      mapStatus.textContent = 'No se pudieron cargar los reportes. Reintentá en unos minutos.';
    }
  }

  function setSelectedPoint(lat, lng, source = 'Mapa') {
    selectedPoint = { lat: Number(lat), lng: Number(lng) };
    selectedLocationEl.textContent = `${source} · ${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}`;

    if (pickedMarker) pickedMarker.remove();
    pickedMarker = L.marker([selectedPoint.lat, selectedPoint.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="rain-picked-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map);
  }

  function requestLocation({ openDialog = false } = {}) {
    if (!navigator.geolocation) {
      if (openDialog) setStatus(reportStatus, 'Tu navegador no permite obtener ubicación.', 'error');
      else mapStatus.textContent = 'Tu navegador no permite obtener ubicación.';
      return;
    }

    const target = openDialog ? reportStatus : mapStatus;
    setStatus(target, 'Obteniendo ubicación…');

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 12);
        setSelectedPoint(latitude, longitude, 'Mi ubicación');
        setStatus(target, openDialog ? 'Ubicación seleccionada.' : 'Mostrando tu zona.', 'ok');
        if (openDialog && !reportDialog.open) reportDialog.showModal();
        loadReports();
      },
      () => setStatus(target, 'No se pudo obtener la ubicación. Podés elegir un punto en el mapa.', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  function renderTurnstile() {
    const host = document.querySelector('[data-turnstile-host]');
    if (!host || !window.turnstile) return;

    if (!TURNSTILE_SITEKEY || TURNSTILE_SITEKEY.startsWith('REEMPLAZAR')) {
      host.innerHTML = '<p class="rain-form-note">Turnstile todavía no está configurado.</p>';
      return;
    }

    if (turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
      return;
    }

    turnstileWidgetId = window.turnstile.render(host, {
      sitekey: TURNSTILE_SITEKEY,
      theme: 'light'
    });
  }

  function openReport() {
    setStatus(reportStatus, '');
    reportDialog.showModal();
    setTimeout(renderTurnstile, 150);
  }

  function closeReport() {
    if (reportDialog.open) reportDialog.close();
    pickMode = false;
    document.body.classList.remove('rain-pick-mode');
  }

  function enterPickMode() {
    closeReport();
    pickMode = true;
    document.body.classList.add('rain-pick-mode');
    mapStatus.textContent = 'Tocá el mapa para elegir el punto del reporte.';
  }

  map.on('click', event => {
    if (!pickMode) return;
    setSelectedPoint(event.latlng.lat, event.latlng.lng, 'Punto elegido');
    pickMode = false;
    document.body.classList.remove('rain-pick-mode');
    openReport();
  });

  map.on('moveend', () => loadReports());

  document.querySelectorAll('[data-hours]').forEach(button => {
    button.addEventListener('click', () => {
      hours = Number(button.dataset.hours) || 24;
      document.querySelectorAll('[data-hours]').forEach(b => b.classList.toggle('is-active', b === button));
      loadReports();
    });
  });

  document.querySelectorAll('[data-open-report]').forEach(button => button.addEventListener('click', openReport));
  document.querySelectorAll('[data-close-report]').forEach(button => button.addEventListener('click', closeReport));
  document.querySelector('[data-use-location]')?.addEventListener('click', () => requestLocation({ openDialog: false }));
  document.querySelector('[data-dialog-location]')?.addEventListener('click', () => requestLocation({ openDialog: true }));
  document.querySelector('[data-pick-map]')?.addEventListener('click', enterPickMode);

  reportDialog?.addEventListener('click', event => {
    if (event.target === reportDialog) closeReport();
  });

  reportForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedPoint) {
      setStatus(reportStatus, 'Primero seleccioná la ubicación del reporte.', 'error');
      return;
    }

    const formData = new FormData(reportForm);
    const token = formData.get('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || '';

    if (!token) {
      setStatus(reportStatus, 'Completá la verificación de seguridad.', 'error');
      return;
    }

    const submit = reportForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus(reportStatus, 'Enviando código…');

    try {
      const response = await fetch(`${API_BASE}/reportes/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          lat: selectedPoint.lat,
          lng: selectedPoint.lng,
          millimeters: Number(formData.get('millimeters')),
          intensity: formData.get('intensity'),
          ongoing: formData.get('ongoing') === 'on',
          measured: formData.get('measured') === 'on',
          comment: formData.get('comment'),
          placeLabel: formData.get('placeLabel'),
          turnstileToken: token
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || 'No se pudo iniciar el reporte.');

      pendingReportId = data.pendingId;
      maskedEmailEl.textContent = data.maskedEmail || 'tu email';
      closeReport();
      verifyDialog.showModal();
      verifyForm.querySelector('input[name="code"]')?.focus();
      setStatus(verifyStatus, '');
    } catch (error) {
      setStatus(reportStatus, error.message || 'No se pudo enviar el código.', 'error');
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    } finally {
      submit.disabled = false;
    }
  });

  verifyForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const code = new FormData(verifyForm).get('code');
    const submit = verifyForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus(verifyStatus, 'Verificando…');

    try {
      const response = await fetch(`${API_BASE}/reportes/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ pendingId: pendingReportId, code })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || 'No se pudo verificar el código.');

      setStatus(verifyStatus, 'Reporte publicado correctamente.', 'ok');
      setTimeout(() => {
        verifyDialog.close();
        verifyForm.reset();
        reportForm.reset();
        pendingReportId = null;
        selectedPoint = null;
        if (pickedMarker) { pickedMarker.remove(); pickedMarker = null; }
        selectedLocationEl.textContent = 'Sin seleccionar';
        loadReports({ fit: false });
      }, 900);
    } catch (error) {
      setStatus(verifyStatus, error.message || 'Código inválido.', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector('[data-cancel-verify]')?.addEventListener('click', () => {
    verifyDialog.close();
    pendingReportId = null;
  });

  window.addEventListener('load', () => {
    setTimeout(() => {
      if (window.turnstile && reportDialog?.open) renderTurnstile();
    }, 500);
  });

  loadReports({ fit: false });
  setInterval(() => loadReports(), 120000);
})();
