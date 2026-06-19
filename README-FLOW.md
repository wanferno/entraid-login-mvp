# Flujo: SSO Silent con fallback a Redirect (MSAL.js)

## Rama: `feature/sso-silent`

## Qué se implementó
Login con Microsoft Entra ID usando `ssoSilent` de MSAL.js como método principal,
con fallback automático a `loginRedirect` si no hay sesión activa.

## Diferencias con las otras ramas

| Aspecto | Popup | Redirect | SSO Silent |
|---|---|---|---|
| Experiencia | Ventana emergente | Redirección completa | Instantáneo si hay sesión, sino redirect |
| Modal spinner | Sí | No | Sí (mientras intenta SSO) |
| Interacción del usuario | Siempre | Siempre | Solo si no hay sesión activa |
| Dependencia | Navegador normal | Navegador normal | Cookies de terceros (iframe) |

## Decisiones técnicas

| Decisión | Valor | Motivo |
|---|---|---|
| Método primario | `ssoSilent` | Login instantáneo si el usuario ya tiene sesión en Microsoft |
| Fallback | `loginRedirect` | Si `ssoSilent` lanza `InteractionRequiredAuthError` |
| Modal | Se mantiene | Spinner mientras se intenta SSO, se cierra si falla |
| Logout | `logoutRedirect` | Consistente con el método de fallback |
| `BrowserAuthError` | Eliminado | Solo aplica a popups |

## Errores encontrados y solución

### 1. `InteractionRequiredAuthError`
**Causa:** El usuario no tiene sesión activa en Microsoft, o el navegador bloquea iframes de terceros (Safari ITP, Firefox Enhanced Tracking).
**Solución:** Capturar el error y redirigir a Microsoft con `loginRedirect`.

### 2. SSO Silent no funciona en Safari/Firefox con ITP
**Causa:** Estos navegadores bloquean cookies de terceros en iframes.
**Efecto:** El fallback a redirect se ejecuta siempre.

## Requisitos en Azure Portal
- **Redirect URI:** `http://localhost:5173` (tipo SPA)
- **ID tokens** habilitado

## Cómo ejecutar
```bash
npm install
npm run dev
```

## Buenas prácticas aprendidas
1. `ssoSilent` no es confiable al 100% — siempre tener fallback.
2. En navegadores con protección de tracking, el fallback se ejecuta siempre.
3. El modal da feedback visual durante el intento silencioso.
4. No hay necesidad de `BrowserAuthError` porque no usamos popups.
5. La sesión silenciosa solo funciona si el usuario tiene su sesión activa de Microsoft en el mismo navegador.
