# Sudamericana — Optimización Fase 4: Turnstile bajo demanda

## Antes

`lluvias.html` descargaba Turnstile en cada visita, aunque el usuario solo
mirara el mapa.

## Ahora

Turnstile se carga únicamente cuando se abre:

- `Reportar lluvia`;
- `Ingresar` por email.

La carga se realiza una sola vez y se reutiliza para ambos formularios.

## Archivos a reemplazar

- `lluvias.html`
- `assets/js/lluvias.js`

## No se modificó

- mapa;
- reportes;
- ubicación;
- sesión;
- cuenta;
- ranking;
- CSS;
- PWA;
- API;
- D1;
- Workers.

## Prueba

1. Abrir `/lluvias.html`.
2. Confirmar mapa y reportes.
3. Abrir `Reportar lluvia`.
4. Confirmar que aparece Turnstile.
5. Cerrar y volver a abrir el formulario.
6. Probar `Ingresar` por email.
