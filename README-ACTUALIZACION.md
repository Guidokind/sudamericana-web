# Sudamericana SRL — actualización V9

Este paquete fue preparado contra el repositorio público `Guidokind/sudamericana-web` revisado el 6 de julio de 2026.

## Objetivos incluidos

1. El formulario deja de abrir la aplicación de correo del visitante.
2. La solicitud se envía desde la web a `info@sudamericanasrl.com`.
3. El email público de contacto pasa a ser `info@sudamericanasrl.com`.
4. El clima prioriza la ubicación real del visitante.
5. Si no hay geolocalización disponible, usa la última localidad manual guardada.
6. Villa Ángela queda como respaldo final.
7. Se refuerza el autocompletado contra respuestas antiguas y se mantiene: mínimo 3 caracteres, debounce, hasta 6 resultados, clic, flechas, Enter y Escape.
8. Se corrige el correo antiguo en los datos estructurados JSON-LD de las demás páginas.

## Archivos para copiar al repositorio

Reemplazar:

- `presupuestos.html`
- `assets/js/quote.js`
- `assets/js/weather.js`

Agregar:

- `functions/api/contacto.js`

La carpeta `functions` debe quedar en la raíz del proyecto de Cloudflare Pages.

## Correo corporativo en SEO / Schema

El repositorio actual todavía contiene `stachaco@gmail.com` dentro del JSON-LD de varias páginas.

Opción recomendada desde la raíz del repositorio:

```bash
node scripts/aplicar-correo-corporativo.mjs
```

Para eso, copiar también:

- `scripts/aplicar-correo-corporativo.mjs`


`presupuestos.html` ya viene corregido dentro de este paquete.

## Configuración única en Cloudflare

El formulario usa una Pages Function y Cloudflare Email Service REST API.

### 1. Habilitar envío de correo para el dominio

En Cloudflare Dashboard:

`Compute > Email Service > Email Sending > Onboard Domain`

Seleccionar `sudamericanasrl.com` y revisar los registros DNS propuestos antes de confirmar.

### 2. Crear token de API

Crear un token de Cloudflare con permiso de envío de email (`Email Sending: Edit`) limitado a la cuenta correspondiente.

### 3. Variables del proyecto Pages

En el proyecto de Cloudflare Pages, agregar:

- `CF_ACCOUNT_ID` = ID de la cuenta de Cloudflare
- `CF_EMAIL_API_TOKEN` = token anterior, guardado como secreto/encriptado

Deben estar disponibles en Production. Si también se prueba en Preview, agregarlas allí.

### 4. Desplegar desde GitHub

Hacer commit y push. Al estar el proyecto conectado a GitHub, Cloudflare Pages debe generar un nuevo despliegue.

## Flujo final del formulario

`presupuestos.html`
→ `assets/js/quote.js`
→ `POST /api/contacto`
→ `functions/api/contacto.js`
→ Cloudflare Email Service
→ `info@sudamericanasrl.com`

Cuando el visitante completa un email, ese email se coloca como `reply_to`, para que responder desde la bandeja recibida apunte al visitante.

## Flujo final del clima

Al abrir una página con el bloque meteorológico:

1. intenta geolocalización del navegador;
2. si funciona, muestra el clima de la ubicación real;
3. si falla o se deniega, intenta la última localidad buscada manualmente;
4. si tampoco existe, usa Villa Ángela, Chaco.

La búsqueda manual guarda la última localidad elegida en `localStorage`.

## Pruebas después del despliegue

### Formulario

1. Abrir `/presupuestos.html`.
2. Completar campos obligatorios.
3. Verificar que no se abra Gmail/Outlook.
4. Confirmar mensaje: `Solicitud enviada. Recibimos tus datos y nos pondremos en contacto.`
5. Verificar recepción en `info@sudamericanasrl.com`.
6. Responder al mensaje y comprobar que la respuesta apunte al email del visitante cuando fue informado.

### Clima

1. Abrir la Home o `/clima.html` en HTTPS.
2. Aceptar ubicación: debe priorizar la posición actual.
3. Denegar ubicación: debe cargar localidad guardada o Villa Ángela como respaldo.
4. Escribir 3 caracteres: deben aparecer sugerencias.
5. Probar flechas arriba/abajo, Enter y Escape.
6. Escribir rápidamente consultas distintas y comprobar que una respuesta vieja no reabra sugerencias obsoletas.

## Importante

El paquete no contiene secretos ni credenciales. El envío real solo funcionará después de configurar Email Sending y las dos variables de Cloudflare Pages.
