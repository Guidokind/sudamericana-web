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
  let submissionMode = 'anonymous';
  let reportTurnstileWidgetId = null;
  let authTurnstileWidgetId = null;
  let markersLayer = L.layerGroup();
  let loadController = null;

  let currentUser = null;
  let authId = null;
  let googleConfig = null;
  let googleScriptPromise = null;
  let googleInitialized = false;
  let pendingOpenReportAfterProfile = false;
  let rankingCache = [];

  const DEFAULT_CENTER = [-27.573, -60.715];
  const DEVICE_STORAGE_KEY = 'sudamericana_rain_device_id';

  const map = L.map(mapEl, {
    zoomControl: true,
    minZoom: 4,
    maxZoom: 19
  }).setView(DEFAULT_CENTER, 8);

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Imagery © Esri' }
  ).addTo(map);

  L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, opacity: 0.55, attribution: '&copy; OpenStreetMap contributors' }
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

  function apiError(message, status = 0, code = '') {
    const error = new Error(message || 'No se pudo completar la operación.');
    error.status = status;
    error.code = code;
    return error;
  }

  async function apiFetch(path, options = {}) {
    if (!API_BASE) throw apiError('Falta configurar la API de lluvias.');

    const init = { ...options, credentials: 'include' };
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    if (options.body && typeof options.body !== 'string') {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(options.body);
    }

    init.headers = headers;

    const response = await fetch(`${API_BASE}${path}`, init);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      const error = apiError(
        data.message || `Error ${response.status}`,
        response.status,
        data.code || ''
      );
      error.retryAfterSeconds = Number(data.retryAfterSeconds || 0);
      throw error;
    }

    return data;
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

  function randomDeviceId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(24);
    window.crypto?.getRandomValues?.(bytes);
    const randomPart = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${Date.now().toString(36)}-${randomPart || Math.random().toString(36).slice(2).repeat(3)}`;
  }

  function readDeviceCookie() {
    const prefix = `${DEVICE_STORAGE_KEY}=`;
    const item = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  function persistDeviceId(value) {
    try { localStorage.setItem(DEVICE_STORAGE_KEY, value); } catch (_) {}
    document.cookie = `${DEVICE_STORAGE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  }

  function getOrCreateDeviceId() {
    let value = '';
    try { value = localStorage.getItem(DEVICE_STORAGE_KEY) || ''; } catch (_) {}
    if (!value) value = readDeviceCookie();
    if (!value || value.length < 20) {
      value = randomDeviceId();
      persistDeviceId(value);
    }
    return value;
  }

  function trustInfo(report) {
    const status = String(report.trustStatus || '').toLowerCase();
    const type = String(report.reporterType || '').toLowerCase();
    if (status === 'confirmed') return { className: 'is-confirmed', label: 'Confirmado' };
    if (status === 'unverified' || type === 'anonymous') return { className: 'is-unverified', label: 'No verificado' };
    return { className: 'is-identified', label: 'Colaborador identificado' };
  }

  function makeRainIcon(report) {
    const ongoing = report.ongoing ? ' is-ongoing' : '';
    const trust = trustInfo(report);
    return L.divIcon({
      className: 'rain-pin-wrap',
      html: `<div class="rain-pin ${trust.className}${ongoing}">${Number(report.millimeters).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mm</div>`,
      iconSize: [68, 42],
      iconAnchor: [14, 36],
      popupAnchor: [14, -32]
    });
  }

  function popupHtml(report) {
    const place = report.placeLabel ? `<p><strong>${escapeHtml(report.placeLabel)}</strong></p>` : '';
    const comment = report.comment ? `<p>${escapeHtml(report.comment)}</p>` : '';
    const trust = trustInfo(report);
    const author = report.reporterUsername
      ? `<span class="rain-author-chip">@${escapeHtml(report.reporterUsername)}</span>`
      : '';

    return `
      <div class="rain-popup">
        <div class="rain-popup-top">
          <span class="rain-popup-mm">${Number(report.millimeters).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mm</span>
          <time>${escapeHtml(relativeTime(report.createdAt))}</time>
        </div>
        ${place}
        ${comment}
        <div class="rain-popup-meta">
          ${author}
          <span>${escapeHtml(intensityLabel(report.intensity))}</span>
          ${report.ongoing ? '<span>Sigue lloviendo</span>' : '<span>Finalizada</span>'}
          ${report.measured ? '<span>Pluviómetro</span>' : '<span>Estimación</span>'}
          <span class="rain-trust-badge ${trust.className}">${escapeHtml(trust.label)}</span>
        </div>
      </div>
    `;
  }

  async function loadReports({ fit = false } = {}) {
    if (!API_BASE) {
      if (mapStatus) mapStatus.textContent = 'Falta configurar la API de lluvias.';
      return;
    }

    if (loadController) loadController.abort();
    loadController = new AbortController();

    if (mapStatus) mapStatus.textContent = 'Actualizando reportes…';

    try {
      const bounds = map.getBounds();
      const bbox = [
        bounds.getSouth(),
        bounds.getWest(),
        bounds.getNorth(),
        bounds.getEast()
      ].map(v => v.toFixed(5)).join(',');

      const data = await apiFetch(`/reportes?hours=${hours}&bbox=${encodeURIComponent(bbox)}`, {
        signal: loadController.signal
      });

      markersLayer.clearLayers();

      const reports = Array.isArray(data.reports) ? data.reports : [];
      for (const report of reports) {
        const marker = L.marker([report.lat, report.lng], { icon: makeRainIcon(report) });
        marker.bindPopup(popupHtml(report), { maxWidth: 320 });
        marker.addTo(markersLayer);
      }

      if (countEl) countEl.textContent = `${reports.length} ${reports.length === 1 ? 'reporte' : 'reportes'}`;
      if (mapStatus) {
        mapStatus.textContent = reports.length
          ? `Actualizado · últimas ${hours === 168 ? '7 días' : hours === 72 ? '3 días' : `${hours} h`}`
          : 'Sin reportes visibles en esta zona y período.';
      }

      if (fit && reports.length) {
        const group = L.featureGroup(markersLayer.getLayers());
        map.fitBounds(group.getBounds().pad(.18), { maxZoom: 12 });
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      if (mapStatus) mapStatus.textContent = 'No se pudieron cargar los reportes. Reintentá en unos minutos.';
    }
  }

  function setSelectedPoint(lat, lng, source = 'Mapa') {
    selectedPoint = { lat: Number(lat), lng: Number(lng) };
    if (selectedLocationEl) {
      selectedLocationEl.textContent = `${source} · ${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}`;
    }

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
      else if (mapStatus) mapStatus.textContent = 'Tu navegador no permite obtener ubicación.';
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
        if (openDialog && reportDialog && !reportDialog.open) reportDialog.showModal();
        loadReports();
      },
      () => setStatus(target, 'No se pudo obtener la ubicación. Podés elegir un punto en el mapa.', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  function turnstileResponse(widgetId) {
    if (!window.turnstile || widgetId === null || widgetId === undefined) return '';
    try { return window.turnstile.getResponse(widgetId) || ''; } catch { return ''; }
  }

  function waitForTurnstile(callback, attempts = 30) {
    if (window.turnstile) {
      callback();
      return;
    }
    if (attempts <= 0) return;
    setTimeout(() => waitForTurnstile(callback, attempts - 1), 150);
  }

  function renderReportTurnstile() {
    const host = document.querySelector('[data-turnstile-host]');
    if (!host) return;

    if (!TURNSTILE_SITEKEY || TURNSTILE_SITEKEY.startsWith('REEMPLAZAR')) {
      host.innerHTML = '<p class="rain-form-note">Turnstile todavía no está configurado.</p>';
      return;
    }

    waitForTurnstile(() => {
      if (reportTurnstileWidgetId !== null) {
        window.turnstile.reset(reportTurnstileWidgetId);
        return;
      }
      reportTurnstileWidgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITEKEY,
        theme: 'light'
      });
    });
  }

  function resetReportTurnstile() {
    if (window.turnstile && reportTurnstileWidgetId !== null) {
      try { window.turnstile.reset(reportTurnstileWidgetId); } catch (_) {}
    }
  }

  function renderAuthTurnstile() {
    const host = document.querySelector('[data-auth-turnstile-host]');
    if (!host) return;

    if (!TURNSTILE_SITEKEY || TURNSTILE_SITEKEY.startsWith('REEMPLAZAR')) {
      host.innerHTML = '<p class="rain-form-note">Turnstile todavía no está configurado.</p>';
      return;
    }

    waitForTurnstile(() => {
      if (authTurnstileWidgetId !== null) {
        window.turnstile.reset(authTurnstileWidgetId);
        return;
      }
      authTurnstileWidgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITEKEY,
        theme: 'light'
      });
    });
  }

  function resetAuthTurnstile() {
    if (window.turnstile && authTurnstileWidgetId !== null) {
      try { window.turnstile.reset(authTurnstileWidgetId); } catch (_) {}
    }
  }

  function setSubmissionMode(mode) {
    const canRegistered = Boolean(currentUser?.profileCompleted);
    submissionMode = mode === 'registered' && canRegistered
      ? 'registered'
      : mode === 'email'
        ? 'email'
        : 'anonymous';

    const emailInput = reportForm?.querySelector('input[name="email"]');
    const emailField = emailInput?.closest('.rain-field');
    const submit = reportForm?.querySelector('button[type="submit"]');
    const choiceWrap = reportForm?.querySelector('[data-verification-choice-wrap]');
    const choiceButton = reportForm?.querySelector('[data-verification-choice]');
    const choiceText = reportForm?.querySelector('[data-verification-choice-text]');
    const note = reportForm?.querySelector('.rain-form-note');
    const identityBox = reportForm?.querySelector('[data-report-identity]');

    const wantsEmail = submissionMode === 'email';
    const registered = submissionMode === 'registered';

    if (emailInput) emailInput.required = wantsEmail;
    if (emailField) emailField.hidden = !wantsEmail;
    if (choiceWrap) choiceWrap.hidden = registered;

    if (submit) {
      submit.textContent = registered
        ? `Publicar como @${currentUser.username}`
        : wantsEmail
          ? 'Enviar código'
          : 'Publicar reporte';
    }

    if (choiceButton) choiceButton.textContent = wantsEmail ? 'Publicar anónimo' : 'Verificar con email';
    if (choiceText) {
      choiceText.textContent = wantsEmail
        ? 'Se enviará un código de 6 dígitos para identificar tu aporte.'
        : 'Opcional: identificá este aporte verificando un email.';
    }

    if (identityBox) {
      identityBox.hidden = !registered;
      if (registered) {
        identityBox.innerHTML = `
          <div class="rain-report-user">
            ${avatarHtml(currentUser, 'small')}
            <div>
              <strong>Publicando como @${escapeHtml(currentUser.username)}</strong>
              <span>Colaborador identificado · 1 reporte cada 30 minutos</span>
            </div>
          </div>
        `;
      }
    }

    if (note) {
      note.textContent = registered
        ? 'El punto visible será aproximado. Tu perfil público mostrará solo el alias.'
        : wantsEmail
          ? 'El punto visible será aproximado. Tu email no se mostrará públicamente.'
          : 'El punto visible será aproximado. El reporte se publicará como anónimo y no verificado.';
    }

    setStatus(reportStatus, '');
  }

  function prepareSubmissionUi() {
    const heroLead = document.querySelector('.rain-hero-copy .lead');
    if (heroLead) {
      heroLead.textContent = 'Consultá mediciones recientes y compartí cuánto llovió en tu campo o zona. Podés aportar anónimo o crear un perfil para sumar historial, puntos y medallas.';
    }

    const trustCards = document.querySelectorAll('.rain-trust-strip > div');
    if (trustCards[0]) {
      trustCards[0].innerHTML = '<strong>Confianza visible</strong><span>Rojo = anónimo no verificado, azul = colaborador identificado y verde = dato confirmado.</span>';
    }
    if (trustCards[2]) {
      trustCards[2].innerHTML = '<strong>Histórico cuidado</strong><span>Solo los datos confirmados pasan a la base histórica limpia.</span>';
    }

    const intro = document.querySelector('.rain-dialog-intro');
    if (intro) {
      intro.textContent = 'Elegí el punto en el mapa o usá tu ubicación. Los colaboradores registrados publican con su alias; también podés aportar sin cuenta.';
    }

    const turnstileHost = reportForm?.querySelector('[data-turnstile-host]');
    if (turnstileHost && !reportForm.querySelector('[data-report-identity]')) {
      const identity = document.createElement('div');
      identity.className = 'rain-report-identity';
      identity.dataset.reportIdentity = '';
      identity.hidden = true;
      turnstileHost.insertAdjacentElement('beforebegin', identity);
    }

    if (turnstileHost && !reportForm.querySelector('[data-verification-choice-wrap]')) {
      const wrap = document.createElement('div');
      wrap.className = 'rain-verification-choice';
      wrap.dataset.verificationChoiceWrap = '';
      wrap.innerHTML = `
        <div>
          <strong>Identificación opcional</strong>
          <span data-verification-choice-text>Opcional: identificá este aporte verificando un email.</span>
        </div>
        <button class="btn btn-secondary btn-small" type="button" data-verification-choice>Verificar con email</button>
      `;
      turnstileHost.insertAdjacentElement('afterend', wrap);

      wrap.querySelector('[data-verification-choice]')?.addEventListener('click', () => {
        setSubmissionMode(submissionMode === 'anonymous' ? 'email' : 'anonymous');
      });
    }

    setSubmissionMode(currentUser?.profileCompleted ? 'registered' : 'anonymous');
  }

  function clearReportFormAfterSuccess() {
    reportForm?.reset();
    selectedPoint = null;
    if (pickedMarker) {
      pickedMarker.remove();
      pickedMarker = null;
    }
    if (selectedLocationEl) selectedLocationEl.textContent = 'Sin seleccionar';
    setSubmissionMode(currentUser?.profileCompleted ? 'registered' : 'anonymous');
    resetReportTurnstile();
  }

  function closeReport() {
    if (reportDialog?.open) reportDialog.close();
    pickMode = false;
    document.body.classList.remove('rain-pick-mode');
  }

  function openReport() {
    if (currentUser && !currentUser.profileCompleted) {
      pendingOpenReportAfterProfile = true;
      openProfileDialog({ required: true });
      return;
    }

    setSubmissionMode(currentUser?.profileCompleted ? 'registered' : submissionMode);
    setStatus(reportStatus, '');
    reportDialog?.showModal();
    setTimeout(renderReportTurnstile, 120);
  }

  function enterPickMode() {
    closeReport();
    pickMode = true;
    document.body.classList.add('rain-pick-mode');
    if (mapStatus) mapStatus.textContent = 'Tocá el mapa para elegir el punto del reporte.';
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


  async function copyRainPageUrl(url) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();

    if (!copied) throw new Error('No se pudo copiar el enlace.');
  }

  async function shareRainPage(button) {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const url = canonical || new URL(window.location.pathname, window.location.origin).href;
    const originalHtml = button?.innerHTML || 'Compartir';

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Lluvias reportadas | Sudamericana',
          text: 'Consultá y compartí reportes recientes de lluvia de la comunidad rural.',
          url
        });
        return;
      }

      await copyRainPageUrl(url);

      if (button) {
        button.textContent = 'Enlace copiado';
        window.setTimeout(() => {
          button.innerHTML = originalHtml;
        }, 1800);
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;

      console.error(error);

      if (button) {
        button.textContent = 'No se pudo compartir';
        window.setTimeout(() => {
          button.innerHTML = originalHtml;
        }, 2200);
      }
    }
  }

  document.querySelectorAll('[data-open-report]').forEach(button => button.addEventListener('click', openReport));
  document.querySelectorAll('[data-close-report]').forEach(button => button.addEventListener('click', closeReport));
  document.querySelector('[data-use-location]')?.addEventListener('click', () => requestLocation({ openDialog: false }));
  document.querySelector('[data-share-rain]')?.addEventListener('click', event => shareRainPage(event.currentTarget));
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
    const token = turnstileResponse(reportTurnstileWidgetId)
      || String(formData.get('cf-turnstile-response') || '');

    if (!token) {
      setStatus(reportStatus, 'Completá la verificación de seguridad.', 'error');
      return;
    }

    const effectiveMode = currentUser?.profileCompleted ? 'registered' : submissionMode;

    if (effectiveMode === 'email') {
      const email = String(formData.get('email') || '').trim();
      if (!email) {
        setStatus(reportStatus, 'Ingresá un email para identificar el aporte.', 'error');
        return;
      }
    }

    const submit = reportForm.querySelector('button[type="submit"]');
    submit.disabled = true;

    setStatus(
      reportStatus,
      effectiveMode === 'registered'
        ? `Publicando como @${currentUser.username}…`
        : effectiveMode === 'email'
          ? 'Enviando código…'
          : 'Publicando reporte anónimo…'
    );

    try {
      const endpoint = effectiveMode === 'registered'
        ? '/reportes/registrado'
        : effectiveMode === 'email'
          ? '/reportes/iniciar'
          : '/reportes/anonimo';

      const payload = {
        lat: selectedPoint.lat,
        lng: selectedPoint.lng,
        millimeters: Number(formData.get('millimeters')),
        intensity: formData.get('intensity'),
        ongoing: formData.get('ongoing') === 'on',
        measured: formData.get('measured') === 'on',
        comment: formData.get('comment'),
        placeLabel: formData.get('placeLabel'),
        turnstileToken: token
      };

      if (effectiveMode === 'email') {
        payload.email = String(formData.get('email') || '').trim();
      } else if (effectiveMode === 'anonymous') {
        payload.deviceId = getOrCreateDeviceId();
      }

      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: payload
      });

      if (effectiveMode === 'email') {
        pendingReportId = data.pendingId;
        if (maskedEmailEl) maskedEmailEl.textContent = data.maskedEmail || 'tu email';
        setStatus(reportStatus, 'Código enviado. Revisá tu email.', 'ok');
        resetReportTurnstile();
        closeReport();
        verifyDialog?.showModal();
        setStatus(verifyStatus, '');
        verifyForm?.querySelector('input[name="code"]')?.focus();
        return;
      }

      if (effectiveMode === 'registered') {
        setStatus(reportStatus, `Reporte publicado como @${currentUser.username}.`, 'ok');
        if (mapStatus) mapStatus.textContent = `Reporte publicado por @${currentUser.username} · colaborador identificado.`;
      } else {
        setStatus(reportStatus, 'Reporte anónimo publicado correctamente.', 'ok');
        if (mapStatus) mapStatus.textContent = 'Reporte anónimo publicado · marcado en rojo como no verificado.';
      }

      setTimeout(async () => {
        closeReport();
        clearReportFormAfterSuccess();
        await loadReports({ fit: false });
        if (effectiveMode === 'registered') {
          await refreshSession({ silent: true });
          await loadRanking({ silent: true });
        }
      }, 800);
    } catch (error) {
      if (error.code === 'PROFILE_INCOMPLETE') {
        currentUser = currentUser ? { ...currentUser, profileCompleted: false } : null;
        renderAccountButton();
        closeReport();
        pendingOpenReportAfterProfile = true;
        openProfileDialog({ required: true });
        return;
      }

      const wait = Number(error.retryAfterSeconds || 0);
      const suffix = wait > 0 ? ` Podés volver a intentar en ${Math.ceil(wait / 60)} min.` : '';
      setStatus(reportStatus, `${error.message || 'No se pudo procesar el reporte.'}${suffix}`, 'error');
      resetReportTurnstile();
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
      await apiFetch('/reportes/verificar', {
        method: 'POST',
        body: { pendingId: pendingReportId, code }
      });

      setStatus(verifyStatus, 'Reporte publicado correctamente.', 'ok');
      setTimeout(() => {
        verifyDialog?.close();
        verifyForm.reset();
        pendingReportId = null;
        clearReportFormAfterSuccess();
        loadReports({ fit: false });
      }, 800);
    } catch (error) {
      setStatus(verifyStatus, error.message || 'Código inválido.', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector('[data-cancel-verify]')?.addEventListener('click', () => {
    verifyDialog?.close();
    pendingReportId = null;
  });

  function avatarHtml(user, size = 'normal') {
    const cls = size === 'small' ? ' is-small' : '';
    if (user?.avatarUrl) {
      return `<span class="rain-user-avatar${cls}"><img src="${escapeHtml(user.avatarUrl)}" alt=""></span>`;
    }

    const initial = String(user?.displayName || user?.username || 'C').trim().charAt(0).toUpperCase() || 'C';
    return `<span class="rain-user-avatar${cls}">${escapeHtml(initial)}</span>`;
  }

  function injectCommunityUi() {
    const mainNav = document.querySelector('.main-nav');
    if (mainNav && !document.querySelector('[data-account-button]')) {
      const accountButton = document.createElement('button');
      accountButton.type = 'button';
      accountButton.className = 'btn btn-secondary rain-account-button rain-account-button-nav';
      accountButton.dataset.accountButton = '';
      accountButton.setAttribute('aria-label', 'Ingresar o crear perfil de colaborador');
      accountButton.innerHTML = '<span class="rain-account-dot" aria-hidden="true"></span><span>Ingresar</span>';
      mainNav.appendChild(accountButton);
    }

    const workspace = document.querySelector('.rain-workspace');
    if (workspace && !document.querySelector('[data-ranking-section]')) {
      const section = document.createElement('section');
      section.className = 'site-shell rain-ranking-section';
      section.dataset.rankingSection = '';
      section.innerHTML = `
        <div class="rain-ranking-head">
          <div>
            <span class="eyebrow">Comunidad</span>
            <h2>Ranking de colaboradores</h2>
            <p>Los puntos se obtienen con aportes válidos y confirmados, no por cantidad de publicaciones.</p>
          </div>
          <button class="btn btn-secondary" type="button" data-open-ranking>Ver Top 100</button>
        </div>
        <div class="rain-ranking-preview" data-ranking-preview>
          <div class="rain-ranking-empty">El ranking aparecerá cuando haya colaboradores con aportes válidos.</div>
        </div>
      `;
      workspace.insertAdjacentElement('afterend', section);
    }

    if (!document.querySelector('[data-auth-dialog]')) {
      const host = document.createElement('div');
      host.innerHTML = `
        <dialog class="rain-dialog" data-auth-dialog aria-labelledby="auth-title">
          <div class="rain-dialog-card rain-auth-card">
            <div class="rain-dialog-head">
              <div>
                <span class="eyebrow">Comunidad rural</span>
                <h2 id="auth-title">Ingresar o crear perfil</h2>
              </div>
              <button class="rain-close" type="button" data-close-auth aria-label="Cerrar">×</button>
            </div>
            <p class="rain-dialog-intro">Entrá una vez y mantené la sesión abierta. Tu perfil suma aportes válidos, puntos y medallas.</p>

            <div class="rain-google-button" data-google-button>
              <span>Cargando acceso con Google…</span>
            </div>
            <p class="rain-form-status" data-google-status aria-live="polite"></p>

            <div class="rain-or"><span>o</span></div>

            <form data-auth-email-form>
              <label class="rain-field">
                <span>Continuar con email</span>
                <input class="input" type="email" name="email" autocomplete="email" maxlength="254" required placeholder="tu@email.com">
              </label>
              <div class="rain-turnstile" data-auth-turnstile-host></div>
              <p class="rain-form-status" data-auth-email-status aria-live="polite"></p>
              <button class="btn btn-primary rain-full-button" type="submit">Enviar código</button>
            </form>

            <p class="rain-auth-privacy">No usamos contraseñas propias. La sesión puede permanecer abierta mientras sigas usando el servicio.</p>
          </div>
        </dialog>

        <dialog class="rain-dialog" data-auth-code-dialog aria-labelledby="auth-code-title">
          <form class="rain-dialog-card rain-verify-card" data-auth-code-form>
            <div class="rain-dialog-head">
              <div>
                <span class="eyebrow">Acceso por email</span>
                <h2 id="auth-code-title">Ingresá el código</h2>
              </div>
              <button class="rain-close" type="button" data-close-auth-code aria-label="Cerrar">×</button>
            </div>
            <p>Enviamos un código de 6 dígitos a <strong data-auth-masked-email>tu email</strong>.</p>
            <label class="rain-field">
              <span>Código</span>
              <input class="input rain-code-input" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000">
            </label>
            <p class="rain-form-status" data-auth-code-status aria-live="polite"></p>
            <div class="rain-dialog-actions">
              <button class="btn btn-secondary" type="button" data-back-auth>Volver</button>
              <button class="btn btn-primary" type="submit">Ingresar</button>
            </div>
          </form>
        </dialog>

        <dialog class="rain-dialog" data-profile-dialog aria-labelledby="profile-title">
          <form class="rain-dialog-card rain-profile-card" data-profile-form>
            <div class="rain-dialog-head">
              <div>
                <span class="eyebrow">Tu identidad pública</span>
                <h2 id="profile-title" data-profile-title>Completá tu perfil</h2>
              </div>
              <button class="rain-close" type="button" data-close-profile aria-label="Cerrar">×</button>
            </div>
            <p class="rain-dialog-intro" data-profile-intro>Elegí cómo querés aparecer en el mapa y en el ranking.</p>

            <div class="rain-form-grid">
              <label class="rain-field">
                <span>Alias público</span>
                <div class="rain-alias-input">
                  <span>@</span>
                  <input class="input" type="text" name="username" minlength="3" maxlength="30" pattern="[A-Za-z0-9._-]{3,30}" autocomplete="username" required placeholder="campo_norte">
                </div>
                <small>Letras, números, punto, guion o guion bajo.</small>
              </label>

              <label class="rain-field">
                <span>Nombre visible</span>
                <input class="input" type="text" name="displayName" minlength="2" maxlength="60" required placeholder="Juan">
              </label>

              <label class="rain-field rain-field-wide">
                <span>Localidad <small>(opcional)</small></span>
                <input class="input" type="text" name="locality" maxlength="80" placeholder="Villa Ángela">
              </label>
            </div>

            <label class="rain-ranking-consent">
              <input type="checkbox" name="showInRanking" checked>
              <span><strong>Aparecer en el ranking público</strong><small>Solo se muestran alias, nombre visible, localidad, puntos y aportes válidos.</small></span>
            </label>

            <p class="rain-form-status" data-profile-status aria-live="polite"></p>
            <div class="rain-dialog-actions">
              <button class="btn btn-secondary" type="button" data-close-profile>Cancelar</button>
              <button class="btn btn-primary" type="submit">Guardar perfil</button>
            </div>
          </form>
        </dialog>

        <dialog class="rain-dialog" data-account-dialog aria-labelledby="account-title">
          <div class="rain-dialog-card rain-account-card">
            <div class="rain-dialog-head">
              <div>
                <span class="eyebrow">Mi cuenta</span>
                <h2 id="account-title">Perfil de colaborador</h2>
              </div>
              <button class="rain-close" type="button" data-close-account aria-label="Cerrar">×</button>
            </div>
            <div data-account-content></div>
            <div class="rain-dialog-actions">
              <button class="btn btn-secondary" type="button" data-edit-profile>Editar perfil</button>
              <button class="btn btn-secondary rain-danger-text" type="button" data-logout>Cerrar sesión</button>
            </div>
          </div>
        </dialog>

        <dialog class="rain-dialog" data-ranking-dialog aria-labelledby="ranking-title">
          <div class="rain-dialog-card rain-ranking-dialog-card">
            <div class="rain-dialog-head">
              <div>
                <span class="eyebrow">Top 100</span>
                <h2 id="ranking-title">Colaboradores</h2>
              </div>
              <button class="rain-close" type="button" data-close-ranking aria-label="Cerrar">×</button>
            </div>
            <p class="rain-dialog-intro">Ordenado por puntos y aportes válidos confirmados.</p>
            <div class="rain-ranking-full" data-ranking-full></div>
          </div>
        </dialog>
      `;

      const footer = document.querySelector('.site-footer');
      if (footer) {
        while (host.firstElementChild) footer.insertAdjacentElement('beforebegin', host.firstElementChild);
      } else {
        while (host.firstElementChild) document.body.appendChild(host.firstElementChild);
      }
    }

    bindCommunityEvents();
    renderAccountButton();
  }

  function bindCommunityEvents() {
    const accountButton = document.querySelector('[data-account-button]');
    accountButton?.addEventListener('click', () => {
      if (currentUser) openAccountDialog();
      else openAuthDialog();
    });

    document.querySelector('[data-open-ranking]')?.addEventListener('click', () => {
      renderFullRanking();
      document.querySelector('[data-ranking-dialog]')?.showModal();
    });

    document.querySelectorAll('[data-close-auth]').forEach(el => el.addEventListener('click', () => document.querySelector('[data-auth-dialog]')?.close()));
    document.querySelectorAll('[data-close-auth-code]').forEach(el => el.addEventListener('click', () => document.querySelector('[data-auth-code-dialog]')?.close()));
    document.querySelectorAll('[data-close-account]').forEach(el => el.addEventListener('click', () => document.querySelector('[data-account-dialog]')?.close()));
    document.querySelectorAll('[data-close-ranking]').forEach(el => el.addEventListener('click', () => document.querySelector('[data-ranking-dialog]')?.close()));

    document.querySelectorAll('[data-close-profile]').forEach(el => el.addEventListener('click', () => {
      const dialog = document.querySelector('[data-profile-dialog]');
      if (dialog?.dataset.required === '1') {
        pendingOpenReportAfterProfile = false;
      }
      dialog?.close();
    }));

    document.querySelector('[data-back-auth]')?.addEventListener('click', () => {
      document.querySelector('[data-auth-code-dialog]')?.close();
      openAuthDialog();
    });

    document.querySelector('[data-edit-profile]')?.addEventListener('click', () => {
      document.querySelector('[data-account-dialog]')?.close();
      openProfileDialog({ required: false });
    });

    document.querySelector('[data-logout]')?.addEventListener('click', logout);

    const authEmailForm = document.querySelector('[data-auth-email-form]');
    authEmailForm?.addEventListener('submit', startEmailAuth);

    const authCodeForm = document.querySelector('[data-auth-code-form]');
    authCodeForm?.addEventListener('submit', verifyEmailAuth);

    const profileForm = document.querySelector('[data-profile-form]');
    profileForm?.addEventListener('submit', saveProfile);

    document.querySelectorAll('dialog[data-auth-dialog], dialog[data-auth-code-dialog], dialog[data-account-dialog], dialog[data-ranking-dialog]').forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function renderAccountButton() {
    const button = document.querySelector('[data-account-button]');
    if (!button) return;

    if (!currentUser) {
      button.innerHTML = '<span class="rain-account-dot"></span> Ingresar';
      button.setAttribute('aria-label', 'Ingresar o crear perfil de colaborador');
      return;
    }

    button.innerHTML = `${avatarHtml(currentUser, 'small')}<span>@${escapeHtml(currentUser.username)}</span>`;
    button.setAttribute('aria-label', `Abrir perfil de @${currentUser.username}`);
  }

  function openAuthDialog() {
    const dialog = document.querySelector('[data-auth-dialog]');
    setStatus(document.querySelector('[data-google-status]'), '');
    setStatus(document.querySelector('[data-auth-email-status]'), '');
    dialog?.showModal();
    setTimeout(() => {
      initGoogleButton();
      renderAuthTurnstile();
    }, 100);
  }

  async function loadGoogleScript() {
    if (window.google?.accounts?.id) return;
    if (googleScriptPromise) return googleScriptPromise;

    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-identity]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = '';
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
      document.head.appendChild(script);
    });

    return googleScriptPromise;
  }

  async function getGoogleConfig() {
    if (googleConfig) return googleConfig;
    const data = await apiFetch('/usuarios/config');
    googleConfig = data;
    return data;
  }

  async function initGoogleButton() {
    const host = document.querySelector('[data-google-button]');
    const status = document.querySelector('[data-google-status]');
    if (!host) return;

    try {
      const [cfg] = await Promise.all([getGoogleConfig(), loadGoogleScript()]);
      if (!cfg.googleClientId) throw new Error('Google todavía no está configurado.');

      if (!googleInitialized) {
        window.google.accounts.id.initialize({
          client_id: cfg.googleClientId,
          callback: handleGoogleCredential,
          auto_select: false
        });
        googleInitialized = true;
      }

      host.innerHTML = '';
      window.google.accounts.id.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(380, Math.max(240, host.clientWidth || 360)),
        locale: 'es'
      });
    } catch (error) {
      console.error(error);
      host.innerHTML = '<button class="btn btn-secondary rain-full-button" type="button" disabled>Google no disponible</button>';
      setStatus(status, 'Podés continuar con email.', 'error');
    }
  }

  async function handleGoogleCredential(response) {
    const status = document.querySelector('[data-google-status]');
    if (!response?.credential) {
      setStatus(status, 'Google no devolvió una credencial válida.', 'error');
      return;
    }

    setStatus(status, 'Ingresando con Google…');

    try {
      const data = await apiFetch('/usuarios/google', {
        method: 'POST',
        body: { credential: response.credential }
      });

      document.querySelector('[data-auth-dialog]')?.close();
      await afterAuthentication(data.user);
    } catch (error) {
      setStatus(status, error.message || 'No se pudo ingresar con Google.', 'error');
    }
  }

  async function startEmailAuth(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const status = document.querySelector('[data-auth-email-status]');
    const submit = form.querySelector('button[type="submit"]');
    const email = String(new FormData(form).get('email') || '').trim();
    const turnstileToken = turnstileResponse(authTurnstileWidgetId);

    if (!turnstileToken) {
      setStatus(status, 'Completá la verificación de seguridad.', 'error');
      return;
    }

    submit.disabled = true;
    setStatus(status, 'Enviando código…');

    try {
      const data = await apiFetch('/usuarios/email/iniciar', {
        method: 'POST',
        body: { email, turnstileToken }
      });

      authId = data.authId;
      const masked = document.querySelector('[data-auth-masked-email]');
      if (masked) masked.textContent = data.maskedEmail || email;

      document.querySelector('[data-auth-dialog]')?.close();
      const codeDialog = document.querySelector('[data-auth-code-dialog]');
      codeDialog?.showModal();
      setStatus(document.querySelector('[data-auth-code-status]'), '');
      document.querySelector('[data-auth-code-form] input[name="code"]')?.focus();
      resetAuthTurnstile();
    } catch (error) {
      setStatus(status, error.message || 'No se pudo enviar el código.', 'error');
      resetAuthTurnstile();
    } finally {
      submit.disabled = false;
    }
  }

  async function verifyEmailAuth(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const status = document.querySelector('[data-auth-code-status]');
    const submit = form.querySelector('button[type="submit"]');
    const code = String(new FormData(form).get('code') || '').trim();

    submit.disabled = true;
    setStatus(status, 'Verificando…');

    try {
      const data = await apiFetch('/usuarios/email/verificar', {
        method: 'POST',
        body: { authId, code }
      });

      authId = null;
      form.reset();
      document.querySelector('[data-auth-code-dialog]')?.close();
      await afterAuthentication(data.user);
    } catch (error) {
      setStatus(status, error.message || 'Código inválido.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function afterAuthentication(user) {
    currentUser = user || null;
    renderAccountButton();
    prepareSubmissionUi();

    if (currentUser && !currentUser.profileCompleted) {
      openProfileDialog({ required: true });
    } else {
      await loadRanking({ silent: true });
    }
  }

  async function refreshSession({ silent = false } = {}) {
    try {
      const data = await apiFetch('/usuarios/me');
      currentUser = data.user || null;
    } catch (error) {
      if (error.status === 401) {
        currentUser = null;
      } else if (!silent) {
        console.error(error);
      }
    }

    renderAccountButton();
    prepareSubmissionUi();
    return currentUser;
  }

  function openProfileDialog({ required = false } = {}) {
    if (!currentUser) {
      openAuthDialog();
      return;
    }

    const dialog = document.querySelector('[data-profile-dialog]');
    const form = document.querySelector('[data-profile-form]');
    const title = document.querySelector('[data-profile-title]');
    const intro = document.querySelector('[data-profile-intro]');

    if (!dialog || !form) return;

    dialog.dataset.required = required ? '1' : '0';
    if (title) title.textContent = currentUser.profileCompleted ? 'Editar perfil' : 'Completá tu perfil';
    if (intro) {
      intro.textContent = currentUser.profileCompleted
        ? 'Actualizá cómo aparecés públicamente.'
        : 'Antes de publicar como colaborador, elegí tu alias público.';
    }

    form.elements.username.value = currentUser.username || '';
    form.elements.displayName.value = currentUser.displayName || '';
    form.elements.locality.value = currentUser.locality || '';
    form.elements.showInRanking.checked = currentUser.showInRanking !== false;
    setStatus(document.querySelector('[data-profile-status]'), '');

    dialog.showModal();
    setTimeout(() => form.elements.username.focus(), 100);
  }

  async function saveProfile(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const status = document.querySelector('[data-profile-status]');
    const submit = form.querySelector('button[type="submit"]');
    const data = new FormData(form);

    submit.disabled = true;
    setStatus(status, 'Guardando perfil…');

    try {
      const result = await apiFetch('/usuarios/perfil', {
        method: 'PATCH',
        body: {
          username: String(data.get('username') || '').trim().toLowerCase(),
          displayName: String(data.get('displayName') || '').trim(),
          locality: String(data.get('locality') || '').trim(),
          showInRanking: data.get('showInRanking') === 'on'
        }
      });

      currentUser = result.user;
      renderAccountButton();
      prepareSubmissionUi();
      setStatus(status, 'Perfil guardado.', 'ok');

      const dialog = document.querySelector('[data-profile-dialog]');
      setTimeout(async () => {
        dialog?.close();
        dialog.dataset.required = '0';
        await loadRanking({ silent: true });

        if (pendingOpenReportAfterProfile) {
          pendingOpenReportAfterProfile = false;
          openReport();
        }
      }, 500);
    } catch (error) {
      setStatus(status, error.message || 'No se pudo guardar el perfil.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  function renderAccountContent() {
    const host = document.querySelector('[data-account-content]');
    if (!host || !currentUser) return;

    const stats = currentUser.stats || {};
    const badges = Array.isArray(currentUser.badges) ? currentUser.badges : [];

    host.innerHTML = `
      <div class="rain-account-hero">
        ${avatarHtml(currentUser)}
        <div>
          <h3>@${escapeHtml(currentUser.username)}</h3>
          <p>${escapeHtml(currentUser.displayName || '')}${currentUser.locality ? ` · ${escapeHtml(currentUser.locality)}` : ''}</p>
        </div>
        <div class="rain-points-pill"><strong>${Number(currentUser.points || 0)}</strong><span>puntos</span></div>
      </div>

      <div class="rain-account-stats">
        <div><strong>${Number(stats.reportsTotal || 0)}</strong><span>reportes</span></div>
        <div><strong>${Number(stats.validContributions || 0)}</strong><span>aportes válidos</span></div>
        <div><strong>${Number(stats.reportsConfirmed || 0)}</strong><span>confirmados</span></div>
      </div>

      <div class="rain-badges-block">
        <div class="rain-subhead"><strong>Medallas</strong><span>${badges.length}</span></div>
        <div class="rain-badges-list">
          ${badges.length
            ? badges.map(b => `<span class="rain-badge" title="${escapeHtml(b.description || b.name)}"><b>${escapeHtml(b.icon || '🏅')}</b>${escapeHtml(b.name)}</span>`).join('')
            : '<p class="rain-muted">Tu primera medalla llegará con el primer aporte válido.</p>'}
        </div>
      </div>

      ${!currentUser.profileCompleted
        ? '<div class="rain-account-warning">Completá tu perfil para publicar como colaborador.</div>'
        : ''}
    `;
  }

  function openAccountDialog() {
    if (!currentUser) {
      openAuthDialog();
      return;
    }

    renderAccountContent();
    document.querySelector('[data-account-dialog]')?.showModal();
  }

  async function logout() {
    const button = document.querySelector('[data-logout]');
    if (button) button.disabled = true;

    try {
      await apiFetch('/usuarios/logout', { method: 'POST', body: {} });
    } catch (error) {
      console.error(error);
    } finally {
      currentUser = null;
      googleInitialized = false;
      renderAccountButton();
      prepareSubmissionUi();
      document.querySelector('[data-account-dialog]')?.close();
      if (button) button.disabled = false;
    }
  }

  function rankRow(item, compact = false) {
    const medal = item.position === 1 ? '🥇' : item.position === 2 ? '🥈' : item.position === 3 ? '🥉' : `#${item.position}`;
    return `
      <article class="rain-rank-row${compact ? ' is-compact' : ''}">
        <div class="rain-rank-position">${medal}</div>
        ${avatarHtml(item, 'small')}
        <div class="rain-rank-person">
          <strong>@${escapeHtml(item.username)}</strong>
          <span>${escapeHtml(item.displayName || '')}${item.locality ? ` · ${escapeHtml(item.locality)}` : ''}</span>
        </div>
        <div class="rain-rank-score">
          <strong>${Number(item.points || 0)}</strong>
          <span>pts</span>
        </div>
        ${compact ? '' : `<div class="rain-rank-valid"><strong>${Number(item.validContributions || 0)}</strong><span>válidos</span></div>`}
      </article>
    `;
  }

  async function loadRanking({ silent = false } = {}) {
    try {
      const data = await apiFetch('/ranking');
      rankingCache = Array.isArray(data.ranking)
        ? data.ranking.filter(item => Number(item.points || 0) > 0 || Number(item.validContributions || 0) > 0)
        : [];
      renderRankingPreview();
      renderFullRanking();
    } catch (error) {
      if (!silent) console.error(error);
    }
  }

  function renderRankingPreview() {
    const host = document.querySelector('[data-ranking-preview]');
    if (!host) return;

    if (!rankingCache.length) {
      host.innerHTML = '<div class="rain-ranking-empty">El ranking aparecerá cuando haya colaboradores con aportes válidos.</div>';
      return;
    }

    host.innerHTML = rankingCache.slice(0, 10).map(item => rankRow(item, true)).join('');
  }

  function renderFullRanking() {
    const host = document.querySelector('[data-ranking-full]');
    if (!host) return;

    if (!rankingCache.length) {
      host.innerHTML = '<div class="rain-ranking-empty">Todavía no hay colaboradores en el ranking.</div>';
      return;
    }

    host.innerHTML = rankingCache.map(item => rankRow(item, false)).join('');
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      if (reportDialog?.open) renderReportTurnstile();
    }, 400);
  });

  injectCommunityUi();
  prepareSubmissionUi();
  getOrCreateDeviceId();

  Promise.all([
    refreshSession({ silent: true }),
    loadReports({ fit: false }),
    loadRanking({ silent: true })
  ]).catch(console.error);

  setInterval(() => loadReports(), 120000);
})();