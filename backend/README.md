# API privada de Fontana

Backend gratuito basado en Cloudflare Workers + D1. Mantiene el catálogo publicado, cuentas administrativas separadas, sesiones, passkeys para Face ID, imágenes optimizadas, inventario central, reservas temporales, un registro de actividad y el historial de ventas del panel.

El módulo de ventas registra fecha, importe, estado, canal, forma de pago, productos vendidos, cliente opcional y notas. Sus totales cuentan únicamente las ventas confirmadas. Es un control operativo de ingresos; no sustituye una contabilidad fiscal ni calcula automáticamente costos o utilidad.

## Inventario y reservas

- Cada presentación de producto tiene un SKU independiente. Fonkies y Fomb se controlan por sabor; bebidas por unidad; salados y tortas por su presentación o variante.
- Las cantidades reales y reservadas solo están disponibles tras iniciar sesión en `/admin/`; `/v1/catalog` publica únicamente disponible o agotado.
- El control comienza desactivado para cualquier referencia sin una cantidad comercial confirmada. La dueña carga la cantidad real en **Inventario** y activa **Control activo**. En Fonkies y Fomb la cifra corresponde a galletas o bombones individuales de cada sabor, no a cajas armadas.
- Para Fonkies y Fomb, `inventory_items` es la única fuente cuantitativa. El estado manual del catálogo sirve como pausa general o fallback cuando el control está apagado; nunca reescribe las cantidades reales.
- `POST /v1/orders/reserve` recalcula el carrito con el catálogo del servidor y reserva las unidades durante 30 minutos antes de abrir WhatsApp.
- El trigger `inventory_balance_guard` impide que las reservas superen las existencias, incluso si dos clientes intentan comprar la última unidad al mismo tiempo.
- En **Pedidos**, confirmar descuenta existencias y crea una venta confirmada; cancelar devuelve la reserva; ampliar concede 30 minutos nuevos.
- El cron del Worker revisa cada minuto y libera automáticamente las reservas vencidas.

No usa R2 ni un servicio de pago: las imágenes optimizadas (máximo 1,5 MB cada una) se guardan en D1 junto con el catálogo. El nivel gratuito es suficiente para este catálogo mientras se respeten los límites de Cloudflare.

## Recursos

- Worker: `fontana-admin-api`
- D1: `fontana-catalog`
- Dominio previsto: `api.fontanasingluten.com`
- Secreto obligatorio: `SETUP_TOKEN`

## Primera instalación

```bash
npx wrangler login
npx wrangler d1 create fontana-catalog
# Copiar el database_id recibido a backend/wrangler.jsonc
npx wrangler d1 migrations apply fontana-catalog --remote --config backend/wrangler.jsonc
npx wrangler secret put SETUP_TOKEN --config backend/wrangler.jsonc
npx wrangler deploy --config backend/wrangler.jsonc
```

El administrador inicial se crea una sola vez mediante `POST /v1/setup`. La contraseña debe tener al menos 12 caracteres. El token y las credenciales nunca se guardan en Git:

```bash
curl -X POST https://api.fontanasingluten.com/v1/setup \
  -H "Authorization: Bearer EL_SETUP_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"username":"USUARIO_ELEGIDO","password":"CONTRASENA_ELEGIDA"}'
```

Después de crear el primer administrador, el endpoint rechaza cualquier segunda alta. Esa cuenta queda como propietaria y puede crear las demás cuentas desde **Acceso y Face ID**. Los intentos fallidos de acceso se limitan temporalmente.

## Usuarios y Face ID

- Cada persona utiliza un usuario propio; solo la cuenta propietaria puede crear o desactivar usuarios.
- La contraseña temporal de una cuenta nueva debe tener al menos 12 caracteres.
- Después de entrar con su contraseña, cada persona abre **Acceso y Face ID** en su propio iPhone y pulsa **Activar Face ID**.
- El acceso biométrico usa WebAuthn/passkeys. Face ID y los datos biométricos nunca salen del iPhone; D1 conserva únicamente la clave pública necesaria para verificar el acceso.
- La contraseña continúa disponible como recuperación. Una passkey puede eliminarse desde el mismo apartado de seguridad.

## Estado operativo de electricidad

- `GET /v1/admin/operations` devuelve el estado central, quién lo cambió, la fecha y la cantidad de referencias afectadas. Requiere una sesión administrativa válida.
- `PUT /v1/admin/operations/electricity` acepta `{ "electricityEnabled": true|false }`. Requiere sesión, actualiza D1 y escribe el cambio anterior y nuevo en `audit_log`.
- `GET /v1/catalog` expone únicamente el booleano operativo verificado y la disponibilidad temporal resultante; nunca publica existencias privadas.
- Cada producto o constructor usa `requiresElectricity`. Fonkies se considera dependiente por defecto para conservar el comportamiento en catálogos anteriores; Fomb, tortas, salados y bebidas parten como independientes.
- El estado operativo no cambia inventario, reservas, precios ni pedidos existentes. La reserva se revalida contra D1 justo antes de crear el pedido; si una referencia quedó pausada responde `409` con `code: "temporarily_unavailable"`.
- Si D1 no puede confirmar el estado, el catálogo no se publica y la tienda bloquea de forma segura las referencias dependientes.

## Desarrollo local

```bash
npm run api:migrate:local
npm run api:dev
```

La tienda mantiene `config.js` como respaldo si la API no está disponible. En producción, el panel no permite el modo local ni guarda contraseñas en el navegador.

## Publicación

1. Ejecutar la migración remota con `npm run api:migrate:remote`.
2. Publicar la API con `npm run api:deploy`.
3. Crear el administrador inicial con el usuario y contraseña elegidos por la dueña.
4. Entrar en `https://fontanasingluten.com/admin/`, revisar el catálogo inicial y pulsar **Guardar y publicar**.

El catálogo usa revisiones para impedir que dos dispositivos sobrescriban silenciosamente cambios simultáneos. Si ocurre, el panel pide recargar antes de guardar.
