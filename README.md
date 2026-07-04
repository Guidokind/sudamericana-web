# Sudamericana Trabajo Aéreo — sitio web

Sitio estático multipágina, listo para GitHub y Cloudflare Pages.

## Páginas

- `index.html` — Home.
- `servicios.html` — Herbicidas, fungicidas, insecticidas y siembra aérea.
- `clima.html` — Consulta meteorológica en vivo con Open-Meteo.
- `presupuestos.html` — Formulario que prepara y copia una solicitud por email.

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
    │   ├── logo-sudamericana.png
    │   ├── favicon-s.png
    │   ├── favicon-16x16.png
    │   ├── favicon-32x32.png
    │   ├── favicon-192x192.png
    │   ├── favicon-512x512.png
    │   ├── apple-touch-icon.png
    │   └── preview-social.png
    └── js
        ├── main.js
        ├── weather.js
        └── quote.js
```

## Configuración SEO / analítica incluida

- Microsoft Clarity (`xfdhyn50o7`)
- favicon e íconos del sitio
- Open Graph / Twitter preview
- `robots.txt`
- `sitemap.xml`
- `schema.org` tipo `LocalBusiness`
- `canonical` por página

## Publicar en GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Sudamericana web v4"
git branch -M main
git remote add origin https://github.com/Guidokind/sudamericana-web.git
git push -u origin main
```

Si `origin` ya existe:

```bash
git remote set-url origin https://github.com/Guidokind/sudamericana-web.git
git add .
git commit -m "Sudamericana web v4"
git push origin main
```

## Cloudflare Pages

- Framework preset: `None`
- Build command: dejar vacío
- Build output directory: `/`

## Nota sobre clima

La pantalla consume la API pública de Open-Meteo desde el navegador. La valoración de “ventana meteorológica” es solo una heurística visual orientativa; no reemplaza criterio operativo, agronómico ni indicaciones de etiqueta.
