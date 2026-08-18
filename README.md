# Fontana Web

Sitio estático de Fontana con catálogo, carrito persistente y entrega del pedido a WhatsApp.

Repositorio: <https://github.com/khronos-blip/fontana-web>

## Arquitectura

- Hosting: Cloudflare Pages, sin servidor local ni dependencia del Mac mini.
- Código: este repositorio; cada `push` a `main` se publica automáticamente desde Cloudflare Pages.
- Dominio: <https://fontanasingluten.com>.
- Pedidos: enlace oficial `wa.me` con resumen, total, modalidad, pago y datos del cliente.
- Coste recurrente de infraestructura: cero, aparte del dominio.

## Trabajar con Codex desde GitHub

1. Conectar la cuenta de GitHub a Codex.
2. Seleccionar el repositorio `khronos-blip/fontana-web` y la rama `main`.
3. Dar a Codex la tarea concreta. Codex leerá automáticamente `AGENTS.md`, donde están las reglas del proyecto.
4. Pedir siempre que ejecute `npm run build` y `npm test`, haga commit/push y confirme el despliegue de Cloudflare Pages.

Prompt recomendado:

> Trabaja en `khronos-blip/fontana-web`. Lee `AGENTS.md`, `README.md` y `config.js`. Implementa [CAMBIO], conserva el checkout de WhatsApp, ejecuta `npm run build` y `npm test`, revisa móvil y escritorio, haz commit y push a `main`, y verifica `fontanasingluten.com`. No cambies datos comerciales no confirmados.

Esto permite modificar la tienda desde cualquier sesión de Codex con acceso a GitHub. El Mac mini no forma parte del hosting ni es necesario para que la web permanezca online.

## Configuración operativa

El WhatsApp comercial, las modalidades, el horario, la cobertura de delivery, las formas de pago y los tiempos generales de preparación están configurados en `config.js`. Los pedidos reales están activos y continúan sujetos a confirmación de Fontana.

Todavía deben confirmarse el catálogo final, los precios, las reseñas, los detalles de inventario y los textos legales. El sitio conserva `noindex` hasta esa aprobación final.

## Despliegue

Cloudflare Pages usa la rama `main`, el comando `npm run build` y el directorio de salida `dist`. El dominio de producción es `fontanasingluten.com`; no se debe usar Cloudflare Tunnel para esta web.

## Verificación

```bash
npm ci
npm run build
npm test
```

Las pruebas cubren carga, carrito y checkout. Los cambios visuales también requieren revisión manual en móvil y escritorio.
