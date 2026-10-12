# Publicación en Google — Fontana

Esta guía separa la preparación pública de la web de los pasos que debe realizar la propietaria dentro de sus cuentas de Google. No publicar una dirección exacta de producción.

## Preparación técnica completada

- Propiedad de Google preparada mediante la metaetiqueta de verificación de la portada.
- `https://fontanasingluten.com/robots.txt` permite el catálogo público y declara el sitemap.
- `https://fontanasingluten.com/sitemap.xml` incluye portada, categorías, productos e información de confianza.
- Cada ficha pública tiene URL canónica, metadatos sociales y datos estructurados coherentes con el catálogo.
- Las páginas inexistentes usan una página 404 con `noindex,follow`.

## Google Search Console — requiere la cuenta propietaria

1. Abrir la propiedad `https://fontanasingluten.com/` y confirmar que la verificación está vigente.
2. En **Sitemaps**, enviar `https://fontanasingluten.com/sitemap.xml`.
3. Revisar que el estado sea correcto y que Google no reporte errores de lectura.
4. En **Inspección de URL**, comprobar primero:
   - `https://fontanasingluten.com/`
   - `https://fontanasingluten.com/tortas-sin-gluten-carabobo/`
   - `https://fontanasingluten.com/fonkies-galletas-sin-gluten/`
   - `https://fontanasingluten.com/fomb-bombones-sin-azucar/`
5. Solicitar indexación solo si la herramienta indica que una página todavía no está indexada y no presenta un bloqueo técnico.
6. Revisar semanalmente **Indexación de páginas**, **Sitemaps** y **Resultados de búsqueda** durante el primer mes.

Enviar el sitemap es una señal para Google, no una garantía de aparición inmediata.

## Perfil de Empresa de Google — requiere la cuenta propietaria

1. Confirmar primero si Fontana recibe clientes en un local con señalización permanente o funciona como negocio de área de servicio.
2. Si los clientes no son atendidos en la dirección de producción, ocultar la dirección y publicar únicamente áreas de servicio reales.
3. Añadir solo municipios, ciudades o códigos postales donde Fontana efectivamente hace delivery; no inferir zonas nuevas a partir de “Carabobo”.
4. Confirmar con la propietaria antes de publicar categoría, horario, teléfono, modalidades y fotografías.
5. Usar `https://fontanasingluten.com/` como web y el número oficial ya configurado como contacto.
6. Cuando el perfil esté verificado, obtener su enlace oficial de reseñas y sustituir o complementar la invitación actual por WhatsApp.

## Seguimiento de reseñas

- Pedir opinión únicamente a clientes reales después de una compra.
- No ofrecer descuentos a cambio de una calificación positiva.
- Publicar testimonios en la web solo con autorización y sin inventar identidad, fecha o puntuación.
- Responder de forma breve y útil tanto las reseñas positivas como las críticas.

## Política confirmada y avisos no críticos (12 de octubre de 2026)

La política confirmada para Venezuela es no aceptar devoluciones. `seo-render.mjs` publica `MerchantReturnNotPermitted` en cada oferta (incluidas las presentaciones) y texto equivalente en las fichas y en `/informacion-del-pedido/`.

Delivery: Valencia norte y sur, tarifa según zona confirmada por WhatsApp. Los productos disponibles hoy se coordinan según stock; las preórdenes conservan los 2 días de anticipación publicados. No se convierte este plazo de preparación en un tiempo de transporte garantizado.

Se omite `shippingDetails` intencionadamente: no hay una tarifa numérica o máxima confirmada, y Google no admite las subdivisiones de Venezuela para delimitar estas zonas. No introducir costo cero, cobertura nacional ni tiempos de transporte ficticios para ocultar un aviso. Referencia: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing#shipping

No añadir `review` ni `aggregateRating` sin reseñas reales, visibles y correspondientes al producto; las reseñas generales de la marca no equivalen a valoraciones de cada referencia. Los avisos opcionales pendientes no significan que la corrección de devoluciones haya fallado. Search Console debe volver a rastrear las fichas; la publicación no confirma por sí sola su validación en Google.
