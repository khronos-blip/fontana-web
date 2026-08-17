# Fontana Web — instrucciones para Codex

Este archivo es el contexto operativo obligatorio para cualquier sesión de Codex que trabaje en este repositorio.

## Arquitectura

- Este repositorio es la fuente de verdad.
- `main` representa la versión aprobada y publicable.
- Hosting principal: Cloudflare Pages, conectado a este repositorio.
- Cada `push` a `main` debe activar un despliegue automático en Cloudflare Pages.
- No usar servidores del Mac mini, LaunchAgents ni Cloudflare Tunnel para alojar esta web.
- Dominio de producción: `https://fontanasingluten.com` (Cloudflare Registrar + Pages).
- La tienda es estática: HTML, CSS y JavaScript, sin backend ni secretos.

## Cambios frecuentes

- Datos operativos y WhatsApp: `config.js`.
- Productos, precios y textos visibles: `index.html`.
- Flujo de carrito/pedido: `app.js`.
- Imágenes: `assets/`.

## Flujo de trabajo de Codex

1. Leer `README.md`, `AGENTS.md` y `config.js` antes de editar.
2. Revisar `git status` y conservar cualquier cambio existente que no pertenezca a la tarea.
3. Crear una rama con nombre descriptivo para cambios grandes; los ajustes pequeños aprobados pueden ir directamente a `main`.
4. Implementar el cambio sin introducir servicios pagados, backend o dependencias innecesarias.
5. Ejecutar `npm ci` si faltan dependencias, `npm run build` y después `npm test`.
6. Revisar visualmente móvil y escritorio cuando cambie diseño, carrito o checkout.
7. Hacer commit claro, subir la rama o `main` y verificar el despliegue de Cloudflare Pages.
8. Informar qué cambió, qué pruebas pasaron y si el despliegue quedó confirmado.

## Comandos

```bash
npm ci
npm run build
npm test
git status
```

Para una vista local temporal se puede usar cualquier servidor estático, pero nunca debe considerarse hosting de producción.

## Reglas de producción

- No inventar precios, reseñas, horarios, zonas de entrega ni formas de pago.
- Mantener `previewMode: true` y `noindex` hasta recibir aprobación final de la clienta.
- Para activar pedidos: validar el número con código internacional, ponerlo en `whatsappNumber` y cambiar `previewMode` a `false`.
- El mensaje debe indicar que el pedido queda pendiente hasta confirmar el pago.
- Ejecutar `npm test` antes de hacer `push`.
- Verificar la URL publicada después de cada despliegue.
- No guardar teléfonos privados, credenciales, comprobantes de pago ni datos de clientes en el repositorio.
- No comprar dominios, cambiar DNS ni activar servicios externos sin autorización explícita de Gustavo.
- No eliminar productos, imágenes o funciones sin confirmar el alcance exacto.

## Definición de terminado

Un cambio solo está terminado cuando el repositorio está limpio, las pruebas pasan, el commit está en GitHub y el resultado desplegado se ha verificado en Cloudflare Pages. Si el despliegue falla, reportar el fallo real; no afirmar que producción está online.
