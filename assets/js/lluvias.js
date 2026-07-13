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
  const locationConfidenceEl = document.querySelector('[data-location-confidence]');
  const addressInput = document.querySelector('[data-address-search]');
  const addressResultsEl = document.querySelector('[data-address-results]');
  const addressStatusEl = document.querySelector('[data-address-status]');

  let hours = 24;
  let selectedPoint = null;
  let selectedLocationMeta = { source: 'map', accuracyM: null, inputLabel: '' };
  let pickedMarker = null;
  let pickMode = false;
  let editPickMode = false;
  let editPickedMarker = null;
  let editingReport = null;
  let editSelectedPoint = null;
  let editSelectedLocationMeta = { source: 'map', accuracyM: null, inputLabel: '' };
  let myReportsCache = [];
  let localitySearchController = null;
  let localityDebounceTimer = null;
  const placeSearchControllers = { report: null, edit: null };
  const placeDebounceTimers = { report: null, edit: null };
  let pendingReportId = null;
  let submissionMode = 'anonymous';
  let reportTurnstileWidgetId = null;
  let authTurnstileWidgetId = null;
  let turnstileScriptPromise = null;
  let markersLayer = L.layerGroup();
  let loadController = null;

  let currentUser = null;
  let sessionResolved = false;
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

  const basicMapLayer = L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 1,
      attribution: '&copy; OpenStreetMap contributors'
    }
  );

  let satelliteMapLayer = null;
  let activeMapLayer = basicMapLayer.addTo(map);

  function getSatelliteMapLayer() {
    if (satelliteMapLayer) return satelliteMapLayer;

    const imagery = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: 'Imagery &copy; Esri'
      }
    );

    const references = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1,
        opacity: 0.95,
        attribution: 'Reference &copy; Esri'
      }
    );

    satelliteMapLayer = L.layerGroup([imagery, references]);
    return satelliteMapLayer;
  }

  function setRainMapMode(mode) {
    const nextMode = mode === 'satellite' ? 'satellite' : 'basic';
    const nextLayer = nextMode === 'satellite'
      ? getSatelliteMapLayer()
      : basicMapLayer;

    if (activeMapLayer !== nextLayer) {
      map.removeLayer(activeMapLayer);
      activeMapLayer = nextLayer.addTo(map);
    }

    document.querySelectorAll('[data-rain-map-mode]').forEach(button => {
      const active = button.dataset.rainMapMode === nextMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  document.querySelectorAll('[data-rain-map-mode]').forEach(button => {
    button.addEventListener('click', () => {
      setRainMapMode(button.dataset.rainMapMode);
    });
  });

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

  function locationAccuracyText(accuracyM) {
    if (accuracyM === null || accuracyM === undefined || accuracyM === '') return 'Revisá el pin antes de publicar.';
    const accuracy = Number(accuracyM);
    if (!Number.isFinite(accuracy) || accuracy < 0) return 'Revisá el pin antes de publicar.';
    if (accuracy <= 50) return `Precisión estimada alta · ± ${Math.round(accuracy)} m`;
    if (accuracy <= 500) return `Precisión estimada media · ± ${Math.round(accuracy)} m`;
    if (accuracy <= 5000) return `Ubicación aproximada · ± ${(accuracy / 1000).toFixed(1)} km`;
    return `Precisión baja · ± ${Math.round(accuracy / 1000)} km. Recomendamos corregir en mapa o buscar una dirección.`;
  }

  function renderSelectedLocation(label = '') {
    if (selectedLocationEl && selectedPoint) {
      selectedLocationEl.textContent = label || selectedLocationMeta.inputLabel
        || `${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}`;
    }
    if (locationConfidenceEl) {
      locationConfidenceEl.textContent = selectedPoint
        ? locationAccuracyText(selectedLocationMeta.accuracyM)
        : '';
      locationConfidenceEl.classList.toggle('is-warning', Number(selectedLocationMeta.accuracyM) > 1000);
    }
  }

  function setSelectedPoint(lat, lng, source = 'Mapa', options = {}) {
    selectedPoint = { lat: Number(lat), lng: Number(lng) };
    selectedLocationMeta = {
      source: options.locationSource || (source === 'Mi ubicación' ? 'geolocation' : source === 'Dirección' ? 'address' : 'map'),
      accuracyM: options.accuracyM === null || options.accuracyM === undefined || options.accuracyM === ''
        ? null
        : Number.isFinite(Number(options.accuracyM)) ? Number(options.accuracyM) : null,
      inputLabel: String(options.inputLabel || options.label || '').trim()
    };
    renderSelectedLocation(options.label || `${source} · ${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}`);

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

  async function reverseLookupSelectedPoint(lat, lng) {
    try {
      const data = await apiFetch(`/geocodificar-reversa?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      const label = String(data.result?.label || '').trim();
      if (!label || !selectedPoint) return;
      if (Math.abs(selectedPoint.lat - Number(lat)) > 1e-7 || Math.abs(selectedPoint.lng - Number(lng)) > 1e-7) return;
      selectedLocationMeta.inputLabel = label;
      renderSelectedLocation(label);
    } catch (_) {}
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
        const { latitude, longitude, accuracy } = pos.coords;
        map.setView([latitude, longitude], Number(accuracy) > 5000 ? 9 : 13);
        setSelectedPoint(latitude, longitude, 'Mi ubicación', {
          locationSource: 'geolocation',
          accuracyM: accuracy,
          label: 'Ubicación detectada'
        });
        setStatus(
          target,
          Number(accuracy) > 1000
            ? 'Ubicación aproximada. Revisá el pin o buscá una dirección antes de publicar.'
            : 'Ubicación detectada. Revisá el pin antes de publicar.',
          Number(accuracy) > 1000 ? 'error' : 'ok'
        );
        reverseLookupSelectedPoint(latitude, longitude);
        if (openDialog && reportDialog && !reportDialog.open) reportDialog.showModal();
        loadReports();
      },
      () => setStatus(target, 'No se pudo obtener la ubicación. Buscá una dirección o elegí un punto en el mapa.', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  function renderAddressResults(results, { edit = false } = {}) {
    const host = edit
      ? document.querySelector('[data-edit-address-results]')
      : addressResultsEl;
    if (!host) return;
    host.innerHTML = '';
    host.hidden = !results.length;

    for (const result of results) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rain-geocode-option';
      button.textContent = result.label;
      button.addEventListener('click', () => {
        if (edit) {
          setEditSelectedPoint(result.lat, result.lng, {
            source: 'address', accuracyM: null, inputLabel: result.label, label: result.label
          });
          map.setView([result.lat, result.lng], 16);
          document.querySelector('[data-edit-address-results]').hidden = true;
        } else {
          setSelectedPoint(result.lat, result.lng, 'Dirección', {
            locationSource: 'address', accuracyM: null, inputLabel: result.label, label: result.label
          });
          map.setView([result.lat, result.lng], 16);
          host.hidden = true;
          setStatus(addressStatusEl, 'Dirección seleccionada. Revisá el pin antes de publicar.', 'ok');
        }
      });
      host.appendChild(button);
    }
  }

  function placeSuggestionLabel(item) {
    return [item.name, item.admin1, item.country].filter(Boolean).join(', ');
  }

  function bindPlaceAutocomplete({ edit = false } = {}) {
    const input = edit
      ? document.querySelector('[data-edit-address-search]')
      : addressInput;
    const host = edit
      ? document.querySelector('[data-edit-address-results]')
      : addressResultsEl;
    const status = edit
      ? document.querySelector('[data-edit-address-status]')
      : addressStatusEl;
    if (!input || !host || input.dataset.placeAutocompleteBound === '1') return;

    input.dataset.placeAutocompleteBound = '1';
    const key = edit ? 'edit' : 'report';
    let activeIndex = -1;
    let items = [];

    const close = () => {
      host.hidden = true;
      activeIndex = -1;
      host.querySelectorAll('button').forEach(button => button.classList.remove('is-active'));
    };

    const select = index => {
      const item = items[index];
      if (!item) return;
      const label = item.label || placeSuggestionLabel(item);
      input.value = label;

      if (edit) {
        setEditSelectedPoint(item.lat, item.lng, {
          source: 'address', accuracyM: null, inputLabel: label, label
        });
        map.setView([item.lat, item.lng], 13);
        setStatus(status, 'Lugar seleccionado. Podés ajustar el pin o buscar una dirección exacta.', 'ok');
      } else {
        setSelectedPoint(item.lat, item.lng, 'Lugar', {
          locationSource: 'address', accuracyM: null, inputLabel: label, label
        });
        map.setView([item.lat, item.lng], 13);
        setStatus(status, 'Lugar seleccionado. Podés ajustar el pin o buscar una dirección exacta.', 'ok');
      }

      close();
    };

    input.addEventListener('input', () => {
      clearTimeout(placeDebounceTimers[key]);
      placeSearchControllers[key]?.abort();
      const q = input.value.trim();

      if (q.length < 3) {
        items = [];
        host.innerHTML = '';
        close();
        if (!q) setStatus(status, '');
        return;
      }

      placeDebounceTimers[key] = setTimeout(async () => {
        placeSearchControllers[key] = new AbortController();
        try {
          const endpoint = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=es&format=json`;
          const response = await fetch(endpoint, { signal: placeSearchControllers[key].signal });
          if (!response.ok) throw new Error('No se pudieron buscar lugares.');
          const data = await response.json();
          const raw = Array.isArray(data.results) ? data.results : [];

          items = raw
            .map(item => ({
              name: String(item.name || ''),
              admin1: String(item.admin1 || ''),
              country: String(item.country || ''),
              countryCode: String(item.country_code || ''),
              lat: Number(item.latitude),
              lng: Number(item.longitude)
            }))
            .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.name)
            .sort((a, b) => Number(b.countryCode === 'AR') - Number(a.countryCode === 'AR'))
            .slice(0, 6)
            .map(item => ({ ...item, label: placeSuggestionLabel(item) }));

          host.innerHTML = '';
          for (const [index, item] of items.entries()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rain-geocode-option';
            button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml([item.admin1, item.country].filter(Boolean).join(' · '))}</span>`;
            button.addEventListener('mousedown', event => event.preventDefault());
            button.addEventListener('click', () => select(index));
            host.appendChild(button);
          }

          host.hidden = !items.length;
          activeIndex = -1;
          if (items.length) {
            setStatus(status, 'Elegí una sugerencia o seguí escribiendo. Para calle y número exactos, usá Buscar.');
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            items = [];
            host.innerHTML = '';
            close();
          }
        }
      }, 300);
    });

    input.addEventListener('keydown', event => {
      if (!host.hidden && items.length) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          activeIndex = event.key === 'ArrowDown'
            ? (activeIndex + 1) % items.length
            : (activeIndex - 1 + items.length) % items.length;
          host.querySelectorAll('button').forEach((button, index) => {
            button.classList.toggle('is-active', index === activeIndex);
          });
          return;
        }

        if (event.key === 'Enter' && activeIndex >= 0) {
          event.preventDefault();
          select(activeIndex);
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return;
        }
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        searchAddress({ edit });
      }
    });

    input.addEventListener('blur', () => setTimeout(close, 140));
  }

  async function searchAddress({ edit = false } = {}) {
    const input = edit
      ? document.querySelector('[data-edit-address-search]')
      : addressInput;
    const status = edit
      ? document.querySelector('[data-edit-address-status]')
      : addressStatusEl;
    const q = String(input?.value || '').trim();
    if (q.length < 3) {
      setStatus(status, 'Escribí una calle, número, barrio o lugar.', 'error');
      return;
    }

    setStatus(status, 'Buscando dirección…');
    try {
      const data = await apiFetch(`/geocodificar-direccion?q=${encodeURIComponent(q)}`);
      const results = Array.isArray(data.results) ? data.results : [];
      renderAddressResults(results, { edit });
      setStatus(status, results.length ? 'Elegí una opción.' : 'No encontramos coincidencias.', results.length ? '' : 'error');
    } catch (error) {
      setStatus(status, error.message || 'No se pudo buscar la dirección.', 'error');
    }
  }

  function turnstileResponse(widgetId) {
    if (!window.turnstile || widgetId === null || widgetId === undefined) return '';
    try { return window.turnstile.getResponse(widgetId) || ''; } catch { return ''; }
  }

  function ensureTurnstileLoaded() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;

    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-turnstile-script]');

      if (existing) {
        existing.addEventListener('load', () => resolve(window.turnstile), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = '1';
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        turnstileScriptPromise = null;
        reject(new Error('No se pudo cargar Turnstile.'));
      };
      document.head.appendChild(script);
    });

    return turnstileScriptPromise;
  }

  async function renderReportTurnstile() {
    const host = document.querySelector('[data-turnstile-host]');
    if (!host) return;

    if (!TURNSTILE_SITEKEY || TURNSTILE_SITEKEY.startsWith('REEMPLAZAR')) {
      host.innerHTML = '<p class="rain-form-note">Turnstile todavía no está configurado.</p>';
      return;
    }

    try {
      await ensureTurnstileLoaded();

      if (reportTurnstileWidgetId !== null) {
        window.turnstile.reset(reportTurnstileWidgetId);
        return;
      }

      reportTurnstileWidgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITEKEY,
        theme: 'light'
      });
    } catch (error) {
      host.innerHTML = '<p class="rain-form-note">No pudimos cargar la verificación. Revisá tu conexión y reintentá.</p>';
    }
  }

  function resetReportTurnstile() {
    if (window.turnstile && reportTurnstileWidgetId !== null) {
      try { window.turnstile.reset(reportTurnstileWidgetId); } catch (_) {}
    }
  }

  async function renderAuthTurnstile() {
    const host = document.querySelector('[data-auth-turnstile-host]');
    if (!host) return;

    if (!TURNSTILE_SITEKEY || TURNSTILE_SITEKEY.startsWith('REEMPLAZAR')) {
      host.innerHTML = '<p class="rain-form-note">Turnstile todavía no está configurado.</p>';
      return;
    }

    try {
      await ensureTurnstileLoaded();

      if (authTurnstileWidgetId !== null) {
        window.turnstile.reset(authTurnstileWidgetId);
        return;
      }

      authTurnstileWidgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITEKEY,
        theme: 'light'
      });
    } catch (error) {
      host.innerHTML = '<p class="rain-form-note">No pudimos cargar la verificación. Revisá tu conexión y reintentá.</p>';
    }
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
    selectedLocationMeta = { source: 'map', accuracyM: null, inputLabel: '' };
    if (pickedMarker) {
      pickedMarker.remove();
      pickedMarker = null;
    }
    if (selectedLocationEl) selectedLocationEl.textContent = 'Sin seleccionar';
    if (locationConfidenceEl) locationConfidenceEl.textContent = '';
    if (addressInput) addressInput.value = '';
    if (addressResultsEl) { addressResultsEl.innerHTML = ''; addressResultsEl.hidden = true; }
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
    if (editPickMode) {
      setEditSelectedPoint(event.latlng.lat, event.latlng.lng, {
        source: 'map', accuracyM: null, inputLabel: '', label: 'Punto corregido en mapa'
      });
      editPickMode = false;
      document.body.classList.remove('rain-pick-mode');
      document.querySelector('[data-edit-report-dialog]')?.showModal();
      return;
    }
    if (!pickMode) return;
    setSelectedPoint(event.latlng.lat, event.latlng.lng, 'Punto elegido', { locationSource: 'map' });
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
  document.querySelector('[data-search-address]')?.addEventListener('click', () => searchAddress());
  bindPlaceAutocomplete();
  document.querySelector('[data-pick-map]')?.addEventListener('click', enterPickMode);

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
        locationSource: selectedLocationMeta.source,
        locationAccuracyM: selectedLocationMeta.accuracyM,
        locationInputLabel: selectedLocationMeta.inputLabel,
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
          await loadMyReports({ silent: true });
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
    let accountButton = document.querySelector('[data-account-button]');

    if (!accountButton && mainNav) {
      accountButton = document.createElement('button');
      accountButton.type = 'button';
      accountButton.className = 'btn btn-secondary rain-account-button rain-account-button-nav is-auth-pending';
      accountButton.dataset.accountButton = '';
      accountButton.setAttribute('aria-label', 'Cuenta de colaborador');
      accountButton.setAttribute('aria-busy', 'true');
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

              <label class="rain-field rain-field-wide rain-autocomplete-field">
                <span>Localidad <small>(opcional)</small></span>
                <div class="rain-autocomplete">
                  <input class="input" type="text" name="locality" maxlength="80" autocomplete="off" data-profile-locality placeholder="Villa Ángela">
                  <div class="rain-autocomplete-list" data-locality-suggestions hidden></div>
                </div>
                <small>Podés elegir una ciudad sugerida o escribir manualmente una colonia o paraje.</small>
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

        <dialog class="rain-dialog" data-edit-report-dialog aria-labelledby="edit-report-title">
          <form class="rain-dialog-card rain-edit-report-card" data-edit-report-form>
            <div class="rain-dialog-head">
              <div>
                <span class="eyebrow">Corrección rápida</span>
                <h2 id="edit-report-title">Editar reporte</h2>
              </div>
              <button class="rain-close" type="button" data-close-edit-report aria-label="Cerrar">×</button>
            </div>
            <p class="rain-dialog-intro" data-edit-report-intro>Podés corregir este reporte durante 15 minutos desde su publicación.</p>

            <div class="rain-address-block">
              <label class="rain-field">
                <span>Corregir localidad, dirección o lugar <small>(opcional)</small></span>
                <div class="rain-search-row">
                  <input class="input" type="search" data-edit-address-search placeholder="Ej. Villa Ángela o San Martín 742">
                  <button class="btn btn-secondary" type="button" data-edit-search-address>Buscar</button>
                </div>
              </label>
              <p class="rain-form-status rain-inline-status" data-edit-address-status aria-live="polite"></p>
              <div class="rain-geocode-results" data-edit-address-results hidden></div>
            </div>

            <div class="rain-location-box">
              <div>
                <small>Ubicación del reporte</small>
                <strong data-edit-selected-location>Sin seleccionar</strong>
                <small class="rain-location-confidence" data-edit-location-confidence></small>
              </div>
              <div class="rain-location-actions">
                <button class="btn btn-secondary btn-small" type="button" data-edit-use-location>Usar mi ubicación</button>
                <button class="btn btn-secondary btn-small" type="button" data-edit-pick-map>Elegir en mapa</button>
              </div>
            </div>

            <div class="rain-form-grid">
              <label class="rain-field">
                <span>Milímetros</span>
                <div class="rain-mm-input">
                  <input class="input" type="number" name="millimeters" inputmode="decimal" min="0.1" max="500" step="0.1" required>
                  <span>mm</span>
                </div>
              </label>
              <label class="rain-field">
                <span>Intensidad observada</span>
                <select class="input" name="intensity" required>
                  <option value="weak">Débil</option>
                  <option value="moderate">Moderada</option>
                  <option value="strong">Fuerte</option>
                </select>
              </label>
              <label class="rain-field rain-field-wide">
                <span>Referencia de zona <small>(opcional)</small></span>
                <input class="input" type="text" name="placeLabel" maxlength="100">
              </label>
            </div>
            <div class="rain-checks">
              <label><input type="checkbox" name="ongoing"> Sigue lloviendo</label>
              <label><input type="checkbox" name="measured"> Medido con pluviómetro</label>
            </div>
            <label class="rain-field">
              <span>Comentario breve <small>(opcional)</small></span>
              <textarea class="input rain-textarea" name="comment" maxlength="220" rows="3"></textarea>
            </label>
            <p class="rain-form-status" data-edit-report-status aria-live="polite"></p>
            <div class="rain-dialog-actions">
              <button class="btn btn-secondary" type="button" data-close-edit-report>Cancelar</button>
              <button class="btn btn-primary" type="submit">Guardar corrección</button>
            </div>
          </form>
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

    // Informa a main.js que el botón real ya tiene sus eventos conectados.
    const readyAccountButton = document.querySelector('[data-account-button]');
    if (readyAccountButton) {
      readyAccountButton.dataset.accountReady = '1';
      window.dispatchEvent(new CustomEvent('lluvias:account-ready'));
    }
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
    bindLocalityAutocomplete();

    document.querySelectorAll('[data-close-edit-report]').forEach(el => el.addEventListener('click', () => {
      document.querySelector('[data-edit-report-dialog]')?.close();
    }));
    document.querySelector('[data-edit-search-address]')?.addEventListener('click', () => searchAddress({ edit: true }));
    bindPlaceAutocomplete({ edit: true });
    document.querySelector('[data-edit-use-location]')?.addEventListener('click', requestEditLocation);
    document.querySelector('[data-edit-pick-map]')?.addEventListener('click', enterEditPickMode);
    document.querySelector('[data-edit-report-form]')?.addEventListener('submit', saveEditedReport);

    document.querySelector('[data-account-content]')?.addEventListener('click', event => {
      const button = event.target.closest('[data-edit-own-report]');
      if (button) openEditReport(button.dataset.editOwnReport);
    });

    document.querySelectorAll('dialog[data-auth-dialog], dialog[data-auth-code-dialog], dialog[data-account-dialog], dialog[data-ranking-dialog]').forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function renderAccountButton() {
    const button = document.querySelector('[data-account-button]');
    if (!button) return;

    if (!sessionResolved) {
      button.classList.add('is-auth-pending');
      button.setAttribute('aria-busy', 'true');
      return;
    }

    button.classList.remove('is-auth-pending');
    button.removeAttribute('aria-busy');

    if (!currentUser) {
      button.innerHTML = '<span class="rain-account-dot" aria-hidden="true"></span><span>Ingresar</span>';
      button.setAttribute('aria-label', 'Ingresar o crear perfil de colaborador');
      button.removeAttribute('title');
      return;
    }

    button.innerHTML = `${avatarHtml(currentUser, 'small')}<span>Mi cuenta</span>`;
    button.setAttribute('aria-label', `Abrir perfil de @${currentUser.username}`);
    button.setAttribute('title', `@${currentUser.username}`);
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
    sessionResolved = true;
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

    sessionResolved = true;
    renderAccountButton();
    prepareSubmissionUi();
    return currentUser;
  }

  function localityLabel(item) {
    return [item.name, item.admin1, item.country].filter(Boolean).join(' · ');
  }

  function bindLocalityAutocomplete() {
    const input = document.querySelector('[data-profile-locality]');
    const host = document.querySelector('[data-locality-suggestions]');
    if (!input || !host || input.dataset.autocompleteBound === '1') return;
    input.dataset.autocompleteBound = '1';

    let activeIndex = -1;
    let items = [];

    const close = () => {
      host.hidden = true;
      activeIndex = -1;
      host.querySelectorAll('button').forEach(button => button.classList.remove('is-active'));
    };

    const select = index => {
      const item = items[index];
      if (!item) return;
      input.value = [item.name, item.admin1].filter(Boolean).join(', ');
      close();
    };

    input.addEventListener('input', () => {
      clearTimeout(localityDebounceTimer);
      localitySearchController?.abort();
      const q = input.value.trim();
      if (q.length < 3) { items = []; host.innerHTML = ''; close(); return; }

      localityDebounceTimer = setTimeout(async () => {
        localitySearchController = new AbortController();
        try {
          const endpoint = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es&format=json`;
          const response = await fetch(endpoint, { signal: localitySearchController.signal });
          if (!response.ok) throw new Error('No se pudieron buscar localidades.');
          const data = await response.json();
          items = Array.isArray(data.results) ? data.results : [];
          host.innerHTML = '';
          for (const [index, item] of items.entries()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = `<strong>${escapeHtml(item.name || '')}</strong><span>${escapeHtml([item.admin1, item.country].filter(Boolean).join(' · '))}</span>`;
            button.addEventListener('mousedown', event => event.preventDefault());
            button.addEventListener('click', () => select(index));
            host.appendChild(button);
          }
          host.hidden = !items.length;
          activeIndex = -1;
        } catch (error) {
          if (error.name !== 'AbortError') { items = []; host.innerHTML = ''; close(); }
        }
      }, 300);
    });

    input.addEventListener('keydown', event => {
      if (host.hidden || !items.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = event.key === 'ArrowDown'
          ? (activeIndex + 1) % items.length
          : (activeIndex - 1 + items.length) % items.length;
        host.querySelectorAll('button').forEach((button, index) => button.classList.toggle('is-active', index === activeIndex));
      } else if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault(); select(activeIndex);
      } else if (event.key === 'Escape') {
        close();
      }
    });

    input.addEventListener('blur', () => setTimeout(close, 120));
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

      <div class="rain-my-reports-block">
        <div class="rain-subhead"><strong>Mis reportes recientes</strong><span>15 min para corregir</span></div>
        <div class="rain-my-reports-list" data-my-reports-list>
          <p class="rain-muted">Cargando reportes…</p>
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
    loadMyReports({ silent: true });
  }

  function editCountdown(report) {
    const ms = new Date(report.editDeadline).getTime() - Date.now();
    if (ms <= 0) return 'Edición cerrada';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `Editar · ${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function renderMyReports() {
    const host = document.querySelector('[data-my-reports-list]');
    if (!host) return;
    if (!myReportsCache.length) {
      host.innerHTML = '<p class="rain-muted">Todavía no tenés reportes registrados.</p>';
      return;
    }
    host.innerHTML = myReportsCache.map(report => `
      <article class="rain-own-report">
        <div>
          <strong>${Number(report.millimeters).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mm · ${escapeHtml(intensityLabel(report.intensity))}</strong>
          <span>${escapeHtml(report.placeLabel || report.locationInputLabel || 'Ubicación seleccionada')} · ${escapeHtml(relativeTime(report.createdAt))}</span>
        </div>
        <div class="rain-own-report-meta">
          <span class="rain-trust-badge ${trustInfo(report).className}">${escapeHtml(trustInfo(report).label)}</span>
          ${report.canEdit
            ? `<button class="btn btn-secondary btn-small" type="button" data-edit-own-report="${escapeHtml(report.id)}">${escapeHtml(editCountdown(report))}</button>`
            : '<span class="rain-edit-closed">Edición cerrada</span>'}
        </div>
      </article>
    `).join('');
  }

  async function loadMyReports({ silent = false } = {}) {
    if (!currentUser) return;
    try {
      const data = await apiFetch('/usuarios/reportes?limit=5');
      myReportsCache = Array.isArray(data.reports) ? data.reports : [];
      renderMyReports();
    } catch (error) {
      if (!silent) console.error(error);
      const host = document.querySelector('[data-my-reports-list]');
      if (host) host.innerHTML = '<p class="rain-muted">No se pudieron cargar tus reportes.</p>';
    }
  }

  function renderEditSelectedLocation(label = '') {
    const selected = document.querySelector('[data-edit-selected-location]');
    const confidence = document.querySelector('[data-edit-location-confidence]');
    if (selected && editSelectedPoint) {
      selected.textContent = label || editSelectedLocationMeta.inputLabel
        || `${editSelectedPoint.lat.toFixed(5)}, ${editSelectedPoint.lng.toFixed(5)}`;
    }
    if (confidence) confidence.textContent = editSelectedPoint ? locationAccuracyText(editSelectedLocationMeta.accuracyM) : '';
  }

  function setEditSelectedPoint(lat, lng, options = {}) {
    editSelectedPoint = { lat: Number(lat), lng: Number(lng) };
    editSelectedLocationMeta = {
      source: options.source || 'map',
      accuracyM: options.accuracyM === null || options.accuracyM === undefined || options.accuracyM === ''
        ? null
        : Number.isFinite(Number(options.accuracyM)) ? Number(options.accuracyM) : null,
      inputLabel: String(options.inputLabel || options.label || '').trim()
    };
    renderEditSelectedLocation(options.label || editSelectedLocationMeta.inputLabel);
    if (editPickedMarker) editPickedMarker.remove();
    editPickedMarker = L.marker([editSelectedPoint.lat, editSelectedPoint.lng], {
      icon: L.divIcon({ className: '', html: '<div class="rain-picked-marker is-edit"></div>', iconSize: [20,20], iconAnchor: [10,10] })
    }).addTo(map);
  }

  function openEditReport(reportId) {
    const report = myReportsCache.find(item => item.id === reportId);
    if (!report || !report.canEdit) return;
    editingReport = report;
    const form = document.querySelector('[data-edit-report-form]');
    const dialog = document.querySelector('[data-edit-report-dialog]');
    if (!form || !dialog) return;

    form.elements.millimeters.value = report.millimeters;
    form.elements.intensity.value = report.intensity;
    form.elements.ongoing.checked = report.ongoing;
    form.elements.measured.checked = report.measured;
    form.elements.placeLabel.value = report.placeLabel || '';
    form.elements.comment.value = report.comment || '';
    const address = document.querySelector('[data-edit-address-search]');
    if (address) address.value = report.locationInputLabel || '';

    setEditSelectedPoint(report.lat, report.lng, {
      source: report.locationSource || 'map',
      accuracyM: report.locationAccuracyM,
      inputLabel: report.locationInputLabel || '',
      label: report.locationInputLabel || `${Number(report.lat).toFixed(5)}, ${Number(report.lng).toFixed(5)}`
    });
    setStatus(document.querySelector('[data-edit-report-status]'), '');
    const intro = document.querySelector('[data-edit-report-intro]');
    if (intro) intro.textContent = `${editCountdown(report)} · ${Math.max(0, report.maxEdits - report.editCount)} correcciones disponibles.`;
    dialog.showModal();
  }

  function requestEditLocation() {
    if (!navigator.geolocation) {
      setStatus(document.querySelector('[data-edit-report-status]'), 'Tu navegador no permite obtener ubicación.', 'error');
      return;
    }
    setStatus(document.querySelector('[data-edit-report-status]'), 'Obteniendo ubicación…');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      setEditSelectedPoint(latitude, longitude, {
        source: 'geolocation', accuracyM: accuracy, inputLabel: '', label: 'Ubicación detectada'
      });
      map.setView([latitude, longitude], Number(accuracy) > 5000 ? 9 : 13);
      setStatus(
        document.querySelector('[data-edit-report-status]'),
        Number(accuracy) > 1000 ? 'Ubicación aproximada. Revisá el pin antes de guardar.' : 'Ubicación detectada. Revisá el pin.',
        Number(accuracy) > 1000 ? 'error' : 'ok'
      );
    }, () => setStatus(document.querySelector('[data-edit-report-status]'), 'No se pudo obtener la ubicación.', 'error'), {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 120000
    });
  }

  function enterEditPickMode() {
    document.querySelector('[data-edit-report-dialog]')?.close();
    editPickMode = true;
    document.body.classList.add('rain-pick-mode');
    if (mapStatus) mapStatus.textContent = 'Tocá el mapa para corregir la ubicación del reporte.';
  }

  async function saveEditedReport(event) {
    event.preventDefault();
    if (!editingReport || !editSelectedPoint) return;
    const form = event.currentTarget;
    const status = document.querySelector('[data-edit-report-status]');
    const submit = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    submit.disabled = true;
    setStatus(status, 'Guardando corrección…');

    try {
      const result = await apiFetch(`/reportes/${encodeURIComponent(editingReport.id)}`, {
        method: 'PATCH',
        body: {
          lat: editSelectedPoint.lat,
          lng: editSelectedPoint.lng,
          millimeters: Number(data.get('millimeters')),
          intensity: String(data.get('intensity') || ''),
          ongoing: data.get('ongoing') === 'on',
          measured: data.get('measured') === 'on',
          placeLabel: String(data.get('placeLabel') || '').trim(),
          comment: String(data.get('comment') || '').trim(),
          locationSource: editSelectedLocationMeta.source,
          locationAccuracyM: editSelectedLocationMeta.accuracyM,
          locationInputLabel: editSelectedLocationMeta.inputLabel
        }
      });
      if (result.user) currentUser = result.user;
      renderAccountButton();
      prepareSubmissionUi();
      setStatus(status, result.consensusReevaluated ? 'Corrección guardada y consenso reevaluado.' : 'Corrección guardada.', 'ok');
      await loadMyReports({ silent: true });
      await loadReports({ fit: false });
      setTimeout(() => document.querySelector('[data-edit-report-dialog]')?.close(), 650);
    } catch (error) {
      setStatus(status, error.message || 'No se pudo guardar la corrección.', 'error');
      await loadMyReports({ silent: true });
    } finally {
      submit.disabled = false;
    }
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


  // =========================================================
  // INSTALAR / ABRIR APP LLUVIAS
  // =========================================================
  let deferredInstallPrompt = null;

  const APP_URL = '/app/';

  function isIosDevice() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function isStandaloneMode() {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function installModalElements() {
    const modal = document.getElementById('install-app-modal');
    return {
      modal,
      panel: modal?.querySelector('[data-install-state]'),
      message: modal?.querySelector('[data-install-message]'),
      ios: modal?.querySelector('[data-install-ios]'),
      primary: modal?.querySelector('[data-install-primary]'),
      closeButtons: modal ? Array.from(modal.querySelectorAll('[data-install-close]')) : []
    };
  }

  function openInstallModal() {
    const els = installModalElements();
    if (!els.modal) {
      window.location.href = APP_URL;
      return;
    }

    const standalone = isStandaloneMode();
    const ios = isIosDevice();

    els.ios.hidden = true;
    els.primary.textContent = 'Abrir app';
    els.primary.onclick = () => { window.location.href = APP_URL; };

    if (standalone) {
      els.message.textContent = 'Lluvias ya está abierta como app.';
      els.primary.textContent = 'Abrir app';
    } else if (deferredInstallPrompt) {
      els.message.textContent = 'Podés instalar Lluvias para abrirla más rápido desde el teléfono.';
      els.primary.textContent = 'Instalar';
      els.primary.onclick = async () => {
        const promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = null;
        promptEvent.prompt();
        await promptEvent.userChoice.catch(() => null);
        closeInstallModal();
      };
    } else if (ios) {
      els.message.textContent = 'En iPhone se instala desde el menú Compartir de Safari.';
      els.ios.hidden = false;
      els.primary.textContent = 'Abrir app ahora';
    } else {
      els.message.textContent = 'Abrí la app de Lluvias. Si tu navegador permite instalarla, verás la opción de instalación.';
      els.primary.textContent = 'Abrir app';
    }

    els.closeButtons.forEach(button => {
      button.onclick = closeInstallModal;
    });

    els.modal.classList.add('is-open');
    els.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('rain-modal-open');

    // v1.1: asegurar que el modal quede visible aunque la página esté scrolleada abajo.
    window.setTimeout(() => {
      els.modal.scrollTop = 0;
      els.modal.querySelector('.rain-modal-card')?.scrollIntoView({ block: 'center', inline: 'center' });
    }, 0);
  }

  function closeInstallModal() {
    const { modal } = installModalElements();
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('rain-modal-open');
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const button = document.querySelector('[data-install-lluvias-app]');
    if (button) button.textContent = 'Instalar app';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const button = document.querySelector('[data-install-lluvias-app]');
    if (button) button.textContent = 'Abrir app';
  });

  document.querySelector('[data-install-lluvias-app]')?.addEventListener('click', openInstallModal);

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