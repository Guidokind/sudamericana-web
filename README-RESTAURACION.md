# Restauración urgente de index.html

La página principal estaba entregando datos PNG como si fueran el documento principal.

## Acción

Reemplazar únicamente el archivo de la raíz:

`index.html`

No reemplazar ninguna carpeta ni otro archivo.

## Verificación técnica

- Comienza con: `<!doctype html>`
- Tamaño: 12334 bytes
- SHA-256: e5c77cb269706c0e2dec5c9f75419b263482cef18d674d9a7669d80b49ea830b

## Después del commit

1. Esperar el deploy de Cloudflare Pages.
2. Abrir el sitio en incógnito.
3. Si sigue mostrando caracteres PNG, purgar la caché de Cloudflare para `https://sudamericanasrl.com/`.
