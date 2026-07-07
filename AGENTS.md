# MVP Login Entra ID — Rama feature/bff-mvp

## Descripción
MVP del patrón **BFF (Backend for Frontend)** usando Authorization Code Flow con PKCE.
El frontend nunca ve los tokens de Microsoft. El backend (Express) maneja todo el flujo
OAuth y devuelve una cookie httpOnly de sesión.

## Stack
- **Frontend:** Vite 6 + TypeScript 5 (sin MSAL.js)
- **Backend:** Express 4 + Node 22 (JavaScript ESM)
- **Auth:** Authorization Code Flow + PKCE + client_secret
- **Sesión:** Cookie `httpOnly` con JWT firmado

## Estructura
```
entraid-login-mvp/
├── server/
│   ├── index.js          # BFF: login, callback, me, logout
│   └── package.json
├── src/
│   ├── main.ts           # Cliente BFF: checkSession, login, logout
│   └── styles.css
├── index.html
├── .env                  # Variables de entorno
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
├── AGENTS.md
├── ARQUITECTURA-BFF.md
└── README-FLOW.md
```

## Configuración

Editar `.env`:

| Variable | Descripción |
|---|---|
| `VITE_CLIENT_ID` | Client ID de Azure AD |
| `VITE_TENANT_ID` | Tenant ID |
| `VITE_CLIENT_SECRET` | Client Secret (desde Azure Portal → Certificates & secrets) |

El `CLIENT_SECRET` lo necesita el backend (no se expone al frontend).

## Redirect URI en Azure

Registrar en **Azure Portal → Authentication → Redirect URIs**:
- Tipo: **Web** (no SPA)
- URI: `http://localhost:3001/api/auth/callback`

## Comandos

```bash
npm run dev:bff     # Arranca BFF (3001) + Frontend (5173) en HTTP
npm run dev:bffs    # Arranca BFF (3001) + Frontend (5173) en HTTPS
```

O por separado:
```bash
npm run bff        # Solo backend
npm run dev        # Solo frontend Vite
```

## Flujo BFF

```
Frontend (5173)          BFF (3001)                Microsoft Entra ID
   │                        │                           │
   │  GET /api/auth/login   │                           │
   │  (redirect)            │                           │
   │ ─────────────────────▶ │  GET /authorize           │
   │                        │ ────────────────────────▶ │
   │                        │                           │
   │                        │  ← Usuario se autentica ─ │
   │                        │                           │
   │                        │  GET /api/auth/callback   │
   │                        │  (code + state)           │
   │                        │ ←──────────────────────── │
   │                        │                           │
   │                        │  POST /oauth2/v2.0/token  │
   │                        │  (code + verifier +       │
   │                        │   client_secret)          │
   │                        │ ────────────────────────▶ │
   │                        │  ←── ID Token ────────────│
   │                        │                           │
   │                        │  Valida y firma JWT       │
   │                        │  Set-Cookie: session      │
   │                        │     (httpOnly)            │
   │  ←── redirect (5173) ──│                           │
   │                        │                           │
   │  GET /api/auth/me      │                           │
   │  (cookie session)      │                           │
   │ ─────────────────────▶ │                           │
   │  ←── { user: ... } ────│                           │
```

## Endpoints BFF

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/auth/login` | Inicia flujo OAuth, redirige a Microsoft |
| GET | `/api/auth/callback` | Microsoft redirige aquí, intercambia code por tokens, setea cookie |
| GET | `/api/auth/me` | Devuelve usuario autenticado o `{ authenticated: false }` |
| POST | `/api/auth/logout` | Limpia la cookie de sesión |

## Seguridad (MVP)

- [x] Cookie `httpOnly` (inaccesible desde JS)
- [x] PKCE obligatorio (S256)
- [x] Client secret solo en backend
- [ ] `secure: true` (requiere HTTPS — deshabilitado para localhost)
- [ ] Validación de ID Token (firma, iss, aud) — pendiente en MVP
- [ ] Renovación de tokens (refresh token) — pendiente
