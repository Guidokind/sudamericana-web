# Sudamericana Trabajo Aéreo — V6

Sitio estático multipágina listo para GitHub + Cloudflare Pages.

## Cambios principales de V6

- Home reorganizada para eliminar repeticiones.
- Navegación simplificada: Servicios, Clima y Contacto.
- Hero mínimo con un único CTA.
- Clima integrado como utilidad principal de la Home.
- Consulta por localidad y geolocalización.
- Variables actuales: temperatura, viento, dirección, ráfagas, humedad y lluvia próxima.
- Evaluación meteorológica orientativa.
- Evolución de las próximas 5 horas.
- Enlace al pronóstico completo de 7 días.
- Página de Presupuestos presentada como Contacto, manteniendo el formulario por email.
- Footer simplificado.
- Google Tag Manager y Microsoft Clarity conservados.
- SEO, sitemap, robots, schema, favicon y preview social conservados.

## Páginas

- `index.html` — Home + clima rápido.
- `servicios.html` — Herbicidas, fungicidas, insecticidas y siembra aérea.
- `clima.html` — Pronóstico de 7 días.
- `presupuestos.html` — Contacto + solicitud ordenada por email.

## Estructura

```text
.
├── index.html
├── servicios.html
├── clima.html
├── presupuestos.html
├── robots.txt
├── sitemap.xml
├── site.webmanifest
└── assets
    ├── css/styles.css
    ├── img/
    └── js/
        ├── main.js
        ├── weather.js
        └── quote.js
```

## Cloudflare Pages

- Framework preset: `None`
- Build command: dejar vacío
- Build output directory: `/`

## Analítica

- Google Tag Manager: `GTM-TZTPRRHF`
- Microsoft Clarity: `xfdhyn50o7`

## Nota sobre clima

La pantalla consume Open-Meteo desde el navegador. La evaluación de condiciones es informativa y orientativa; no reemplaza criterio agronómico u operativo, mediciones reales del lote ni indicaciones de etiqueta.
