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

## Gestión del catálogo

La tienda continúa siendo estática y no dispone todavía de un panel privado con inicio de sesión. Hasta que se apruebe un CMS o backend, `config.js` es la fuente segura para gestionar los productos añadidos en esta revisión:

1. Editar el producto dentro de `dynamicCatalog`.
2. Usar `status: "available"` para publicarlo o `status: "sold-out"` para mostrarlo agotado.
3. Activar `promo: true` para incluirlo en «Promoción del día».
4. Activar `immediate: true` para incluirlo en «Entrega inmediata».
5. Usar `price: null` cuando el precio aún no esté confirmado; la web mostrará «Por confirmar» y no permitirá añadirlo al carrito.
6. Guardar las nuevas fotografías dentro de `assets/` y asignar su ruta en `image`.

Los Fonkies y Fomb tienen constructores propios en `index.html` y su cálculo está en `app.js`. Los tiempos de preparación se configuran en `leadTimesByProduct` usando el `productId` correspondiente.

## Configuración operativa

Los datos de WhatsApp, modalidades de entrega, formas de pago y reglas comerciales también se administran desde `config.js`. No se deben inventar datos que la clienta no haya confirmado.

Crear un panel autogestionable real requiere aprobar antes persistencia, autenticación y publicación de cambios; no debe simularse con controles públicos ni incluir secretos en esta web estática.

## Despliegue

Cloudflare Pages usa la rama `main`, el comando `npm run build` y el directorio de salida `dist`. El dominio de producción es `fontanasingluten.com`; no se debe usar Cloudflare Tunnel para esta web.

## Verificación

```bash
npm ci
npm run build
npm test
```

Las pruebas cubren carga, carrito, checkout, precios de Fonkies y Fomb, filtros, estados del catálogo e integridad de imágenes. Los cambios visuales también requieren revisión manual en móvil y escritorio.
