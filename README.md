# Sudamericana Lluvias V1

## Qué incluye

- `lluvias.html`
- `assets/css/lluvias.css`
- `assets/js/lluvias.js`
- `worker/lluvias-worker.js`
- `worker/schema.sql`
- `CHECKLIST-DESPLIEGUE.md`

## Arquitectura recomendada

```text
sudamericanasrl.com/lluvias.html
        ↓
lluvias-api.sudamericanasrl.com
        ↓
Cloudflare Worker: sudamericana-lluvias
        ↓
Cloudflare D1
        ↓
Cloudflare Email Sending
```

El Worker de contacto actual no se toca.

## Decisiones de V1

- No hay cuentas ni contraseñas.
- El colaborador confirma control del email con código de 6 dígitos.
- Turnstile se valida del lado servidor.
- El email nunca se publica.
- La API pública redondea latitud/longitud a 3 decimales (aprox. 100 m).
- Se guarda la coordenada exacta para el dato interno, pero no se devuelve al mapa público.
- Límite básico: 5 intentos/hora por IP hash y 20 publicaciones/día por email hash.
- Solo se guardan hashes de email en reportes publicados.
- El email en texto plano existe únicamente en la tabla pendiente y se elimina al verificar.

## Variables y secretos del Worker

### Binding D1
- `DB`

### Texto
- `CF_ACCOUNT_ID`

### Secretos
- `CF_EMAIL_API_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `VERIFY_CODE_SECRET`
- `EMAIL_HASH_SALT`
- `IP_HASH_SALT`

Para los tres últimos secretos, usar valores largos y aleatorios diferentes entre sí.

## Configuración en el HTML

En `lluvias.html`:

```js
window.SUDAMERICANA_LLUVIAS = {
  apiBase: 'https://lluvias-api.sudamericanasrl.com',
  turnstileSiteKey: 'REEMPLAZAR_TURNSTILE_SITEKEY'
};
```

Reemplazar únicamente la sitekey.

## Mapa

Leaflet 1.9.4 + teselas estándar de OpenStreetMap con atribución visible.

Para tráfico alto, conviene migrar las teselas a un proveedor con SLA/plan propio.
