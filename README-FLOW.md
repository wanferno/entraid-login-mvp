# Flujo: BFF (Backend for Frontend) con Authorization Code Flow + PKCE

## Rama: `feature/bff-mvp`

## Qué se implementó
Backend for Frontend (BFF) usando Express + Authorization Code Flow con PKCE.
El frontend **nunca ve los tokens de Microsoft**. El backend maneja todo el flujo OAuth,
valida el ID Token y devuelve una cookie `httpOnly` con un JWT firmado de sesión.

## Stack
- **Frontend:** Vite 6 + TypeScript 5 (sin MSAL.js)
- **Backend:** Express 4 + Node 22 (JavaScript ESM)
- **Auth:** Authorization Code Flow + PKCE (S256) + `client_secret`
- **Sesión:** Cookie `httpOnly` con JWT firmado por el backend
- **Dependencias backend:** `express`, `cors`, `cookie-parser`, `jsonwebtoken`, `axios`, `dotenv`

## Estructura
```
├── server/
│   ├── index.js          # BFF: login, callback, me, logout
│   └── package.json
├── src/
│   ├── main.ts           # Cliente BFF: checkSession, login, logout
│   └── styles.css
├── index.html
├── .env                  # VITE_CLIENT_ID, VITE_TENANT_ID, VITE_CLIENT_SECRET
├── .env.example
├── ARQUITECTURA-BFF.md   # Documento detallado de arquitectura
└── README-FLOW.md        # Este documento
```

## Endpoints BFF

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/auth/login` | Genera PKCE, almacena state (stateless), redirige a Microsoft |
| GET | `/api/auth/callback` | Microsoft redirige aquí, intercambia code por tokens, valida, setea cookie |
| GET | `/api/auth/me` | Devuelve `{ authenticated: false }` o `{ authenticated: true, user: {...} }` |
| POST | `/api/auth/logout` | Limpia la cookie de sesión |

## Decisiones técnicas

| Decisión | Opción elegida | Alternativa | Motivo |
|---|---|---|---|
| Ubicación del token | Cookie `httpOnly` | `localStorage`, `sessionStorage` | Inaccesible desde JS, protege contra XSS |
| Cliente OAuth | Backend (confidencial) | Frontend (MSAL.js, público) | El `client_secret` nunca se expone al frontend |
| Flujo OAuth | Authorization Code + PKCE | Implicit Flow, Client Credentials | PKCE obligatorio para apps nativas/confidenciales. Más seguro que Implicit |
| State | Stateless (codificado en base64) | En memoria del servidor, en BD, en sesión | Evita perder state al reiniciar el servidor |
| Validación de ID Token | Solo decode (MVP) | Validación completa con JWKS | El MVP decode el payload; en producción debe validar firma, iss, aud, exp |
| Session Secret | `crypto.randomBytes(32)` | Fijo en .env | Aleatorio en cada reinicio (MVP). En producción debe ser fijo |
| Scope | `openid profile email` | `User.Read`, `openid profile email` | `User.Read` es de Microsoft Graph, no necesario para ID token |
| Prompt | `prompt=login` | `prompt=select_account`, `prompt=none` | Fuerza login, evita auto-redirect sin interacción |

## Errores encontrados y solución

### 1. `AADSTS500113: No reply address is registered`
**Causa:** Redirect URI no registrado en Azure.
**Solución:** Agregar `http://localhost:3001/api/auth/callback` como tipo **Web** en Azure Portal.

### 2. `AADSTS700025: Client is public so neither 'client_assertion' nor 'client_secret' should be presented`
**Causa:** La app en Azure estaba configurada como cliente público (SPA). El BFF necesita ser cliente confidencial (Web) para usar `client_secret`.
**Solución:** Cambiar el Redirect URI de tipo SPA a tipo **Web**, y deshabilitar "Allow public client flows".

### 3. `State inválido` (por reinicio del servidor)
**Causa:** El `state` se almacenaba en un `Map` en memoria. Si el servidor se reiniciaba entre el login y el callback, el state se perdía.
**Solución:** State **stateless**: codificar `{ verifier, redirectTo, exp }` en base64 dentro del propio parámetro `state`.

### 4. Conexión CORS desde frontend a backend en distintos puertos
**Causa:** Frontend en puerto 5173, BFF en puerto 3001.
**Solución:** Middleware `cors({ origin: "http://localhost:5173", credentials: true })` en Express.

## Requisitos en Azure Portal
- **Redirect URI:** `http://localhost:3001/api/auth/callback`
  - Tipo: **Web** (no SPA)
- **Allow public client flows:** No (deshabilitado)
- **Client secret:** Generado en Certificates & Secrets

## Variables de entorno
```
VITE_CLIENT_ID=...         # Client ID de Azure AD
VITE_TENANT_ID=...         # Tenant ID
VITE_CLIENT_SECRET=...     # Client Secret (solo lo usa el backend)
```

## Cómo ejecutar
```bash
npm run dev:bff            # BFF (3001) + Frontend (5173)
```
O por separado:
```bash
npm run bff                # Solo backend (3001)
npm run dev                # Solo frontend (5173)
```

## Flujo completo
```
1. Usuario hace clic en "Iniciar sesión"
2. El frontend redirige a http://localhost:3001/api/auth/login
3. El BFF genera PKCE (verifier + challenge), codifica state stateless, redirige a Microsoft
4. Microsoft muestra la pantalla de login
5. Tras autenticarse, Microsoft redirige a http://localhost:3001/api/auth/callback
6. El BFF decodifica el state, valida expiración, obtiene el verifier
7. El BFF intercambia code + verifier + client_secret por tokens en Microsoft
8. El BFF decodifica el ID Token y firma su propio JWT de sesión
9. El BFF setea la cookie httpOnly y redirige al frontend
10. El frontend llama a GET /api/auth/me, recibe el usuario, lo muestra
```

## Implementado

- [x] Validación del ID Token con JWKS (`iss`, `aud`, nonce, `tid`)
- [x] Nonce anti-replay
- [x] Session JWT con clave configurable (`SESSION_SECRET` en `.env`)
- [x] Validación de tenant autorizado (single-tenant)

## Por hacer (producción)
- [ ] `secure: true` en la cookie (requiere HTTPS)
- [ ] Renovación de tokens (refresh token)
- [ ] Rate limiting y protección CSRF
- [ ] Logging estructurado

## Buenas prácticas aprendidas
1. El Redirect URI en Azure debe ser tipo **Web** para usar `client_secret`.
2. SPA y Web son mutuamente excluyentes para una misma URI.
3. El state debe ser stateless para sobrevivir reinicios del servidor.
4. La cookie `httpOnly` protege contra XSS — obligatorio en apps bancarias.
5. PKCE es obligatorio aunque uses `client_secret` (defense in depth).
6. El BFF escala mejor que MSAL.js en frontend porque el secret, validación y renovación están centralizados.
7. `prompt=login` molesta al usuario si ya tiene sesión — considerar `select_account` en producción.
