# Botón Instalar App Lluvias — v1.1

Corrección chica sobre v1.

## Problema

El botón funcionaba, pero el panel de instalación aparecía abajo de la página y parecía que no hacía nada.

## Corrección

- El modal `#install-app-modal` ahora abre como ventana emergente visible.
- Queda centrado en PC.
- En iPhone aparece arriba de la pantalla visible, respetando el área segura.
- Fondo oscuro detrás.
- No cambia lógica de instalación ni navegación.

## Archivos a reemplazar

- `assets/css/lluvias.css`
- `assets/js/lluvias.js`

`lluvias.html` se incluye por seguridad, pero si ya subiste v1 y el botón aparece, basta con reemplazar CSS y JS.

No tocar D1, Workers ni `/app/`.
