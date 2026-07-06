# Checklist de despliegue — Sudamericana Lluvias V1

Seguir en este orden.

## 1. GitHub: subir la página

Subir a la raíz:
- `lluvias.html`

Subir:
- `assets/css/lluvias.css`
- `assets/js/lluvias.js`

Todavía no hace falta enlazarla desde la Home.

## 2. Cloudflare: crear base D1

Cómputo → Workers y Pages → D1 (o Almacenamiento y bases de datos → D1)

Nombre recomendado:
- `sudamericana-lluvias`

Crear la base.

## 3. Ejecutar schema SQL

Abrir la consola de D1 y ejecutar el contenido de:
- `worker/schema.sql`

Verificar que existan:
- `rain_reports`
- `pending_rain_reports`

## 4. Crear Worker separado

Nombre:
- `sudamericana-lluvias`

Empezar con Hello World.

Reemplazar su código por:
- `worker/lluvias-worker.js`

## 5. Vincular D1 al Worker

Worker → Vinculaciones / Bindings → Añadir → D1 Database

Nombre de variable:
- `DB`

Base:
- `sudamericana-lluvias`

## 6. Agregar variables y secretos

Texto:
- `CF_ACCOUNT_ID`

Secretos:
- `CF_EMAIL_API_TOKEN`
- `VERIFY_CODE_SECRET`
- `EMAIL_HASH_SALT`
- `IP_HASH_SALT`

Podés reutilizar en este Worker el mismo API token de Email Sending ya creado para contacto.

Los secretos de hash deben ser nuevos, largos y diferentes.

## 7. Crear Turnstile

Cloudflare → Turnstile → Agregar sitio

Nombre:
- `Sudamericana Lluvias`

Hostname:
- `sudamericanasrl.com`

Copiar:
- Site key
- Secret key

En Worker, guardar Secret:
- `TURNSTILE_SECRET_KEY`

En `lluvias.html`, reemplazar:
- `REEMPLAZAR_TURNSTILE_SITEKEY`

por la Site key.

## 8. Implementar Worker

Probar la raíz del workers.dev.

Debe responder:

```json
{"ok":true,"service":"Sudamericana lluvias","status":"online"}
```

## 9. Conectar dominio

Worker → Dominios → Añadir dominio

Zona:
- `sudamericanasrl.com`

Subdominio:
- `lluvias-api`

Resultado:
- `lluvias-api.sudamericanasrl.com`

## 10. Prueba de lectura

Abrir:

```text
https://lluvias-api.sudamericanasrl.com/reportes?hours=24
```

Debe responder:

```json
{"ok":true,"hours":24,"reports":[]}
```

## 11. Publicar y probar

Abrir:
- `https://sudamericanasrl.com/lluvias.html`

Hacer un reporte real:
- seleccionar ubicación
- cargar mm
- email
- Turnstile
- recibir código
- verificar
- confirmar aparición del pin

## 12. Recién después agregar navegación

Agregar a los `<nav class="main-nav">`:

```html
<a href="lluvias.html">Lluvias</a>
```

En `lluvias.html` usar:

```html
<a href="lluvias.html" aria-current="page">Lluvias</a>
```

## 13. SEO

Agregar al `sitemap.xml`:
- `https://sudamericanasrl.com/lluvias.html`

## 14. Seguridad después de V1

Siguiente evolución recomendada:
- botón “Reportar dato incorrecto”
- moderación
- reputación por colaborador
- agrupación de reportes cercanos
- alertas por anomalías (mm extremos)
