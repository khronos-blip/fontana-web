# Fontana Web — instrucciones de mantenimiento

## Arquitectura

- Este repositorio es la fuente de verdad.
- Producción se publica automáticamente desde `main` mediante GitHub Pages.
- No usar servidores del Mac mini, LaunchAgents ni Cloudflare Tunnel para alojar esta web.
- El dominio personalizado se conectará después sin cambiar la arquitectura.

## Cambios frecuentes

- Datos operativos y WhatsApp: `config.js`.
- Productos, precios y textos visibles: `index.html`.
- Flujo de carrito/pedido: `app.js`.
- Imágenes: `assets/`.

## Reglas de producción

- No inventar precios, reseñas, horarios, zonas de entrega ni formas de pago.
- Mantener `previewMode: true` y `noindex` hasta recibir aprobación final de la clienta.
- Para activar pedidos: validar el número con código internacional, ponerlo en `whatsappNumber` y cambiar `previewMode` a `false`.
- El mensaje debe indicar que el pedido queda pendiente hasta confirmar el pago.
- Ejecutar `npm test` antes de hacer `push`.
- Verificar la URL publicada después de cada despliegue.
