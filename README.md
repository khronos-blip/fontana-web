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

Los productos y precios que ya aparecen en el menú están confirmados. Todavía faltan los datos de productos adicionales, reseñas verificadas, detalles de inventario y textos legales. El sitio conserva `noindex` hasta esa aprobación final.

La sección de Fonkies funciona como un configurador único: permite combinar los ocho sabores confirmados, exige un mínimo de cuatro unidades y calcula automáticamente $15 para cuatro del mismo sabor, $17 para cuatro mixtas y $3,50 por cada unidad adicional. Los sabores y cantidades seleccionados se incorporan al carrito y al mensaje de WhatsApp sin que el cliente tenga que volver a escribirlos. La galería muestra la fotografía original disponible y queda preparada para sumar las fotos individuales pendientes.

El catálogo público incluye las secciones `Promo del día`, `Bebidas` y `Entrega inmediata`. Mientras no haya publicaciones confirmadas, cada una muestra un estado vacío y no inventa productos. `dynamicCatalog` en `config.js` define el contrato provisional que posteriormente consumirá el panel privado: cada entrada puede incluir `id`, `name`, `price`, `image`, `description`, `ingredients`, `category`, `promo` e `immediate`. Un producto puede aparecer simultáneamente como promoción y entrega inmediata.

La tipografía de los títulos de producto prioriza `Berlin Sans FB`; para verla exactamente igual en todos los dispositivos falta recibir el archivo de fuente con licencia web (`.woff2` o `.woff`). Mientras tanto se usa la alternativa visual disponible.

Productos confirmados pendientes de fotografía individual o confirmación final para publicarse:

- Pastel individual de pistacho fotografiado: imagen de producto lista; falta confirmar el nombre comercial, precio, presentación e ingredientes antes de publicarlo.
- Ballerine ($12, bajo encargo o stock): faltan fotografía, presentación e ingredientes completos.
- Mini Cake ($20, bajo encargo): faltan fotografía, tamaño/sabores e ingredientes completos.
- Crumbl de Blueberry (precio sujeto a disponibilidad): harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, blueberry, alulosa y glaseado vegano; fotografía lista, falta confirmar el precio visible.
- Tentación de Coco (precio sujeto a disponibilidad): harina de almendra, monkfruit, aceite de coco, huevo, crema de coco, coco rallado y glaseado vegano sin azúcar; falta fotografía individual.
- Línea Salada Fit, Brownie Fit, tequeños, nuggets y panzerottis: activos para publicación, pero faltan fotografías y datos completos por preparación.

## Despliegue

Cloudflare Pages usa la rama `main`, el comando `npm run build` y el directorio de salida `dist`. El dominio de producción es `fontanasingluten.com`; no se debe usar Cloudflare Tunnel para esta web.

## Verificación

```bash
npm ci
npm run build
npm test
```

Las pruebas cubren carga, carrito y checkout. Los cambios visuales también requieren revisión manual en móvil y escritorio.
