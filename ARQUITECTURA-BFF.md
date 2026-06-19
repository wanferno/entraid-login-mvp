# Arquitectura BFF para autenticación con múltiples proveedores

## Contexto

App multi-cliente (cooperativas, bancos, retail) con:

- **Sesión existente:** login user/pass con JWT propio
- **Nuevo requisito:** Login con Microsoft Entra ID (OAuth 2.0 / OIDC)
- **Clientes sensibles:** Bancos y cooperativas requieren cumplimiento de seguridad
- **Multi-compañía:** Cada compañía tiene su propio tenant IdP y configuración

Basado en documentos del proyecto (`docs/`):
- `Integracion EntraID.pdf` — Flujo técnico OBT + Entra ID
- `Lineamiento de Ciberseguridad AppEmpresarial EntraID.pdf` — Políticas de Banco Bolivariano
- `Tareas BBO.docx` — Plan de implementación Secure + Entra ID

## Restricciones del proveedor (Banco Bolivariano)

- Solo **OAuth 2.0 / OpenID Connect** y **SAML 2.0** permitidos
- **Single tenant obligatorio** — no multi-tenant ni cuentas personales
- App registrations creadas solo por ingenieros cloud + seguridad
- **MFA obligatorio** para todos los usuarios
- Acceso condicional: restricción por ubicación geográfica/IP
- Bloquear acceso desde dispositivos no administrados
- **Client secrets**: máx 6-12 meses, usar Azure Key Vault
- **Certificados X.509** recomendados sobre client secrets
- Solo **grupos de seguridad** asignados a la app (no usuarios directos)
- Políticas de sesión con expiración de tokens
- Revisión periódica de permisos

## Flujo Authorization Code Flow con PKCE

```
Frontend                          Backend (BFF)                     Microsoft Entra ID
   │                                │                                    │
   │  GET /url-entra-id             │                                    │
   │  { company: "bolivariano" }   │                                    │
   │ ─────────────────────────▶     │                                    │
   │  ←─ { url: "https://..." } ── │                                    │
   │                                │                                    │
   │  Abre modal con la URL de      │                                    │
   │  Microsoft (login.microsoft)   │                                    │
   │ ────────────────────────────────────────────────────────────────▶  │
   │                                │                                    │
   │                                │    Usuario se autentica en MS      │
   │                                │                                    │
   │  Callback: GET /callback-entra-id?code=ABC123&state=xyz            │
   │  (backend proxy)              │                                    │
   │                                │                                    │
   │  POST /token-oauth-v2          │                                    │
   │  { code: "ABC123",            │                                    │
   │    company: "bolivariano" }   │                                    │
   │ ─────────────────────────▶     │                                    │
   │                                │  POST /oauth2/v2.0/token          │
   │                                │  (code + client_secret +          │
   │                                │   code_verifier + redirect_uri)   │
   │                                │ ────────────────────────────────▶ │
   │                                │  ←── ID Token + Access Token ─────│
   │                                │                                    │
   │                                │  Valida ID Token                   │
   │                                │  (firma, iss, aud, exp, tid)      │
   │                                │                                    │
   │                                │  Mapea groups → rol Secure        │
   │                                │  Crea/actualiza usuario local      │
   │                                │                                    │
   │  ←─ Set-Cookie: session_jwt ── │                                    │
   │       (httpOnly, secure,      │                                    │
   │        sameSite=strict)       │                                    │
```

## Componentes

| Componente | Rol |
|---|---|
| Usuario | Sujeto autenticado |
| Frontend | Cliente OIDC, muestra modal de Microsoft |
| Backend (BFF) | Credential Client, intercambia code por tokens, valida, emite sesión |
| Azure Entra ID | Identity Provider (IdP) |

## Endpoints del backend

### GET /url-entra-id
Recibe el alias de la compañía y devuelve la URL de autorización de Microsoft.

```http
Request:  { company: "bolivariano" }
Response: { url: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize?..." }
Error:    "No se encuentra configurado ENTRA ID en la compañía"
```

Parámetros de la URL generada:
```
client_id={clientId}
response_type=code
redirect_uri=https://secure.com/callback-entra-id
response_mode=query
scope=openid profile email
state={random}
code_challenge={S256}
code_challenge_method=S256
prompt=login
```

### GET /callback-entra-id
Proxy del callback. Recibe el `code` de Microsoft y lo devuelve al frontend.

```http
GET /callback-entra-id?code=ABC123&state=xyz
Response: { code: "ABC123" }
```

### POST /token-oauth-v2
Intercambia el `code` por tokens con Microsoft, valida, mapea roles y crea sesión.

```http
Request: {
  company: "bolivariano",
  code: "ABC123"
}
Response: {
  token: "jwt_de_sesion_secure",
  user: { name: "...", email: "..." }
}
```

Proceso interno:
1. Busca compañía por `key` (ej: "bolivariano")
2. Obtiene configuración Entra ID de la compañía
3. Intercambia code por tokens:
   ```http
   POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
   client_id={clientId}
   scope=openid profile email
   grant_type=authorization_code
   code={code}
   redirect_uri={redirectUri}
   client_secret={secret}
   code_verifier={verifier}
   ```
4. Valida ID Token:
   - Firma digital (RS256)
   - `iss` → emisor correcto
   - `aud` → client ID propio
   - `exp` → no expirado
   - `tid` → tenant autorizado
   - `email` → email del usuario autorizado
5. Lee `groups` del response y mapea a rol Secure mediante tabla `configuración_entra_id_groups_claims_secure`
6. Crea o actualiza usuario local con función que recibe: `company_id`, `email`, `groups`, `rol_secure_id`
7. Genera JWT de sesión propio y responde

## Mapeo de grupos Azure → roles Secure

Tabla: `configuración_entra_id_groups_claims_secure`

| Campo | Descripción |
|---|---|
| `grupo_claims` | Grupo que devuelve Azure AD (ej: "BB_SECURE_ADMIN") |
| `id_rol_secure` | ID del rol en Secure |
| `entraid_id` | FK a configuración Entra ID de la compañía |

## Gestión de usuario local

### Creación (primera vez)
- Recibe: `company_id`, `email`, `claims`, `rol_secure_id`
- Crea registro en tablas: usuario, persona, rol, menú
- Usa tabla `mant_tb_roles_menu_x_compania` para asignar menús según rol + compañía
- Marca `tipo_autenticacion = "ENTRA ID"` en tabla user
- En persona: email encriptado (evita envío de contraseña), ID genérica si Azure no devuelve cédula

### Actualización (usuario existente, rol cambiado)
- Borra menús anteriores y asigna nuevos según `mant_tb_roles_menu_x_compania`
- Actualiza rol en `seguridad.seg_tb_rol_x_usuario`

## Tabla compañía — campos nuevos

| Campo | Tipo | Descripción |
|---|---|---|
| `tipo_autenticacion` | string | "LOCAL" o "ENTRAID" |
| `key_entraid` | string | Alias de la empresa (ej: "bolivariano") |
| `entraid_id` | integer | FK a tabla `configuracion_entraid` |

## Tabla configuración Entra ID

Campos:
- `tenant_id`
- `client_id`
- `client_secret` (cifrado / Key Vault)
- `redirect_uri`
- `scope`
- `response_type` = "code"
- `response_mode` = "query"
- `code_challenge_method` = "S256"
- `prompt` = "login"

## Seguridad

- [ ] Cookie `httpOnly` + `secure` + `sameSite=strict`
- [ ] Validar firma del ID token con JWKS de Azure AD
- [ ] `aud` debe coincidir con el Client ID
- [ ] `iss` debe coincidir con el tenant
- [ ] `tid` validado contra tenant autorizado
- [ ] `exp` verificado en cada request
- [ ] PKCE obligatorio (`S256`)
- [ ] Client secrets rotados cada 6-12 meses, almacenados en Azure Key Vault
- [ ] Certificados X.509 preferidos sobre client secrets
- [ ] Single tenant — rechazar tokens de otros tenants
- [ ] MFA obligatorio (configurado en acceso condicional)
- [ ] Solo grupos de seguridad asignados a la app (no usuarios directos)
- [ ] "Olvidar contraseña" deshabilitado para usuarios ENTRA ID

## Convivencia con login local

| Aspecto | Login LOCAL | Login ENTRA ID |
|---|---|---|
| Endpoint | `POST /authenticate` | `GET /url-entra-id` → callback → `POST /token-oauth-v2` |
| UI | Formulario user/pass | Botón "Ingresar con EntraID" + modal Microsoft |
| Sesión | Cookie `httpOnly` | Cookie `httpOnly` |
| Tipo en BD | `tipo_autenticacion = "LOCAL"` | `tipo_autenticacion = "ENTRAID"` |
| Contraseña | Manejada localmente | No aplica (email encriptado) |
| "Olvidar contraseña" | Habilitado | **Deshabilitado** |

El frontend no distingue el método después del login — solo tiene una cookie de sesión.

## Referencias

- [Integracion EntraID.pdf](docs/Integracion%20EntraID.pdf)
- [Lineamiento de Ciberseguridad AppEmpresarial EntraID.pdf](docs/Lineamiento%20de%20Ciberseguridad%20AppEmpresarial%20EntraID.pdf)
- [Tareas BBO.docx](docs/Tareas%20BBO.docx)
- [MSAL.js BFF pattern](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-js-sso#bff-pattern)
- [Token validation Azure AD](https://learn.microsoft.com/en-us/azure/active-directory/develop/access-tokens#validating-tokens)
- [OWASP HttpOnly cookies](https://owasp.org/www-community/HttpOnly)
