# Azure AD Configuration — Hybrid Auth BFF

## Redirect URIs

Registrar estos URIs en **Azure Portal → App Registration → Authentication → Redirect URIs**:

| Entorno | URI | Tipo |
|---------|-----|------|
| Desarrollo | `http://localhost:8080/api/auth/callback` | Web |
| Producción | `https://eclipsoft.dev/api/auth/callback` | Web |

Todas deben ser tipo **Web** (no SPA). El backend usa `client_secret` para el code exchange.

## End Session URL (logout)

| Entorno | URI |
|---------|-----|
| Producción | `https://eclipsoft.dev/api/auth/logout` |

## Certificates & Secrets

- Generar un **client secret** nuevo (no reutilizar el del MVP Express)
- Almacenar en `application.yml` como `azad.client-secret`
- No exponer en frontend ni en repositorios

## Scopes configurados

| Scope | Uso |
|-------|-----|
| `openid` | Requerido para OpenID Connect |
| `profile` | Obtener nombre, apellido del usuario |
| `email` | Obtener email del usuario |
| `offline_access` | Obtener refresh token |

## Permisos requeridos

- Delegado: openid, profile, email, offline_access
- No requiere permisos de aplicación

## Token lifetime

| Token | Default | Recomendado |
|-------|---------|-------------|
| Access Token | 60 min | 60 min (default) |
| ID Token | 60 min | 60 min (default) |
| Refresh Token | 90 días (rolling) | 90 días |

## Notas

- La validación de ID Token usa JWKS de `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`
- Validaciones requeridas: `iss`, `aud`, `nonce`, `tid`, exp, signature
- El `client_secret` rotado requiere zero downtime porque el backend usa el mismo secret para nuevos logins
