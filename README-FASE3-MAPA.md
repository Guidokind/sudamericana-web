# Sudamericana — Optimización Fase 3: mapa de Lluvias

## Cambio

Antes la página descargaba simultáneamente:

- Esri World Imagery;
- OpenStreetMap completo.

Ahora:

- abre únicamente con el mapa Básico;
- Satélite se descarga solo cuando el usuario lo elige;
- Satélite incluye nombres y límites;
- las capas usan `updateWhenIdle` y un buffer reducido.

## Archivos a reemplazar

- `lluvias.html`
- `assets/js/lluvias.js`
- `assets/css/lluvias.css`

## No se modificó

- reportes;
- ubicación;
- sesión;
- cuenta;
- ranking;
- Turnstile;
- PWA;
- API;
- D1;
- Workers.

## Prueba

1. Abrir `/lluvias.html`.
2. Confirmar que abre en Básico.
3. Confirmar que aparecen reportes.
4. Tocar Satélite.
5. Confirmar imagen satelital con nombres.
6. Volver a Básico.
7. Probar Reportar lluvia y Mi cuenta.
