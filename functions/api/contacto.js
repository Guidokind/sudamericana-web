const DESTINATION_EMAIL = 'info@sudamericanasrl.com';
const SENDER_EMAIL = 'web@sudamericanasrl.com';
const MAX_BODY_BYTES = 20_000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function clean(value, maxLength) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function readPayload(input) {
  return {
    nombre: clean(input.nombre, 120),
    telefono: clean(input.telefono, 80),
    email: clean(input.email, 254),
    localidad: clean(input.localidad, 160),
    servicio: clean(input.servicio, 100),
    superficie: clean(input.superficie, 100),
    fecha: clean(input.fecha, 40),
    detalle: clean(input.detalle, 3000),
    empresa: clean(input.empresa, 200)
  };
}

function requiredFieldsMissing(data) {
  return !data.nombre || !data.telefono || !data.localidad || !data.servicio || !data.superficie;
}

function buildText(data) {
  return [
    'NUEVA SOLICITUD DESDE SUDAMERICANASRL.COM',
    '',
    `Nombre: ${data.nombre}`,
    `Teléfono: ${data.telefono}`,
    `Email: ${data.email || '-'}`,
    `Localidad: ${data.localidad}`,
    `Servicio: ${data.servicio}`,
    `Superficie estimada: ${data.superficie}`,
    `Fecha deseada: ${data.fecha || '-'}`,
    '',
    'Detalle:',
    data.detalle || '-',
    '',
    'Origen: formulario web de Sudamericana Trabajo Aéreo'
  ].join('\n');
}

function buildHtml(data) {
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e7e2d9;font-weight:600;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e7e2d9;vertical-align:top">${escapeHtml(value || '-')}</td>
    </tr>`;

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f6f3ed;color:#262722;font-family:Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e7e2d9;border-radius:14px;overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #e7e2d9">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#697064">Sudamericana Trabajo Aéreo</div>
        <h1 style="font-size:22px;line-height:1.25;margin:8px 0 0">Nueva solicitud desde el sitio web</h1>
      </div>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">
        ${row('Nombre', data.nombre)}
        ${row('Teléfono', data.telefono)}
        ${row('Email', data.email)}
        ${row('Localidad', data.localidad)}
        ${row('Servicio', data.servicio)}
        ${row('Superficie estimada', data.superficie)}
        ${row('Fecha deseada', data.fecha)}
      </table>
      <div style="padding:24px 28px">
        <div style="font-weight:600;margin-bottom:8px">Detalle</div>
        <div style="white-space:pre-wrap;line-height:1.55">${escapeHtml(data.detalle || '-')}</div>
      </div>
    </div>
  </body>
</html>`;
}

async function handlePost(context) {
  const { request, env } = context;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return jsonResponse({ ok: false, message: 'Formato de solicitud no válido.' }, 415);
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, message: 'La solicitud es demasiado grande.' }, 413);
    }

    let rawBody;
    try {
      rawBody = await request.text();
    } catch {
      return jsonResponse({ ok: false, message: 'No se pudo leer la solicitud.' }, 400);
    }

    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, message: 'La solicitud es demasiado grande.' }, 413);
    }

    let input;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ ok: false, message: 'Datos inválidos.' }, 400);
    }

    const data = readPayload(input || {});

    // Honeypot antispam. Los usuarios reales nunca completan este campo.
    if (data.empresa) {
      return jsonResponse({ ok: true });
    }

    if (requiredFieldsMissing(data)) {
      return jsonResponse({ ok: false, message: 'Completá los campos obligatorios.' }, 400);
    }

    if (!validEmail(data.email)) {
      return jsonResponse({ ok: false, message: 'Revisá el formato del email.' }, 400);
    }

    if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_API_TOKEN) {
      console.error('Faltan CF_ACCOUNT_ID o CF_EMAIL_API_TOKEN en Cloudflare Pages.');
      return jsonResponse({ ok: false, message: 'El formulario no está disponible temporalmente.' }, 503);
    }

    const subject = `Solicitud web — ${data.servicio} — ${data.localidad}`.slice(0, 180);
    const emailPayload = {
      to: DESTINATION_EMAIL,
      from: {
        address: SENDER_EMAIL,
        name: 'Sudamericana Trabajo Aéreo'
      },
      subject,
      text: buildText(data),
      html: buildHtml(data)
    };

    if (data.email) {
      emailPayload.reply_to = {
        address: data.email,
        name: data.nombre
      };
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/email/sending/send`;
    const providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_EMAIL_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    let providerData = null;
    try {
      providerData = await providerResponse.json();
    } catch {
      // El estado HTTP sigue siendo suficiente para manejar el error.
    }

    if (!providerResponse.ok || providerData?.success === false) {
      console.error('Cloudflare Email Service rechazó el envío.', {
        status: providerResponse.status,
        errors: providerData?.errors || []
      });
      return jsonResponse({ ok: false, message: 'No se pudo enviar la solicitud. Probá nuevamente.' }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('Error inesperado en /api/contacto.', error);
    return jsonResponse({ ok: false, message: 'No se pudo enviar la solicitud. Probá nuevamente.' }, 500);
  }
}

export function onRequest(context) {
  if (context.request.method === 'POST') return handlePost(context);
  return jsonResponse({ ok: false, message: 'Método no permitido.' }, 405);
}
