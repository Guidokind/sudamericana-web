# Botón Instalar App Lluvias — v1

Actualización solo frontend para la página pública de Lluvias.

## Cambios

- Agrega botón `Instalar app` junto a `+ Reportar lluvia`, `Ver mi zona` y `Compartir`.
- En Android/Chrome usa `beforeinstallprompt` si está disponible.
- En iPhone muestra instrucciones para instalar desde Safari:
  1. Compartir
  2. Agregar a inicio
  3. Agregar
- En navegadores sin instalación directa abre `/app/`.
- Agrega enlace al manifest de `/app/manifest.webmanifest`.

## Archivos a reemplazar

- `lluvias.html`
- `assets/js/lluvias.js`
- `assets/css/lluvias.css`

No requiere D1 ni Workers.
