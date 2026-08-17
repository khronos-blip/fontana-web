# Fontana Web

Sitio estático de Fontana con catálogo, carrito persistente y entrega del pedido a WhatsApp.

Repositorio: <https://github.com/khronos-blip/fontana-web>

## Arquitectura

- Hosting objetivo: publicación estática desde GitHub, sin servidor local.
- Código: este repositorio; cada `push` a `main` se publica automáticamente.
- Pedidos: enlace oficial `wa.me` con resumen, total, modalidad, pago y datos del cliente.
- Coste recurrente de infraestructura: cero, aparte del dominio.

## Trabajar con Codex desde GitHub

1. Conectar la cuenta de GitHub a Codex.
2. Seleccionar el repositorio `khronos-blip/fontana-web` y la rama `main`.
3. Dar a Codex la tarea concreta. Codex leerá automáticamente `AGENTS.md`, donde están las reglas del proyecto.
4. Pedir siempre que ejecute `npm test`, haga commit/push y confirme el resultado de GitHub Actions.

Prompt recomendado:

> Trabaja en `khronos-blip/fontana-web`. Lee `AGENTS.md` y `README.md` antes de editar. Implementa [CAMBIO], conserva el checkout de WhatsApp, ejecuta las pruebas, revisa móvil y escritorio, haz commit y push, y verifica el despliegue. No cambies datos comerciales no confirmados.

Esto permite modificar la tienda desde cualquier sesión de Codex con acceso a GitHub. El Mac mini no forma parte del hosting ni es necesario para que la web permanezca online.

## Configuración antes del lanzamiento

Editar `config.js`:

1. Añadir el teléfono real en `whatsappNumber` usando solo dígitos y código de país.
2. Cambiar `previewMode` a `false`.
3. Confirmar modalidades y formas de pago.

También deben confirmarse catálogo, precios, reseñas, horarios, zonas de delivery, dirección y textos legales. El sitio conserva `noindex` hasta esa aprobación.

## Dominio

Cuando la clienta compre el dominio, se añadirá al proveedor de hosting estático elegido y se apuntarán sus DNS. No será necesario mover ni reconstruir la web.

## Verificación

```bash
npm ci
npm test
```

Las pruebas cubren carga, carrito y checkout. Los cambios visuales también requieren revisión manual en móvil y escritorio.
