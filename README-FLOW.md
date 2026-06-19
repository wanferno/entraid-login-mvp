# Flujo: Login Redirect (MSAL.js)

## Rama: `feature/redirect-flow`

## Qué se implementó
Login con Microsoft Entra ID usando `@azure/msal-browser` v4 con flujo `loginRedirect`.
La página completa redirige a Microsoft y vuelve con la sesión activa.

## Diferencias con `feature/login-popup`

| Aspecto | Popup | Redirect |
|---|---|---|
| Experiencia | Ventana emergente | Redirección de página completa |
| Modal spinner | Sí, mientras espera el popup | Eliminado (la página se va) |
| Popups bloqueados | Afecta | No aplica |
| `handleRedirectPromise` | No necesario | Obligatorio al iniciar |
| Error `user_cancelled` | Manejado | No aplica |
| `logoutPopup` vs `logoutRedirect` | `logoutPopup` | `logoutRedirect` |

## Decisiones técnicas

| Decisión | Valor | Motivo |
|---|---|---|
| Modal spinner | Eliminado | Con redirect la página navega, no tiene sentido |
| Error `user_cancelled` | Eliminado | No existe popup para cancelar |
| `InteractionRequiredAuthError` | Eliminado | El redirect lo maneja implícitamente |
| `BrowserAuthError` | Eliminado | Solo aplica a popups |
| `handleRedirectPromise()` | Se mantiene | Procesa el resultado al volver de Microsoft |

## Errores encontrados y solución

Los mismos que en `loginPopup`, ya que ambos usan MSAL.js del lado del cliente:
- Requisito de `initialize()` en MSAL.js v4
- Redirect URI debe estar registrado en Azure como tipo **SPA**
- Coincidencia exacta del `redirectUri`

## Requisitos en Azure Portal
- **Redirect URI:** `http://localhost:5173` (tipo SPA)
- **ID tokens** habilitado

## Cómo ejecutar
```bash
npm install
npm run dev
```

## Buenas prácticas aprendidas
1. Redirect NO necesita modal — la página navega inmediatamente.
2. `handleRedirectPromise()` debe estar al inicio, antes de cualquier otra lógica.
3. Al volver del redirect, la página se recarga completamente — MSAL rehidrata desde `localStorage`.
4. Para logout, usar el mismo método que login (redirect con redirect, popup con popup) para consistencia.
