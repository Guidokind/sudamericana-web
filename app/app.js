(() => {
  'use strict';
  const cfg = window.LLUVIAS_APP_CONFIG || {};
  const API = String(cfg.apiBase || '').replace(/\/$/, '');
  const SITEKEY = String(cfg.turnstileSiteKey || '');
  const VERSION = String(cfg.appVersion || '0.1.4');
  const DEFAULT_CENTER = { lat: -27.573, lng: -60.715 };
  const RINGS_KM = [25, 60, 100];
  const DB_NAME = 'lluvias-app-v1';
  const DB_VERSION = 1;
  let dbPromise = null;
  let map, basicLayer, satelliteImageryLayer, satelliteLabelsLayer, satelliteLayer, activeLayer;
  let currentUser = null, sessionResolved = false;
  let installation = null;
  let reportTurnstileId = null;
  let turnstilePromise = null;
  let lastProgressiveAnchor = null;
  let userLocation = null;
  let userLocationMarker = null;
  let progressiveRun = 0;
  let locationRequestInFlight = false;
  let locationRefineRun = 0;
  const reportsById = new Map();
  const markersById = new Map();

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'clientReportId' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function idbPut(store, value) { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = () => res(value); tx.onerror = () => rej(tx.error); }); }
  async function idbDelete(store, key) { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  async function idbAll(store) { const db = await openDb(); return new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); }); }

  function toast(message, ms = 2800) { const el = $('[data-toast]'); el.textContent = message; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms); }
  function setStatus(message, busy = true) { const el = $('[data-map-status]'); if (!el) return; el.querySelector('span:last-child').textContent = message; $('.pulse', el).style.display = busy ? '' : 'none'; }
  function kmBetween(a, b) { const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180, la1=a.lat*Math.PI/180, la2=b.lat*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
  function bboxForRadius(c, km) { const dLat=km/111.32, dLng=km/(111.32*Math.max(.2,Math.abs(Math.cos(c.lat*Math.PI/180)))); return `${(c.lng-dLng).toFixed(5)},${(c.lat-dLat).toFixed(5)},${(c.lng+dLng).toFixed(5)},${(c.lat+dLat).toFixed(5)}`; }

  function initMap() {
    const savedLocation = readSavedLocation();
    const savedView = readSavedView();
    const initial = savedLocation || savedView || DEFAULT_CENTER;
    const initialZoom = savedLocation ? 10 : (savedView?.zoom || 9);
    map = L.map('app-map', { zoomControl: false, preferCanvas: true, attributionControl: true })
      .setView([initial.lat, initial.lng], initialZoom);

    basicLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, updateWhenIdle: true, keepBuffer: 1, attribution: '&copy; OpenStreetMap'
    });

    satelliteImageryLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, updateWhenIdle: true, keepBuffer: 1, attribution: 'Imagery &copy; Esri' }
    );
    satelliteLabelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, updateWhenIdle: true, keepBuffer: 1, opacity: .95, attribution: 'Reference &copy; Esri' }
    );
    satelliteLayer = L.layerGroup([satelliteImageryLayer, satelliteLabelsLayer]);

    activeLayer = basicLayer.addTo(map);
    map.on('moveend', () => {
      const c = map.getCenter();
      localStorage.setItem('lluvias:last-view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
    });
    map.on('click', e => {
      if ($('[data-report-dialog]').open) setReportPoint(e.latlng.lat, e.latlng.lng, 'map', null);
    });
  }

  function readSavedLocation() {
    try {
      const saved = JSON.parse(localStorage.getItem('lluvias:last-location') || 'null');
      if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lng))) {
        return {
          lat: Number(saved.lat),
          lng: Number(saved.lng),
          accuracy: Number.isFinite(Number(saved.accuracy)) ? Number(saved.accuracy) : null,
          savedAt: saved.savedAt || null
        };
      }
    } catch {}
    return null;
  }

  function readSavedView() {
    try {
      const saved = JSON.parse(localStorage.getItem('lluvias:last-view') || 'null');
      if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lng))) {
        return {
          lat: Number(saved.lat),
          lng: Number(saved.lng),
          zoom: Number.isFinite(Number(saved.zoom)) ? Number(saved.zoom) : null
        };
      }
    } catch {}
    return null;
  }

  function initialMapAnchor() {
    return readSavedLocation() || readSavedView() || DEFAULT_CENTER;
  }

  function saveLocation(location) {
    localStorage.setItem('lluvias:last-location', JSON.stringify({
      lat: location.lat, lng: location.lng, accuracy: location.accuracy ?? null, savedAt: new Date().toISOString()
    }));
  }

  function showUserLocation(location, { center = true } = {}) {
    userLocation = { ...location };
    saveLocation(userLocation);
    const latlng = [userLocation.lat, userLocation.lng];
    if (!userLocationMarker) {
      userLocationMarker = L.marker(latlng, {
        icon: L.divIcon({ className: '', html: '<div class="user-location-marker"></div>', iconSize: [18,18], iconAnchor: [9,9] }),
        keyboard: false,
        interactive: false,
        zIndexOffset: 1000
      }).addTo(map);
    } else {
      userLocationMarker.setLatLng(latlng);
    }
    if (center) map.setView(latlng, Math.max(map.getZoom(), 10));
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const error = new Error('geolocation-unavailable');
        error.code = 0;
        return reject(error);
      }

      // Mismo patrón que ya funciona en /lluvias.html:
      // llamada directa por gesto del usuario, alta precisión, timeout 10 s y cache breve.
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
      );
    });
  }

  function geoErrorMessage(error) {
    if (Number(error?.code) === 1) return 'No pudimos obtener tu ubicación. Revisá que Safari tenga permiso de ubicación y tocá de nuevo.';
    if (Number(error?.code) === 2) return 'El teléfono no pudo obtener una posición. Probá de nuevo en un lugar con mejor señal GPS.';
    if (Number(error?.code) === 3) return 'La ubicación tardó demasiado. Tocá de nuevo para reintentar.';
    if (error?.message === 'geolocation-unavailable') return 'Este navegador no ofrece ubicación.';
    return 'No pudimos obtener tu ubicación. Tocá de nuevo para reintentar.';
  }

  function showLocationGate(message = '') {
    const gate = $('[data-location-gate]');
    if (!gate) return;
    gate.hidden = false;
    const msg = $('[data-location-gate-message]', gate);
    if (msg) msg.textContent = message;
  }

  function hideLocationGate() {
    const gate = $('[data-location-gate]');
    if (gate) gate.hidden = true;
  }

  function setLocatingUi(active) {
    $('[data-locate]')?.classList.toggle('is-locating', active);
    const start = $('[data-location-start]');
    if (start) {
      start.disabled = active;
      start.textContent = active ? 'BUSCANDO…' : 'USAR MI UBICACIÓN';
    }
  }

  async function refineUserLocation(baseLocation, { center = false, reload = true } = {}) {
    const run = ++locationRefineRun;
    try {
      const pos = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });
      if (run !== locationRefineRun) return;
      const fresh = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
      const baseAccuracy = Number(baseLocation?.accuracy);
      const freshAccuracy = Number(fresh.accuracy);
      const movedKm = kmBetween(baseLocation, fresh);
      const meaningfullyBetter = !Number.isFinite(baseAccuracy) || (Number.isFinite(freshAccuracy) && freshAccuracy + 50 < baseAccuracy);
      if (!meaningfullyBetter && movedKm < 0.35) return;
      showUserLocation(fresh, { center });
      if (reload) progressiveLoad({ lat: fresh.lat, lng: fresh.lng });
      setStatus(fresh.accuracy > 5000 ? 'Ubicación aproximada' : 'Ubicación actualizada', false);
    } catch {
      // La primera posición ya es utilizable; el refinamiento GPS es opcional.
    }
  }

  async function locateUser({ center = true, reload = true, announce = true, fromGesture = false } = {}) {
    if (locationRequestInFlight) return null;
    locationRequestInFlight = true;
    setLocatingUi(true);
    if (announce) setStatus('Obteniendo ubicación…', true);

    try {
      const pos = await getCurrentPosition();
      const accuracy = Number(pos.coords.accuracy);
      const location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(accuracy) ? accuracy : null
      };

      hideLocationGate();
      showUserLocation(location, { center });

      if (reload) {
        progressiveLoad({ lat: location.lat, lng: location.lng });
      }

      setStatus(
        Number(location.accuracy) > 1000
          ? 'Ubicación aproximada. Revisá el punto antes de publicar.'
          : 'Ubicación detectada',
        false
      );

      return location;
    } catch (error) {
      const message = geoErrorMessage(error);
      const fallback = readSavedLocation() || readSavedView() || DEFAULT_CENTER;

      // El GPS no debe dejar la app vacía: mantenemos/cargamos la zona visible.
      if (fallback && reload) {
        progressiveLoad({ lat: fallback.lat, lng: fallback.lng });
      }

      setStatus(reportsById.size ? 'Mostrando reportes de la zona' : 'No pudimos obtener tu ubicación', false);
      if (fromGesture) {
        showLocationGate(message);
        toast(message, 4200);
      }

      return null;
    } finally {
      locationRequestInFlight = false;
      setLocatingUi(false);
    }
  }


  function reportIcon(report) { return L.divIcon({ className: '', html: `<div class="rain-marker">${Math.round(report.millimeters)}<small>&nbsp;mm</small></div>`, iconSize: [48,34], iconAnchor:[24,17] }); }
  function upsertReport(report, persist = true) {
    if (!report?.id || !Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lng))) return;
    reportsById.set(report.id, report);
    if (persist) idbPut('reports', report).catch(()=>{});
    let marker = markersById.get(report.id);
    if (!marker) {
      marker = L.marker([report.lat, report.lng], { icon: reportIcon(report), keyboard: false }).addTo(map);
      markersById.set(report.id, marker);
    } else marker.setLatLng([report.lat, report.lng]);
    const when = new Date(report.observedAt || report.createdAt).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    marker.bindPopup(`<b>${Number(report.millimeters).toLocaleString('es-AR')} mm</b><br>${report.placeLabel || 'Reporte comunitario'}<br><small>Medido: ${when}</small>`);
  }

  async function loadCachedReports() { try { const rows = await idbAll('reports'); rows.forEach(r => upsertReport(r, false)); if (rows.length) setStatus(`${rows.length} reportes guardados`, false); } catch {} }

  async function fetchRing(center, radius) {
    const t0 = performance.now();
    const url = `${API}/reportes?hours=72&bbox=${encodeURIComponent(bboxForRadius(center, radius))}`;
    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) throw new Error('No se pudieron cargar reportes');
    const data = await res.json();
    (data.reports || []).forEach(r => upsertReport(r));
    return { count:(data.reports || []).length, ms:performance.now()-t0 };
  }

  async function progressiveLoad(center) {
    const run = ++progressiveRun;
    lastProgressiveAnchor = { ...center };
    for (let i=0;i<RINGS_KM.length;i++) {
      if (run !== progressiveRun) return;
      const radius = RINGS_KM[i];
      setStatus(i===0 ? `Buscando reportes a ${radius} km…` : `Ampliando zona a ${radius} km…`, true);
      try {
        const result = await fetchRing(center, radius);
        if (run !== progressiveRun) return;
        setStatus(`${reportsById.size} reportes disponibles`, false);
        const adaptivePause = result.ms > 3500 ? 2600 : result.ms > 1500 ? 1200 : 300;
        if (i < RINGS_KM.length-1) await sleep(adaptivePause);
        if (!navigator.onLine) return;
      } catch {
        setStatus(reportsById.size ? 'Mostrando datos guardados' : 'Sin conexión', false);
        return;
      }
    }
  }

  async function refreshSession() {
    try {
      const res = await fetch(`${API}/usuarios/me`, { credentials:'include' });
      const data = await res.json().catch(()=>({}));
      currentUser = res.ok && data.ok ? (data.user || null) : null;
    } catch { currentUser = null; }
    sessionResolved = true;
    renderAccount();
  }
  function renderAccount() {
    const btn = $('[data-account]'); btn.classList.remove('is-pending'); btn.removeAttribute('aria-busy');
    $('[data-account-label]').textContent = currentUser ? 'Mi cuenta' : 'Ingresar';
    $('.account-dot', btn).style.background = currentUser ? '#3f8a5a' : '#9aa39d';
  }

  async function ensureInstallation() {
    const stored = JSON.parse(localStorage.getItem('lluvias:installation') || 'null');
    if (stored?.token && stored?.id) { installation = stored; return stored; }
    try {
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      const res = await fetch(`${API}/app/instalaciones`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ platform:navigator.userAgentData?.platform || navigator.platform || 'unknown', appVersion:VERSION, installMode:standalone?'standalone':'browser' }) });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error('registro');
      installation = { id:data.installationId, token:data.token };
      localStorage.setItem('lluvias:installation', JSON.stringify(installation));
      return installation;
    } catch { return null; }
  }
  async function touchInstallation() {
    if (!installation) return;
    const day = new Date().toISOString().slice(0,10), key='lluvias:last-activity-day';
    if (localStorage.getItem(key)===day) return;
    try { await fetch(`${API}/app/actividad`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json','X-Lluvias-Install-Token':installation.token}, body:JSON.stringify({eventType:'app_open',appVersion:VERSION}) }); localStorage.setItem(key,day); } catch {}
  }

  function nowLocalInput() { const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000); return d.toISOString().slice(0,16); }
  function getDeviceId() { let id=localStorage.getItem('lluvias:device-id'); if (!id) { id=`pwa-${uid()}-${uid()}`; localStorage.setItem('lluvias:device-id',id); } return id; }
  function currentReportPoint() { const raw=$('[data-report-form]').dataset.point; if (raw) return JSON.parse(raw); const c=map.getCenter(); return {lat:c.lat,lng:c.lng,source:'map',accuracy:null}; }
  function setReportPoint(lat,lng,source='map',accuracy=null) { const form=$('[data-report-form]'); form.dataset.point=JSON.stringify({lat:Number(lat),lng:Number(lng),source,accuracy}); $('[data-location-title]').textContent=source==='geolocation'?'Ubicación detectada':'Punto elegido en mapa'; $('[data-location-detail]').textContent=accuracy?`Precisión aproximada ± ${Math.round(accuracy)} m`:`${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`; }

  async function loadTurnstile() {
    if (window.turnstile) return window.turnstile;
    if (turnstilePromise) return turnstilePromise;
    turnstilePromise = new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async=true; s.defer=true; s.onload=()=>{ const wait=()=>window.turnstile?resolve(window.turnstile):setTimeout(wait,50); wait(); }; s.onerror=reject; document.head.appendChild(s); });
    return turnstilePromise;
  }
  async function ensureReportTurnstile() {
    const host=$('[data-turnstile-host]');
    try { const ts=await loadTurnstile(); if (reportTurnstileId!==null) { try{ts.reset(reportTurnstileId);}catch{} return; } host.innerHTML=''; reportTurnstileId=ts.render(host,{sitekey:SITEKEY,theme:'light'}); }
    catch { host.innerHTML='<small>No se pudo cargar la verificación. Revisá la conexión.</small>'; }
  }
  function turnstileToken() { try { return window.turnstile && reportTurnstileId!==null ? window.turnstile.getResponse(reportTurnstileId)||'' : ''; } catch { return ''; } }

  async function openReport() {
    const d=$('[data-report-dialog]'), f=$('[data-report-form]');
    f.reset(); f.elements.observedAt.value=nowLocalInput(); f.elements.intensity.value='moderate'; f.elements.measured.checked=true;
    const point = userLocation || readSavedLocation();
    if (point) setReportPoint(point.lat, point.lng, 'geolocation', point.accuracy ?? null);
    else { const c=map.getCenter(); setReportPoint(c.lat,c.lng,'map',null); }
    $('[data-report-message]').textContent=''; d.showModal(); setTimeout(()=>f.elements.millimeters.focus(),80);
    ensureReportTurnstile();
  }
  function closeReport(){ $('[data-report-dialog]').close(); }

  async function useLocation() {
    $('[data-location-detail]').textContent='Buscando GPS…';
    const location = await locateUser({ center:true, reload:true, announce:true, fromGesture:true });
    if (!location) {
      $('[data-location-detail]').textContent='No se pudo obtener. Elegí el punto en el mapa.';
      return;
    }
    setReportPoint(location.lat, location.lng, 'geolocation', location.accuracy ?? null);
    if (Number(location.accuracy) > 5000) toast('Ubicación poco precisa. Podés tocar el mapa para corregirla.',4500);
  }

  function buildDraft(form) {
    const p=currentReportPoint(), observed=new Date(form.elements.observedAt.value).toISOString(), clientCreatedAt=new Date().toISOString();
    return { clientReportId:`pwa-${uid()}`, lat:p.lat,lng:p.lng,millimeters:Number(form.elements.millimeters.value),intensity:form.elements.intensity.value,ongoing:form.elements.ongoing.checked,measured:form.elements.measured.checked,comment:form.elements.comment.value.trim(),placeLabel:form.elements.placeLabel.value.trim(),locationSource:p.source,locationAccuracyM:p.accuracy,locationInputLabel:null,observedAt:observed,clientCreatedAt,queuedAt:clientCreatedAt };
  }
  async function queueDraft(draft) { await idbPut('pending', draft); await updatePendingChip(); toast('Reporte guardado. Quedó pendiente de envío.',4200); }
  async function updatePendingChip() { const rows=await idbAll('pending').catch(()=>[]); const chip=$('[data-pending-chip]'); chip.hidden=!rows.length; $('[data-pending-count]').textContent=rows.length; }

  async function sendDraft(draft, token) {
    const endpoint = currentUser?.profileCompleted ? '/reportes/registrado' : '/reportes/anonimo';
    const body={...draft,turnstileToken:token,deviceId:getDeviceId()}; delete body.queuedAt;
    const headers={'Content-Type':'application/json'}; if (installation?.token) headers['X-Lluvias-Install-Token']=installation.token;
    const res=await fetch(`${API}${endpoint}`,{method:'POST',credentials:'include',headers,body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if (!res.ok) { const err=new Error(data.message||'No se pudo enviar'); err.status=res.status; throw err; }
    return data;
  }

  async function submitReport(ev) {
    ev.preventDefault(); const form=ev.currentTarget, msg=$('[data-report-message]');
    if (!form.reportValidity()) return;
    let draft; try { draft=buildDraft(form); } catch { msg.textContent='Revisá la hora de medición.'; return; }
    if (!navigator.onLine) { await queueDraft(draft); closeReport(); return; }
    const token=turnstileToken(); if (!token) { msg.textContent='Esperá un instante y completá la verificación de seguridad.'; return; }
    const submit=$('.submit-report',form); submit.disabled=true; submit.textContent='ENVIANDO…'; msg.textContent='';
    try { await sendDraft(draft,token); toast('Reporte publicado. Gracias por aportar.'); closeReport(); progressiveLoad({lat:draft.lat,lng:draft.lng}); }
    catch (e) { if (!e.status || e.status>=500) { await queueDraft(draft); closeReport(); } else msg.textContent=e.message; }
    finally { submit.disabled=false; submit.textContent='ENVIAR REPORTE'; try{window.turnstile?.reset(reportTurnstileId);}catch{} }
  }

  async function showPending() {
    const rows=await idbAll('pending').catch(()=>[]); if (!rows.length) return;
    if (!navigator.onLine) return toast('Siguen guardados. Se enviarán cuando tengas conexión.');
    toast('Abrí “Informar lluvia” para validar seguridad y sincronizar pendientes.',5000);
  }

  async function openAccount() {
    const d=$('[data-account-dialog]'), c=$('[data-account-content]');
    if (!sessionResolved) c.innerHTML='<p class="muted">Consultando sesión…</p>';
    else if (currentUser) c.innerHTML=`<p><b>${escapeHtml(currentUser.displayName||currentUser.username)}</b><br><span class="muted">@${escapeHtml(currentUser.username||'')}</span></p><p>${Number(currentUser.points||0)} puntos</p>`;
    else c.innerHTML='<p>No iniciaste sesión. Podés seguir reportando sin cuenta.</p>';
    d.showModal();
  }
  function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }

  function bindUi() {
    $('[data-open-report]').addEventListener('click',openReport);
    $$('[data-close-report]').forEach(b=>b.addEventListener('click',closeReport));
    $('[data-use-location]').addEventListener('click',useLocation);
    $('[data-report-form]').addEventListener('submit',submitReport);
    $('[data-account]').addEventListener('click',openAccount);
    $('[data-close-account]').addEventListener('click',()=> $('[data-account-dialog]').close());
    $('[data-pending-chip]').addEventListener('click',showPending);
    $('[data-locate]').addEventListener('click',()=>locateUser({ center:true, reload:true, announce:true, fromGesture:true }));
    $('[data-location-start]').addEventListener('click',()=>locateUser({ center:true, reload:true, announce:true, fromGesture:true }));
    $('[data-location-manual]').addEventListener('click',()=>{
      const c = map.getCenter();
      hideLocationGate();
      setStatus('Zona elegida manualmente', false);
      progressiveLoad({ lat:c.lat, lng:c.lng });
      toast('Mové el mapa a tu zona. El reporte también puede corregirse tocando el mapa.', 4200);
    });
    $$('[data-map-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      const mode=btn.dataset.mapMode;
      if (activeLayer) map.removeLayer(activeLayer);
      activeLayer=mode==='satellite'?satelliteLayer:basicLayer;
      activeLayer.addTo(map);
      $$('[data-map-mode]').forEach(x=>x.classList.toggle('is-active',x===btn));
    }));
    window.addEventListener('online',()=>{
      toast('Volvió la conexión.');
      const anchor = userLocation || readSavedLocation() || readSavedView() || DEFAULT_CENTER;
      progressiveLoad({lat:anchor.lat,lng:anchor.lng});
      updatePendingChip();
    });
    window.addEventListener('offline',()=>setStatus('Sin conexión · mostrando datos guardados',false));
  }

  async function registerSw(){ if ('serviceWorker' in navigator) try{ await navigator.serviceWorker.register('./sw.js',{scope:'./'}); }catch{} }

  async function boot() {
    bindUi();
    initMap();
    registerSw();
    updatePendingChip();

    await loadCachedReports();

    const savedLocation = readSavedLocation();
    const savedView = readSavedView();
    const anchor = savedLocation || savedView || DEFAULT_CENTER;

    if (savedLocation) {
      showUserLocation(savedLocation, { center: true });
    }

    // Regla Sprint 1.4:
    // Los reportes siempre cargan aunque el GPS falle o el usuario no haya dado permiso.
    // Primero usamos ubicación guardada, luego última zona vista y por último Villa Ángela.
    progressiveLoad({ lat: anchor.lat, lng: anchor.lng });

    if (savedLocation) {
      setStatus('Usando tu última ubicación · tocá ◎ para actualizar', false);
    } else if (savedView) {
      showLocationGate();
      setStatus('Mostrando tu última zona vista · tocá “Usar mi ubicación” para ajustar', false);
    } else {
      showLocationGate();
      setStatus('Mostrando zona Villa Ángela · tocá “Usar mi ubicación” para ajustar', false);
    }

    // Nada de esto bloquea mapa ni reporte.
    Promise.resolve().then(async()=>{ await ensureInstallation(); touchInstallation(); });
    Promise.resolve().then(refreshSession);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
