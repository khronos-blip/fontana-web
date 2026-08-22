# API privada de Fontana

Backend gratuito basado en Cloudflare Workers + D1. Mantiene el catálogo publicado, cuentas administrativas separadas, sesiones, passkeys para Face ID, imágenes optimizadas y un registro básico de actividad.

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
