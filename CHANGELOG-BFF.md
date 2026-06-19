# Changelog — BFF MVP

Registro de cambios, decisiones técnicas, errores y soluciones.
Para usar como base de conocimiento en el proyecto real.

---

## [1.5] — 2026-06-19 — Logging, Health endpoint

### Cambios
- Logging estructurado con `pino` (JSON, niveles, request/response tracking)
- Endpoint `GET /api/health` para monitoreo
- Reemplazados todos los `console.log/error` por `logger.info/error/warn`
- Middleware de request logging automático para rutas `/api/*`

### Archivos modificados
- `server/index.js`: pino inicializado, health endpoint, request logger middleware
- `server/package.json`: +`pino`
- `CHANGELOG-BFF.md`: esta entrada

### Decisión técnica
**Problema:** Los logs eran `console.log/error` sin estructura, imposibles de parsear
en producción o enviar a sistemas de monitoreo.

**Solución:** Usar `pino` — el logger más rápido para Node.js. Cada request a `/api/*`
genera un log JSON con método, ruta, status, duración. Los errores se loguean con
nivel `error` o `warn` según gravedad.

**Alternativas descartadas:**
- `winston`: Más pesado, configuración más verbosa
- `console`: Sin estructura, sin niveles, sin formato

### Health endpoint
```
GET /api/health → { status: "ok", uptime: 13.5 }
```
Sirve para monitoreo básico (load balancers, health checks, Docker).

---

## [1.4] — 2026-06-19 — Rate limiting, CSRF, Refresh Token

### Cambios
- Rate limiting con `express-rate-limit` (10 req/min login/callback, 60 req/min general)
- Protección CSRF con header `X-Requested-By: bff-mvp` en POST
- Refresh token: se solicita `offline_access`, se almacena cifrado en cookie httpOnly
- Renovación automática: si el session JWT expiró, `/api/auth/me` intenta refresh silencioso
- Frontend actualizado para enviar header CSRF en logout

### Archivos modificados
- `server/index.js`: rate limiters, csrfCheck middleware, encrypt/decrypt helpers, tryRefresh
- `src/main.ts`: header `X-Requested-By` en fetch de logout
- `server/package.json`: +`express-rate-limit`

### Decisiones técnicas

#### Rate limiting
**Problema:** Los endpoints del BFF no tenían protección contra abuso.

**Solución:** `express-rate-limit` con límites:
- `/api/auth/login` → 10 req/min (evita fuerza bruta de redirecciones)
- `/api/auth/callback` → 10 req/min (evita intercambio masivo de codes)
- `/api/*` (general) → 60 req/min (límite global)

#### CSRF
**Problema:** El endpoint `POST /api/auth/logout` podía ser invocado desde sitios externos.

**Solución:** Header custom `X-Requested-By: bff-mvp` obligatorio en toda petición POST.
Los navegadores no permiten enviar headers custom cross-origin sin CORS preflight,
lo que protege contra ataques CSRF clásicos.

**Alternativas descartadas:**
- `SameSite=Strict` en la cookie: Bloquea cookies en navegación normal desde enlaces externos
- CSRF tokens: Más complejo, requiere sincronización estado-servidor
- Doble submit cookie: Similar complejidad

#### Refresh token
**Problema:** La sesión expiraba a la hora sin posibilidad de renovación.

**Solución (MVP):**
1. Se agrega `offline_access` al scope para obtener `refresh_token`
2. El `refresh_token` se cifra con AES-256-GCM usando `SESSION_SECRET` como clave
3. Se guarda en cookie httpOnly con 90 días de vida
4. En `/api/auth/me`, si el session JWT expiró, se intenta refresh automático
5. Si el refresh falla, se limpia la cookie y se responde `{ authenticated: false }`

**Seguridad del refresh token almacenado:**
- Cifrado AES-256-GCM con clave derivada de `SESSION_SECRET`
- Cookie httpOnly (inaccesible desde JS)
- MismaSite=Lax (protegido contra CSRF básico)
- Si el refresh falla (token revocado/expirado), se limpia automáticamente

---

## [1.3] — 2026-06-19 — Validación de ID Token + Nonce

### Cambios
- Validación del ID Token con JWKS de Microsoft
- Nonce anti-replay en el flujo OAuth
- `SESSION_SECRET` ahora configurable desde `.env`
- Validación de tenant (single-tenant obligatorio)

### Archivos modificados
- `server/index.js`: lógica de validación con `jose`
- `.env.example`: agregado `SESSION_SECRET`
- `README-FLOW.md`: checklist actualizado

### Decisión técnica
**Problema:** El ID Token se decodificaba pero no se validaba la firma.
Cualquier token JWT malicioso con `kid` adulterado podía suplantar usuarios.

**Solución:** Usar `jose.createRemoteJWKSet()` que obtiene y cachea las claves
públicas de Microsoft desde `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`.
`jwtVerify()` valida: firma, `iss`, `aud`, fecha de expiración.

**Por qué jose y no otra librería:**
- `jsonwebtoken` no soporta JWKS nativamente (requiere `jwks-rsa`)
- `jose` es del mismo equipo, soporta JWKS, está pensado para entornos Edge/Node
- API moderna basada en Web Crypto

### Error encontrado: AADSTS700025
**Causa:** La app registration en Azure estaba como SPA (cliente público).
El BFF necesita ser cliente confidencial para usar `client_secret`.

**Solución:** Cambiar Redirect URI de tipo SPA a Web en Azure Portal,
y deshabilitar "Allow public client flows".

---

## [1.2] — 2026-06-19 — State stateless

### Cambios
- State OAuth ahora es stateless: codifica `{ verifier, nonce, redirectTo, exp }` en base64
- Eliminado `pkceStore` (Map en memoria)

### Archivos modificados
- `server/index.js`: reemplazo de `Map` por state codificado

### Decisión técnica
**Problema:** Si el servidor se reiniciaba entre `/api/auth/login` y `/api/auth/callback`,
el `Map` en memoria perdía el `verifier` y el callback fallaba con "State inválido".

**Solución:** Codificar los datos necesarios dentro del propio parámetro `state`
que viaja con el redirect. El state se decodifica y valida expiración al recibir el callback.

**Alternativas descartadas:**
- Sesión persistente (BD/Redis): Overkill para MVP
- Cookie cifrada: Más complejo, misma seguridad
- Map en memoria: Fallaba al reiniciar

---

## [1.1] — 2026-06-19 — Manejo de errores en callback

### Cambios
- El callback ya no responde 500, redirige al frontend con `?error=...`
- Se eliminó `User.Read` del scope (no necesario para ID token)
- Se agregó favicon

### Archivos modificados
- `server/index.js`: redirect en lugar de 500, scope reducido
- `public/favicon.svg`: favicon nuevo

### Error encontrado: Microsoft devuelve error en callback
**Causa:** El callback devolvía un 500 genérico sin información util.

**Solución:** Capturar `err.response?.data?.error_description` de Microsoft
y pasarlo al frontend como query param para diagnóstico.

---

## [1.0] — 2026-06-19 — MVP inicial del BFF

### Cambios
- Backend Express con 4 endpoints: `/api/auth/login`, `/api/auth/callback`,
  `/api/auth/me`, `/api/auth/logout`
- Authorization Code Flow con PKCE (S256)
- Cookie `httpOnly` con JWT de sesión
- Frontend simplificado sin MSAL.js
- Script `npm run dev:bff` para ejecutar ambos

### Archivos creados
- `server/index.js`: BFF completo
- `server/package.json`: dependencias (express, cors, cookie-parser, jwt, axios, dotenv)
- `src/main.ts`: cliente BFF
- `AGENTS.md`: documentación del proyecto
- `ARQUITECTURA-BFF.md`: documento de arquitectura

### Decisiones técnicas principales

| Decisión | Opción | Alternativas | Motivo |
|---|---|---|---|
| Framework backend | Express | Fastify, Hono, Koa | Familiar, ecosistema maduro |
| Formato backend | JavaScript ESM | TypeScript | MVP rápido, tipado se puede migrar después |
| Almacenamiento state | Map en memoria | BD, Redis, stateless | simple, aunque se cambió a stateless en v1.2 |
| Prompt | `prompt=login` | `select_account`, `none` | Forzar login explícito en test |
| Cookie secure | `false` | `true` | HTTP localhost (en producción debe ser true) |

### Errores encontrados

**AADSTS500113: No reply address is registered**
- **Causa:** Redirect URI no registrado en Azure
- **Solución:** Registrar `http://localhost:3001/api/auth/callback` como Web

**State inválido (por reinicio del servidor)**
- **Causa:** Map en memoria se pierde al reiniciar
- **Solución:** State stateless (v1.2)

**AADSTS700025: Client is public**
- **Causa:** App configurada como SPA en Azure
- **Solución:** Cambiar a Web + deshabilitar clientes públicos

---

## Pendientes para próxima sesión

1. **HTTPS local** — Cookie `secure: true`, generar certificado auto-firmado con `mkcert`
2. **Migrar backend a TypeScript** — Misma experiencia de tipado que el frontend
3. **Tests** — Unitarios con Node test runner o vitest, integración con supertest
4. **Logging a archivo** — `pino/file` con rotación, `pino-pretty` en desarrollo

## Referencias

- `ARQUITECTURA-BFF.md` — Detalle completo de arquitectura
- `README-FLOW.md` — Instrucciones de ejecución y estado
- `AGENTS.md` — Documentación del proyecto
