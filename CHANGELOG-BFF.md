# Changelog — BFF MVP

Registro de cambios, decisiones técnicas, errores y soluciones.
Para usar como base de conocimiento en el proyecto real.

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

## Flujo documentado

Ver `ARQUITECTURA-BFF.md` para el detalle completo de arquitectura.
Ver `README-FLOW.md` para instrucciones de ejecución.
