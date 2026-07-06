const ALLOWED_ORIGINS = new Set([
  'https://sudamericanasrl.com',
  'https://www.sudamericanasrl.com'
]);

const SENDER_EMAIL = 'web@sudamericanasrl.com';
const SENDER_NAME = 'Sudamericana Trabajo Aéreo';

const ALLOWED_HOURS = new Set([6, 24, 72, 168]);
const MAX_REPORTS = 1000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

function clean(value, max = 200) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 254).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -56 && lat <= -20 && lng >= -74 && lng <= -52;
}

function roundPublicCoordinate(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'tu email';
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${'*'.repeat(Math.max(2, local.length - shown.length))}@${domain}`;
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomCode() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, '0');
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function validateTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { ok: false, reason: 'TURNSTILE_SECRET_KEY no configurado.' };
  }

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const ip = clientIp(request);
  if (ip !== 'unknown') body.append('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body
  });

  const result = await response.json().catch(() => ({}));
  if (!result.success) return { ok: false, reason: 'Verificación de seguridad inválida.' };

  if (result.hostname && !['sudamericanasrl.com', 'www.sudamericanasrl.com'].includes(result.hostname)) {
    return { ok: false, reason: 'Hostname de verificación no permitido.' };
  }

  return { ok: true };
}

async function sendVerificationEmail(email, code, env) {
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/email/sending/send`;

  const payload = {
    to: email,
    from: { address: SENDER_EMAIL, name: SENDER_NAME },
    subject: `Código para publicar lluvia: ${code}`,
    text: [
      'Sudamericana Trabajo Aéreo',
      '',
      `Tu código de verificación es: ${code}`,
      '',
      'El código vence en 10 minutos.',
      'Si no intentaste publicar un reporte de lluvia, ignorá este mensaje.'
    ].join('\n'),
    html: `<!doctype html>
<html lang="es">
<body style="margin:0;padding:28px;background:#f6f3ed;color:#17120f;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #e4ded4;border-radius:18px;padding:28px">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#426f45;font-weight:700">
      Sudamericana Trabajo Aéreo
    </div>
    <h1 style="font-size:22px;margin:12px 0">Confirmá tu reporte de lluvia</h1>
    <p style="line-height:1.55;color:#4e4944">Ingresá este código en el sitio para publicar el reporte:</p>
    <div style="font-size:36px;letter-spacing:.18em;font-weight:800;padding:18px 0;color:#2f5733">${code}</div>
    <p style="font-size:13px;color:#6d665f;line-height:1.5">El código vence en 10 minutos. Si no intentaste publicar un reporte de lluvia, ignorá este mensaje.</p>
  </div>
</body>
</html>`
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CF_EMAIL_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  return response.ok && data?.success !== false;
}

function parseBbox(value) {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return null;
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) return null;
  return { south, west, north, east };
}

async function listReports(request, env, url) {
  const rawHours = Number(url.searchParams.get('hours') || 24);
  const hours = ALLOWED_HOURS.has(rawHours) ? rawHours : 24;
  const bbox = parseBbox(url.searchParams.get('bbox'));
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();

  let query = `
    SELECT id, lat, lng, millimeters, intensity, ongoing, measured,
           comment, place_label, created_at
    FROM rain_reports
    WHERE status = 'published' AND created_at >= ?
  `;
  const params = [cutoff];

  if (bbox) {
    query += ` AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;
    params.push(bbox.south, bbox.north, bbox.west, bbox.east);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(MAX_REPORTS);

  const result = await env.DB.prepare(query).bind(...params).all();
  const reports = (result.results || []).map(row => ({
    id: row.id,
    lat: roundPublicCoordinate(row.lat),
    lng: roundPublicCoordinate(row.lng),
    millimeters: Number(row.millimeters),
    intensity: row.intensity,
    ongoing: Boolean(row.ongoing),
    measured: Boolean(row.measured),
    comment: row.comment || '',
    placeLabel: row.place_label || '',
    createdAt: row.created_at
  }));

  return json(request, { ok: true, hours, reports });
}

async function startReport(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json(request, { ok: false, message: 'Origen no permitido.' }, 403);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json(request, { ok: false, message: 'Datos inválidos.' }, 400);
  }

  const email = normalizeEmail(input.email);
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const millimeters = Number(input.millimeters);
  const intensity = clean(input.intensity, 20);
  const ongoing = input.ongoing ? 1 : 0;
  const measured = input.measured ? 1 : 0;
  const comment = clean(input.comment, 220);
  const placeLabel = clean(input.placeLabel, 100);
  const turnstileToken = clean(input.turnstileToken, 2048);

  if (!validEmail(email)) {
    return json(request, { ok: false, message: 'Revisá el email ingresado.' }, 400);
  }
  if (!validLatLng(lat, lng)) {
    return json(request, { ok: false, message: 'Ubicación inválida.' }, 400);
  }
  if (!Number.isFinite(millimeters) || millimeters < 0.1 || millimeters > 500) {
    return json(request, { ok: false, message: 'Los milímetros deben estar entre 0,1 y 500.' }, 400);
  }
  if (!['weak', 'moderate', 'strong'].includes(intensity)) {
    return json(request, { ok: false, message: 'Seleccioná la intensidad observada.' }, 400);
  }
  if (!turnstileToken) {
    return json(request, { ok: false, message: 'Falta la verificación de seguridad.' }, 400);
  }

  const turnstile = await validateTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    return json(request, { ok: false, message: turnstile.reason }, 403);
  }

  if (!env.VERIFY_CODE_SECRET || !env.EMAIL_HASH_SALT || !env.IP_HASH_SALT) {
    console.error('Faltan secretos de hashing/verificación.');
    return json(request, { ok: false, message: 'Servicio temporalmente no disponible.' }, 503);
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 10 * 60000).toISOString();
  const ipHash = await sha256(`${env.IP_HASH_SALT}:${clientIp(request)}`);
  const reporterHash = await sha256(`${env.EMAIL_HASH_SALT}:${email}`);

  await env.DB.prepare(`DELETE FROM pending_rain_reports WHERE expires_at < ?`)
    .bind(createdAt).run();

  const rate = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM pending_rain_reports
    WHERE ip_hash = ? AND created_at >= ?
  `).bind(ipHash, new Date(now.getTime() - 3600000).toISOString()).first();

  if (Number(rate?.count || 0) >= 5) {
    return json(request, { ok: false, message: 'Demasiados intentos recientes. Esperá un rato y probá nuevamente.' }, 429);
  }

  const reporterRate = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM rain_reports
    WHERE reporter_hash = ? AND created_at >= ?
  `).bind(reporterHash, new Date(now.getTime() - 24 * 3600000).toISOString()).first();

  if (Number(reporterRate?.count || 0) >= 20) {
    return json(request, { ok: false, message: 'Se alcanzó el límite diario de reportes para este email.' }, 429);
  }

  const pendingId = crypto.randomUUID();
  const code = randomCode();
  const codeHash = await sha256(`${env.VERIFY_CODE_SECRET}:${pendingId}:${code}`);

  await env.DB.prepare(`
    INSERT INTO pending_rain_reports (
      id, email, reporter_hash, ip_hash, lat, lng, millimeters,
      intensity, ongoing, measured, comment, place_label,
      code_hash, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pendingId, email, reporterHash, ipHash, lat, lng, millimeters,
    intensity, ongoing, measured, comment || null, placeLabel || null,
    codeHash, createdAt, expiresAt
  ).run();

  const sent = await sendVerificationEmail(email, code, env);
  if (!sent) {
    await env.DB.prepare(`DELETE FROM pending_rain_reports WHERE id = ?`).bind(pendingId).run();
    return json(request, { ok: false, message: 'No se pudo enviar el código. Probá nuevamente.' }, 502);
  }

  return json(request, {
    ok: true,
    pendingId,
    maskedEmail: maskEmail(email),
    expiresInSeconds: 600
  });
}

async function verifyReport(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json(request, { ok: false, message: 'Origen no permitido.' }, 403);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json(request, { ok: false, message: 'Datos inválidos.' }, 400);
  }

  const pendingId = clean(input.pendingId, 80);
  const code = clean(input.code, 6);

  if (!pendingId || !/^\d{6}$/.test(code)) {
    return json(request, { ok: false, message: 'Ingresá el código de 6 dígitos.' }, 400);
  }

  const pending = await env.DB.prepare(`
    SELECT *
    FROM pending_rain_reports
    WHERE id = ?
  `).bind(pendingId).first();

  if (!pending) {
    return json(request, { ok: false, message: 'El reporte pendiente no existe o ya fue publicado.' }, 404);
  }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await env.DB.prepare(`DELETE FROM pending_rain_reports WHERE id = ?`).bind(pendingId).run();
    return json(request, { ok: false, message: 'El código venció. Volvé a iniciar el reporte.' }, 410);
  }

  const expected = await sha256(`${env.VERIFY_CODE_SECRET}:${pendingId}:${code}`);
  if (expected !== pending.code_hash) {
    return json(request, { ok: false, message: 'Código incorrecto.' }, 400);
  }

  const reportId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO rain_reports (
        id, reporter_hash, lat, lng, millimeters, intensity,
        ongoing, measured, comment, place_label, created_at, status, flags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 0)
    `).bind(
      reportId,
      pending.reporter_hash,
      pending.lat,
      pending.lng,
      pending.millimeters,
      pending.intensity,
      pending.ongoing,
      pending.measured,
      pending.comment,
      pending.place_label,
      createdAt
    ),
    env.DB.prepare(`DELETE FROM pending_rain_reports WHERE id = ?`).bind(pendingId)
  ]);

  return json(request, { ok: true, reportId, createdAt });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      if (request.method === 'GET' && url.pathname === '/') {
        return json(request, {
          ok: true,
          service: 'Sudamericana lluvias',
          status: 'online'
        });
      }

      if (request.method === 'GET' && url.pathname === '/reportes') {
        return await listReports(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/reportes/iniciar') {
        return await startReport(request, env);
      }

      if (request.method === 'POST' && url.pathname === '/reportes/verificar') {
        return await verifyReport(request, env);
      }

      return json(request, { ok: false, message: 'Ruta o método no permitido.' }, 405);
    } catch (error) {
      console.error('Error en Sudamericana Lluvias:', error);
      return json(request, { ok: false, message: 'No se pudo procesar la solicitud.' }, 500);
    }
  }
};
