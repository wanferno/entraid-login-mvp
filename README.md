# MVP Login con Microsoft Entra ID (BFF Pattern)

Backend for Frontend (BFF) con Authorization Code Flow + PKCE para autenticación con Microsoft Entra ID. El frontend **nunca ve los tokens de Microsoft** — todo el flujo OAuth lo maneja el backend Express y devuelve una cookie `httpOnly` de sesión.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vite 6 + TypeScript 5 (sin MSAL.js) |
| Backend (BFF) | Express 4 + Node 22 (ESM) |
| Auth | Authorization Code Flow + PKCE + client_secret |
| Sesión | Cookie httpOnly con JWT firmado |
| Tests | node:test (nativo, 0 dependencias) |
| Infra | Docker compose, GitHub Actions CI |

## Arquitectura

```
Browser                    BFF (Express)                Microsoft Entra ID
  │                           │                              │
  │  GET /api/auth/login      │                              │
  │  (redirect)               │                              │
  │ ────────────────────────▶ │  GET /authorize              │
  │                           │ ───────────────────────────▶ │
  │                           │                              │
  │                           │  ← Usuario autentica ─────── │
  │                           │                              │
  │                           │  GET /api/auth/callback      │
  │                           │  (code + state)              │
  │                           │ ←─────────────────────────── │
  │                           │                              │
  │                           │  POST /oauth2/v2.0/token     │
  │                           │  (code + verifier + secret)  │
  │                           │ ───────────────────────────▶ │
  │                           │  ←── ID Token ───────────────│
  │                           │                              │
  │                           │  Valida ID Token (JWKS)      │
  │                           │  Set-Cookie: session         │
  │                           │     (httpOnly, secure)       │
  │  ←── redirect (frontend) ─│                              │
  │                           │                              │
  │  GET /api/auth/me         │                              │
  │  (cookie session)         │                              │
  │ ────────────────────────▶ │                              │
  │  ←── { user: ... } ───────│                              │
```

## Prerrequisitos

- Node.js 22+
- Una cuenta de Azure con acceso a **Microsoft Entra ID**
- Una **App Registration** en Azure Portal
- Docker (opcional, para el entorno containerizado)

## Configuración de Azure

1. Crear una **App Registration** en [Azure Portal → Entra ID → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Anotar el **Application (client) ID** y el **Directory (tenant) ID**
3. Ir a **Certificates & secrets → Client secrets** y crear un nuevo secret. Anotar el **valor** (no el ID)
4. Ir a **Authentication → Redirect URIs** y agregar:
   - Tipo: **Web**
   - URI: `http://localhost:3001/api/auth/callback`

> Si usás HTTPS local (`HTTPS=true`), registrá también `https://localhost:3001/api/auth/callback`.

## Empezar rápido

```bash
# 1. Clonar
git clone <repo>
cd entraid-login-mvp

# 2. Variables de entorno
cp .env.example .env
# Editar .env con los datos de Azure

# 3. Instalar dependencias
npm install
npm install --prefix server

# 4. Arrancar (HTTP — desarrollo)
npm run dev:bff
# Frontend: http://localhost:5173
# BFF:      http://localhost:3001
```

### HTTPS local

```bash
# Generar certificados (una vez)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Arrancar con HTTPS
npm run dev:bffs
```

> La cookie `secure: true` solo funciona con HTTPS. En HTTP la cookie se envía igual pero sin la flag `secure`.

## Docker

```bash
# Build y arranque
docker compose up --build -d

# Ver logs
docker compose logs -f

# Parar
docker compose down
```

Asegurate de tener el `.env` configurado antes de arrancar (Docker lo pasa automáticamente al contenedor del BFF).

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `VITE_CLIENT_ID` | ✅ | — | Client ID de Azure AD |
| `VITE_TENANT_ID` | ✅ | — | Tenant ID |
| `VITE_CLIENT_SECRET` | ✅ | — | Client Secret |
| `SESSION_SECRET` | ❌ | random | Secreto para firmar JWT de sesión |
| `BFF_PORT` | ❌ | 3001 | Puerto del servidor BFF |
| `FRONTEND_PORT` | ❌ | 5173 | Puerto del frontend (Vite) |
| `VITE_BFF_PORT` | ❌ | 3001 | Puerto del BFF (desde el frontend) |
| `HTTPS` | ❌ | false | `true` para HTTPS local con certs |
| `LOG_LEVEL` | ❌ | info | Nivel de logging (pino) |

## Scripts

```bash
# Desde la raíz
npm run dev:bff     # BFF + Frontend (HTTP)
npm run dev:bffs    # BFF + Frontend (HTTPS)
npm run bff         # Solo BFF
npm run dev         # Solo frontend Vite

# Tests
npm test --prefix server          # Una vez
npm run test:watch --prefix server # En modo watch
```

## Endpoints BFF

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/auth/login` | Inicia flujo OAuth, redirige a Microsoft |
| `GET` | `/api/auth/callback` | Microsoft redirige aquí, intercambia code por tokens |
| `GET` | `/api/auth/me` | Devuelve usuario autenticado o `{ authenticated: false }` |
| `POST` | `/api/auth/logout` | Limpia cookies locales + devuelve URL de End Session de Microsoft |

## Seguridad

- [x] Authorization Code Flow + PKCE (S256)
- [x] ID Token validado con JWKS (firma, iss, aud, nonce, tid)
- [x] Cookie `httpOnly` (inaccesible desde JavaScript)
- [x] Cookie `secure: true` (con HTTPS)
- [x] `sameSite: lax`
- [x] Client secret nunca expuesto al frontend
- [x] Refresh token rotado + encryptado (AES-256-GCM)
- [x] Rate limiting por endpoint
- [x] Protección CSRF en endpoints POST
- [x] Helmet (CSP, HSTS, X-Frame-Options, etc.)
- [x] End Session de Microsoft (cierra sesión en Entra ID)

## Tests

```bash
node --test                    # Todos
node --test server/__tests__/routes.test.js  # Solo rutas
node --test --test-name-pattern="callback"   # Solo callback
```

**22 tests** — unitarios de helpers + integración de rutas + callback exitoso mockeado.

## Proyecto

```
entraid-login-mvp/
├── server/
│   ├── index.js              # BFF: Express (login, callback, me, logout)
│   ├── Dockerfile            # node:22-alpine
│   └── __tests__/            # Tests con node:test
├── src/
│   ├── main.ts               # Frontend: checkSession, login, logout
│   ├── vite-env.d.ts         # Tipos para import.meta.env
│   └── styles.css
├── index.html
├── .env.example
├── docker-compose.yml        # BFF + Frontend (nginx)
├── Dockerfile                # Frontend multi-stage
└── .github/workflows/ci.yml  # GitHub Actions
```

## Licencia

MIT
