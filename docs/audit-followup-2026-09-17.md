# Correcciones de la auditoría de septiembre de 2026

- Guardar un producto usa un candidato separado: un error remoto no crea un duplicado local ni deja cambios al cancelar.
- Si hay una publicación en curso, el formulario conserva sus datos y pide reintentar. No se descarta una edición posterior.
- La publicación continúa siendo global, con advertencia explícita cuando el botón de un producto o constructor incluye cambios de otras secciones.
- Los sabores indican que se guardan como borrador; el estado pendiente permanece visible en móvil.
- Las fichas, categorías y sitemap del dominio principal se renderizan con cada consulta del catálogo público. Se comparten las mismas plantillas con el build estático y se conservan imágenes responsivas y diseño.
- Las presentaciones conservan sus precios y estados individuales. El fallo de API no reutiliza una ficha antigua: devuelve 503 temporal.
- El menú señala el catálogo no verificado y requiere refrescarlo antes de enviar un pedido.
- El inventario explica pausas, preorden, falta de unidades libres y electricidad usando el catálogo publicado, no un borrador.
- El panel carga las páginas del historial, pedidos, ventas, gastos, clientes y sus compras, conservando la búsqueda y el cómputo del registro completo.
- El respaldo identifica revisión/borrador y aclara que solo incluye catálogo.
- El administrador rechaza incrustaciones en marcos; el workflow exige las pruebas antes de publicar su copia estática.

No se cambiaron precios, existencias, ingredientes, sellos, reglas de preorden ni la portada aprobada. Gaby debe confirmar los sellos alimentarios por variante y los ingredientes incompletos. El build local/GitHub Pages sigue siendo una copia estática de desarrollo: el dominio principal en Cloudflare es la superficie comercial verificada.

Las pruebas añadidas reproducen error 503 y reintento, cancelación tras error, publicación cruzada, edición durante un guardado, historial paginado, paginación de API y cambio de revisión de fichas/sitemap.
