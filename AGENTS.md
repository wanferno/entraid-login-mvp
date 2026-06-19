# MVP Login Entra ID

## Descripción
MVP de inicio de sesión con Microsoft Entra ID usando MSAL.js, TypeScript y Vite. El login se dispara desde un modal embebido (popup).

## Stack
- **Build:** Vite 6 + TypeScript 5
- **Auth:** `@azure/msal-browser` v4 (flujo `loginPopup`)
- **Cache:** `localStorage` (sesión persistente)

## Estructura
```
entraid-login-mvp/
├── index.html          # HTML con modal, sección de usuario y error
├── src/
│   ├── main.ts         # Lógica MSAL: login, logout, manejo de sesión
│   └── styles.css      # Estilos del modal, spinner, layout
├── .env                # Variables de entorno (no incluido en git)
├── .env.example        # Plantilla para .env
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
└── AGENTS.md           # Este archivo
```

## Configuración pendiente
Antes de ejecutar, editar `.env` (o copiar `.env.example` a `.env`):
- `VITE_CLIENT_ID` → Client ID de la app en Azure Portal
- `VITE_TENANT_ID` → Tenant ID o `consumers` / `common`

## Comandos
- `npm run dev` → Servidor de desarrollo en `http://localhost:5173`
- `npm run build` → Compila TS y empaqueta en `dist/`

## Flujo
1. Usuario hace clic en "Iniciar sesión"
2. Se abre un modal con spinner indicando autenticación
3. MSAL abre popup de Entra ID
4. Al completarse, se cierra el modal y se muestra info del usuario
5. La sesión persiste en `localStorage` al recargar la página
6. "Cerrar sesión" borra tokens y vuelve al estado inicial
