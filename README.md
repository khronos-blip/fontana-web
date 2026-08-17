# Fontana Web

Sitio estático de Fontana con catálogo, carrito persistente y entrega del pedido a WhatsApp.

## Arquitectura

- Hosting: GitHub Pages (sin servidor local).
- Código: este repositorio; cada `push` a `main` se publica automáticamente.
- Pedidos: enlace oficial `wa.me` con resumen, total, modalidad, pago y datos del cliente.
- Coste recurrente de infraestructura: cero, aparte del dominio.

## Configuración antes del lanzamiento

Editar `config.js`:

1. Añadir el teléfono real en `whatsappNumber` usando solo dígitos y código de país.
2. Cambiar `previewMode` a `false`.
3. Confirmar modalidades y formas de pago.

También deben confirmarse catálogo, precios, reseñas, horarios, zonas de delivery, dirección y textos legales. El sitio conserva `noindex` hasta esa aprobación.

## Dominio

Cuando la clienta compre el dominio, se añade como dominio personalizado de GitHub Pages y se apuntan sus DNS. No es necesario mover ni reconstruir la web.
