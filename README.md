# Fontana Web

Sitio estático de Fontana con catálogo, carrito persistente y entrega del pedido a WhatsApp.

Repositorio: <https://github.com/khronos-blip/fontana-web>

## Arquitectura

- Hosting público: Cloudflare Pages, proyecto `fontana-web`, sin servidor local ni dependencia del Mac mini.
- Código: este repositorio; `main` es la versión aprobada. El workflow de GitHub Actions publica una copia en GitHub Pages, pero su éxito no confirma la actualización del dominio en Cloudflare.
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

El panel administrativo vive en `/admin/`. Incluye acceso privado con cuentas individuales y passkeys (Face ID en iPhone), CRUD de productos, inventario centralizado, visibilidad, nuevo, promoción, etiquetas personalizadas, variantes, presentaciones, anticipación, carga optimizada de imágenes, constructores de Fonkies y Fomb, exportación/importación de copias JSON, CRM de clientes y control contable operativo. Cada producto y cada constructor ofrece una sola elección de disponibilidad: **Disponible hoy**, **Preordenar · entrega en 2 días** o **Agotado · permitir consulta**. Esa elección gobierna la etiqueta pública, el alta en carrito y el plazo; el inventario numérico controlado conserva el bloqueo de seguridad cuando llega a cero. Cada producto también permite activar o desactivar su peso/volumen y editar una cantidad en mg, g, kg, ml o litros; las presentaciones especiales existentes se conservan. Inventario, pedidos, ventas y perfiles de clientes muestran la imagen del producto o un fallback seguro.

Al confirmar una venta se guarda el cliente por teléfono normalizado, el detalle e imagen histórica de cada producto, el monto realmente recibido, la moneda (VES, USD o EUR), el método y la referencia del pago. Los cobros en bolívares conservan una copia inmutable de la tasa oficial del BCV y su Fecha Valor; si la fuente oficial no responde, únicamente la cuenta propietaria puede introducir una tasa manual con enlace oficial y motivo auditado. Se permiten abonos y pagos divididos: el inventario se descuenta una sola vez, el saldo queda por cobrar y los abonos posteriores no duplican la venta.

`REF` es solo la etiqueta comercial visible. D1 nunca la guarda como moneda: las monedas originales siguen siendo VES, USD o EUR y los reportes consolidados usan USD como moneda funcional sin sumar directamente referencias en dólares y euros. Las anulaciones conservan historial y generan reversos; no borran ventas ni simulan reembolsos. Este módulo es un control administrativo para conciliación y clientes recurrentes, no sustituye los libros fiscales ni la revisión de un contador.

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
9. `availabilityMode` acepta `available`, `preorder` o `sold-out`. El panel sincroniza internamente `status`, `allowPreorder`, `immediate` y dos días de anticipación para que no existan combinaciones contradictorias.
10. `stockQuantity: 0` también bloquea un producto u opción con inventario controlado, aunque esté marcado como disponible, para impedir ventas por encima de las existencias reales.
11. `visible: false` retira el producto de la tienda sin borrar su ficha del panel.

Los Fonkies y Fomb tienen constructores propios en `index.html` y su cálculo está en `app.js`. Sus cantidades se gestionan exclusivamente en **Inventario**, por sabor y por unidad individual; la selección manual de disponibilidad se aplica a toda la caja y el inventario real de cada sabor sigue limitando las unidades. Los tiempos de preparación se configuran en `leadTimesByProduct` usando el `productId` correspondiente.

## Páginas públicas y SEO

`npm run build` genera en `dist` la portada, páginas rastreables por categoría y una ficha independiente para cada producto visible. También crea un `sitemap.xml` actualizado con las imágenes y los datos estructurados de categorías y productos, sin inventar reseñas, disponibilidad o precios.

El build también publica una página 404 útil, información del pedido, privacidad, una tarjeta social de 1200 × 630 y variantes responsivas WebP de alta calidad. Los originales permanecen disponibles como fuente de máxima resolución. La entrega a Google Search Console y la creación o edición del Perfil de Empresa requieren la cuenta de la propietaria y siguen la lista de comprobación de `docs/google-discovery.md`.

- `seo-data.mjs` contiene los textos y la clasificación SEO de los productos estáticos y de los constructores Fonkies/Fomb.
- Los productos administrables se leen directamente de `config.js`; no hay que duplicarlos en otra lista.
- `seo.css` define exclusivamente la presentación de las páginas de categoría y producto.
- Los archivos públicos grandes salen versionados por contenido (`app.*.js`, `config.*.js` y `seo.*.css`) para permitir caché y mantener liviano el HTML inicial.

Después de cambiar productos, imágenes o textos públicos, hay que volver a ejecutar el build antes de publicar. Las fichas con precio no confirmado omiten `Offer`; las fichas agotadas publican su estado real.

## Configuración operativa

Los datos de WhatsApp, modalidades de entrega, formas de pago y reglas comerciales también se administran desde `config.js`. No se deben inventar datos que la clienta no haya confirmado.

El panel incluye un interruptor central **Producción con electricidad / Producción sin electricidad**. Cada producto y cada constructor puede marcarse como «Requiere electricidad para producirse»; Fonkies queda marcado inicialmente y el resto permanece independiente. Al activar «sin electricidad», la tienda muestra un aviso, bloquea únicamente esas referencias y vuelve a validarlas antes de reservar o abrir WhatsApp. El cambio no modifica precios, existencias, reservas ni pedidos existentes, y queda registrado en el historial. Si el estado operativo no puede verificarse en producción, la tienda falla de forma segura y no permite pedir referencias dependientes de electricidad.

La configuración y operación del backend está documentada en `backend/README.md`. Al pulsar «Enviar pedido por WhatsApp», el Worker reserva durante 30 minutos únicamente las referencias cuyo control de stock esté activado. Las cantidades nunca se exponen al público. Desde «Pedidos», la dueña confirma la venta para descontar existencias y crear el asiento contable, cancela para devolverlas o amplía la reserva. Un proceso programado libera automáticamente las reservas vencidas. Antes de activar el control de una referencia, la dueña debe cargar su cantidad real; las referencias sin control continúan vendiéndose sujetas a confirmación para no inventar inventario.

## Despliegue

Cloudflare Pages usa el proyecto `fontana-web`, la rama de producción `main` y el artefacto `dist` generado por `npm run build`. El dominio de producción es `fontanasingluten.com`; no se debe usar Cloudflare Tunnel para esta web.

Después del push, verificar el despliegue de Cloudflare y la coincidencia del HTML y los archivos versionados con `dist`. Si la integración automática no actualiza Cloudflare, publicar el build validado con `wrangler pages deploy dist --project-name fontana-web --branch main --commit-hash <commit-validado>`, usando la sesión autorizada del proyecto. No guardar credenciales en el repositorio. Un workflow de GitHub Pages correcto no sustituye esta comprobación.

## Verificación

```bash
npm ci
npm run build
npm test
```

Las pruebas cubren carga, carrito, checkout, precios de Fonkies y Fomb, filtros, estados del catálogo e integridad de imágenes. Los cambios visuales también requieren revisión manual en móvil y escritorio.
