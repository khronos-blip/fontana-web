# Fontana Web

Sitio estático de Fontana con catálogo, carrito persistente y entrega del pedido a WhatsApp.

Repositorio: <https://github.com/khronos-blip/fontana-web>

## Arquitectura

- Hosting público: GitHub Pages, sin servidor local ni dependencia del Mac mini.
- Código: este repositorio; cada `push` a `main` publica automáticamente el contenido de `dist` mediante GitHub Actions.
- Administración: Cloudflare Worker + base de datos D1 en `api.fontanasingluten.com`, dentro del nivel gratuito.
- Dominio: <https://fontanasingluten.com>.
- Pedidos: enlace oficial `wa.me` con resumen, total, modalidad, pago y datos del cliente.
- Coste recurrente de infraestructura: cero, aparte del dominio.

## Trabajar con Codex desde GitHub

1. Conectar la cuenta de GitHub a Codex.
2. Seleccionar el repositorio `khronos-blip/fontana-web` y la rama `main`.
3. Dar a Codex la tarea concreta. Codex leerá automáticamente `AGENTS.md`, donde están las reglas del proyecto.
4. Pedir siempre que ejecute `npm run build` y `npm test`, haga commit/push y confirme el despliegue.

Prompt recomendado:

> Trabaja en `khronos-blip/fontana-web`. Lee `AGENTS.md`, `README.md` y `config.js`. Implementa [CAMBIO], conserva el checkout de WhatsApp, ejecuta `npm run build` y `npm test`, revisa móvil y escritorio, haz commit y push a `main`, y verifica `fontanasingluten.com`. No cambies datos comerciales no confirmados.

Esto permite modificar la tienda desde cualquier sesión de Codex con acceso a GitHub. El Mac mini no forma parte del hosting ni es necesario para que la web permanezca online.

## Gestión del catálogo

El panel administrativo vive en `/admin/`. Incluye acceso privado con cuentas individuales y passkeys (Face ID en iPhone), CRUD de productos, inventario centralizado, visibilidad, nuevo, promoción, Stock de hoy, agotado, pre-order, etiquetas personalizadas, variantes, presentaciones, anticipación, carga optimizada de imágenes, constructores de Fonkies y Fomb, exportación/importación de copias JSON y contabilidad manual o automática. Las ventas pendientes o anuladas se conservan en el historial, pero no se suman a los ingresos confirmados.

En producción, el panel guarda en D1 y los cambios se reflejan para todos los visitantes. Las contraseñas se derivan con PBKDF2, las sesiones usan cookies seguras y los secretos no forman parte del JavaScript público. Face ID se implementa con WebAuthn: la biometría permanece en el dispositivo y el servidor solo almacena la clave pública de cada passkey. En `localhost` se conserva un modo de revisión con `localStorage` para pruebas automáticas, nunca para producción.

`config.js` continúa siendo la fuente original y el respaldo seguro del catálogo publicado:

1. Editar el producto dentro de `dynamicCatalog`.
2. Para productos con varias presentaciones, añadir `sizes` con `name`, `price` y `status`; el carrito y WhatsApp tomarán automáticamente la presentación, el precio y el relleno elegidos.
3. Usar `status: "available"` para publicarlo o `status: "sold-out"` para mostrarlo agotado.
4. Activar `promo: true` para incluirlo en «Promoción del día».
5. Activar `immediate: true` para incluirlo en «Stock de hoy».
6. Usar `price: null` cuando el precio aún no esté confirmado; la web mostrará «Por confirmar» y no permitirá añadirlo al carrito.
7. Guardar las nuevas fotografías dentro de `assets/` y asignar su ruta en `image`.
8. Para productos con sabores, usar `variants` y cambiar el `status` de cada sabor entre `available` y `sold-out`. Los sabores disponibles no muestran etiqueta; los no disponibles aparecen como «Agotado» y no pueden seleccionarse.
9. `stockQuantity: 0` también marca el producto u opción como agotado. Si `allowPreorder` está activo, se conserva la solicitud en el carrito y WhatsApp como pre-order sujeto a confirmación.
10. `visible: false` retira el producto de la tienda sin borrar su ficha del panel.

Los Fonkies y Fomb tienen constructores propios en `index.html` y su cálculo está en `app.js`. Los tiempos de preparación se configuran en `leadTimesByProduct` usando el `productId` correspondiente.

## Configuración operativa

Los datos de WhatsApp, modalidades de entrega, formas de pago y reglas comerciales también se administran desde `config.js`. No se deben inventar datos que la clienta no haya confirmado.

La configuración y operación del backend está documentada en `backend/README.md`. Al pulsar «Enviar pedido por WhatsApp», el Worker reserva durante 30 minutos únicamente las referencias cuyo control de stock esté activado. Las cantidades nunca se exponen al público. Desde «Pedidos», la dueña confirma la venta para descontar existencias y crear el asiento contable, cancela para devolverlas o amplía la reserva. Un proceso programado libera automáticamente las reservas vencidas. Antes de activar el control de una referencia, la dueña debe cargar su cantidad real; las referencias sin control continúan vendiéndose sujetas a confirmación para no inventar inventario.

## Despliegue

GitHub Pages usa la rama `main`, el comando `npm run build` y el artefacto `dist`. El dominio de producción es `fontanasingluten.com`; no se debe usar Cloudflare Tunnel para esta web.

## Verificación

```bash
npm ci
npm run build
npm test
```

Las pruebas cubren carga, carrito, checkout, precios de Fonkies y Fomb, filtros, estados del catálogo e integridad de imágenes. Los cambios visuales también requieren revisión manual en móvil y escritorio.
