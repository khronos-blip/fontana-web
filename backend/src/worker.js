const SESSION_COOKIE = "fontana_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100000;
const MAX_CATALOG_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin, allowedOrigins);
    }

    try {
      let response;
      if (url.pathname === "/v1/health" && request.method === "GET") response = json({ ok: true });
      else if (url.pathname === "/v1/catalog" && request.method === "GET") response = await getCatalog(request, env);
      else if (url.pathname.startsWith("/v1/images/") && request.method === "GET") response = await getImage(url, env);
      else if (url.pathname === "/v1/setup" && request.method === "POST") response = await setupAdmin(request, env);
      else if (url.pathname === "/v1/auth/login" && request.method === "POST") response = await login(request, env);
      else if (url.pathname === "/v1/auth/logout" && request.method === "POST") response = await logout(request, env);
      else if (url.pathname === "/v1/auth/session" && request.method === "GET") response = await sessionStatus(request, env);
      else if (url.pathname === "/v1/admin/catalog" && request.method === "GET") response = await getAdminCatalog(request, env);
      else if (url.pathname === "/v1/admin/catalog" && request.method === "PUT") response = await putCatalog(request, env);
      else if (url.pathname === "/v1/admin/images" && request.method === "POST") response = await uploadImage(request, env);
      else if (url.pathname === "/v1/admin/activity" && request.method === "GET") response = await getActivity(request, env);
      else response = json({ error: "Ruta no encontrada" }, 404);
      return withCors(response, origin, allowedOrigins);
    } catch (error) {
      console.error(error);
      return withCors(json({ error: "Error interno del servicio" }, 500), origin, allowedOrigins);
    }
  }
};

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function withCors(response, origin, allowedOrigins) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  if (!origin || !allowedOrigins.has(origin)) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function getCatalog(request, env) {
  const row = await env.DB.prepare("SELECT state_json, revision, updated_at FROM catalog_state WHERE id = 'published'").first();
  if (!row) return json({ configured: false, state: null, revision: 0 }, 200, { "Cache-Control": "no-store" });
  const etag = `\"fontana-${row.revision}\"`;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return json({ configured: true, state: JSON.parse(row.state_json), revision: row.revision, updatedAt: row.updated_at }, 200, {
    "Cache-Control": "no-cache, must-revalidate",
    ETag: etag
  });
}

async function getImage(url, env) {
  const id = url.pathname.split("/").pop();
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(id || "")) return json({ error: "Imagen inválida" }, 400);
  const row = await env.DB.prepare("SELECT mime_type, image_data FROM catalog_images WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Imagen no encontrada" }, 404);
  const body = row.image_data instanceof ArrayBuffer ? row.image_data : new Uint8Array(row.image_data || []);
  return new Response(body, {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function setupAdmin(request, env) {
  const expectedToken = String(env.SETUP_TOKEN || "");
  const suppliedToken = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expectedToken || !suppliedToken || !constantTimeEqual(expectedToken, suppliedToken)) return json({ error: "Configuración no autorizada" }, 401);
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_users").first();
  if (Number(existing?.count || 0) > 0) return json({ error: "El administrador ya fue configurado" }, 409);
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (!username || password.length < 12) return json({ error: "Usa un usuario válido y una contraseña de al menos 12 caracteres" }, 400);
  const salt = randomToken(18);
  const passwordHash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_users (username, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, ?, ?)").bind(username, salt, passwordHash, PASSWORD_ITERATIONS, now),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'setup', 'Administrador inicial creado', ?)").bind(username, now)
  ]);
  return json({ ok: true, username }, 201);
}

async function login(request, env) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const clientAddress = request.headers.get("CF-Connecting-IP") || "unknown";
  const attemptId = await sha256(`${clientAddress}:${username || "invalid"}`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - 15 * 60;
  const attemptCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE identifier_hash = ? AND attempted_at >= ?").bind(attemptId, windowStart).first();
  if (Number(attemptCount?.count || 0) >= 8) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429, { "Retry-After": "900" });
  const user = username ? await env.DB.prepare("SELECT username, password_salt, password_hash, password_iterations FROM admin_users WHERE username = ?").bind(username).first() : null;
  const suppliedHash = user ? await derivePasswordHash(password, user.password_salt, user.password_iterations) : "";
  if (!user || !constantTimeEqual(user.password_hash, suppliedHash)) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO login_attempts (identifier_hash, attempted_at) VALUES (?, ?)").bind(attemptId, nowSeconds),
      env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(nowSeconds - 24 * 60 * 60)
    ]);
    return json({ error: "Usuario o contraseña incorrectos" }, 401);
  }

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE identifier_hash = ?").bind(attemptId),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)),
    env.DB.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(tokenHash, username, expiresAt, now),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'login', 'Inicio de sesión', ?)").bind(username, now)
  ]);
  return json({ ok: true, username }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function sessionStatus(request, env) {
  const session = await requireSession(request, env, false);
  return session ? json({ authenticated: true, username: session.username }) : json({ authenticated: false }, 401);
}

async function getAdminCatalog(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const row = await env.DB.prepare("SELECT state_json, revision, updated_at FROM catalog_state WHERE id = 'published'").first();
  return json({ state: row ? JSON.parse(row.state_json) : null, revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null });
}

async function putCatalog(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > MAX_CATALOG_BYTES) return json({ error: "El catálogo supera el tamaño permitido" }, 413);
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Catálogo inválido" }, 400); }
  const validationError = validateCatalog(payload.state);
  if (validationError) return json({ error: validationError }, 400);
  const existing = await env.DB.prepare("SELECT revision FROM catalog_state WHERE id = 'published'").first();
  const expectedRevision = Number(payload.expectedRevision);
  const currentRevision = Number(existing?.revision || 0);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) return json({ error: "El catálogo cambió en otro dispositivo", revision: currentRevision }, 409);
  const revision = currentRevision + 1;
  const now = new Date().toISOString();
  const stateJson = JSON.stringify({ ...payload.state, version: 2, updatedAt: now });
  let saved;
  if (existing) {
    saved = await env.DB.prepare("UPDATE catalog_state SET state_json = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = 'published' AND revision = ?").bind(stateJson, revision, now, session.username, expectedRevision).run();
  } else {
    try {
      saved = await env.DB.prepare("INSERT INTO catalog_state (id, state_json, revision, updated_at, updated_by) VALUES ('published', ?, ?, ?, ?)").bind(stateJson, revision, now, session.username).run();
    } catch {
      return json({ error: "El catálogo cambió en otro dispositivo" }, 409);
    }
  }
  if (Number(saved?.meta?.changes || 0) !== 1) return json({ error: "El catálogo cambió en otro dispositivo" }, 409);
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'catalog_save', ?, ?)").bind(session.username, `Revisión ${revision}`, now).run();
  return json({ ok: true, revision, updatedAt: now, state: JSON.parse(stateJson) });
}

async function uploadImage(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const formData = await request.formData();
  const file = formData.get("image");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Selecciona una imagen" }, 400);
  if (!IMAGE_TYPES.has(file.type)) return json({ error: "Usa una imagen JPG, PNG o WebP" }, 415);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return json({ error: "La imagen debe pesar menos de 1,5 MB" }, 413);
  const bytes = await file.arrayBuffer();
  const id = `${Date.now().toString(36)}-${randomToken(12)}`;
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO catalog_images (id, mime_type, image_data, size_bytes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, file.type, bytes, file.size, now, session.username).run();
  const imageUrl = `${new URL(request.url).origin}/v1/images/${id}`;
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'image_upload', ?, ?)").bind(session.username, id, now).run();
  return json({ ok: true, id, url: imageUrl, size: file.size }, 201);
}

async function getActivity(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const result = await env.DB.prepare("SELECT username, action, details, created_at FROM audit_log ORDER BY id DESC LIMIT 20").all();
  return json({ items: result.results || [] });
}

async function requireSession(request, env, reject = true) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return reject ? json({ error: "Sesión requerida" }, 401) : null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare("SELECT username, expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, now).first();
  if (!session) return reject ? json({ error: "Sesión vencida" }, 401, { "Set-Cookie": sessionCookie("", 0) }) : null;
  return session;
}

function validateCatalog(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.products) || !state.builders) return "Falta la estructura del catálogo";
  if (state.products.length > 500) return "El catálogo supera 500 productos";
  const ids = new Set();
  for (const product of state.products) {
    if (!product || typeof product !== "object") return "Hay un producto inválido";
    if (!/^[a-z0-9-]{1,80}$/.test(String(product.id || ""))) return "Todos los productos necesitan un identificador válido";
    if (ids.has(product.id)) return `El identificador ${product.id} está repetido`;
    ids.add(product.id);
    if (!String(product.name || "").trim()) return `El producto ${product.id} no tiene nombre`;
    if (typeof product.image === "string" && product.image.startsWith("data:")) return "Guarda las imágenes con el botón de subida antes de publicar";
  }
  return "";
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,50}$/.test(username) ? username : "";
}

function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function derivePasswordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: Number(iterations) }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a || ""));
  const right = encoder.encode(String(b || ""));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index % (left.length || 1)] || 0) ^ (right[index % (right.length || 1)] || 0);
  return difference === 0;
}
