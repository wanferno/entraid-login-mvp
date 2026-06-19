# Flujo: Login Popup (MSAL.js)

## Rama: `feature/login-popup`

## Qué se implementó
Login con Microsoft Entra ID usando `@azure/msal-browser` v4 con flujo `loginPopup`.
El frontend maneja toda la autenticación directamente. Los tokens se almacenan en `localStorage`.

## Stack
- Vite 6 + TypeScript 5
- `@azure/msal-browser` ^4.2.0
- Cache: `localStorage`

## Decisiones técnicas

| Decisión | Opción elegida | Alternativa | Motivo |
|---|---|---|---|
| Flujo | Popup (`loginPopup`) | Redirect, SSO Silent | El popup no recarga la página, mejor UX |
| Almacenamiento | `localStorage` | `sessionStorage`, cookies | Persiste entre pestañas y reinicios del navegador |
| Redirect URI | SPA (`http://localhost:5173`) | Web | MSAL con flujo SPA no requiere secret del backend |
| Configuración | `.env` con `VITE_` | Hardcode | Variables de entorno estándar de Vite |
| Modal | HTML/CSS nativo | Librería de modales | Simplicidad, sin dependencias extra |
| Inicialización | `msalInstance.initialize()` | Llamado directo a APIs | Requerido desde MSAL.js v4 |

## Errores encontrados y solución

### 1. `BrowserAuthError: uninitialized_public_client_application`
**Causa:** MSAL.js v4 requiere `await msalInstance.initialize()` antes de usar cualquier API.
**Solución:** Hacer `init()` asíncrono y llamar `await msalInstance.initialize()` al inicio.

### 2. `AADSTS500113: No reply address is registered`
**Causa:** Redirect URI no registrado en Azure Portal.
**Solución:** Agregar `http://localhost:5173` como Redirect URI tipo Single-page application (SPA).

### 3. `ServerError: invalid_client`
**Causa:** El Redirect URI en Azure no coincide con el que envía MSAL.
**Solución:** Verificar que `redirectUri: window.location.origin` coincida exactamente con lo registrado en Azure.

## Requisitos en Azure Portal
- App Registration con:
  - **Tipos de cuenta:** Single tenant
  - **Redirect URI:** `http://localhost:5173` (tipo SPA)
  - **Plataforma:** Single-page application (SPA)
  - **ID tokens** habilitado (opcional pero recomendado)

## Cómo ejecutar
```bash
npm install
npm run dev
```

## Buenas prácticas aprendidas
1. MSAL.js v4 exige `initialize()` — no omitirlo.
2. El `redirectUri` debe coincidir exactamente (incluyendo puerto y sin slash al final).
3. Los popups pueden ser bloqueados por el navegador — considerar fallback.
4. `localStorage` es vulnerable a XSS, no apto para apps bancarias.
