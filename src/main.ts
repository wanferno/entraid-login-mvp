import {
  PublicClientApplication,
  type AccountInfo,
  InteractionRequiredAuthError,
  BrowserAuthError,
} from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: "localStorage" as const },
};

const loginRequest = { scopes: ["User.Read", "openid", "profile", "email"] };

const msalInstance = new PublicClientApplication(msalConfig);

async function handleRedirectPromise() {
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response) {
      showUserInfo(response.account);
    }
  } catch (err) {
    showError("Error al procesar la redirección", err);
  }
}

async function login() {
  showModal();
  try {
    const response = await msalInstance.loginPopup(loginRequest);
    hideModal();
    showUserInfo(response.account);
  } catch (err) {
    hideModal();
    if (err instanceof InteractionRequiredAuthError) {
      showError("Se requiere interacción adicional. Reintenta con el flujo de redirección.");
      redirectLogin();
      return;
    }
    if (err instanceof BrowserAuthError && err.message.includes("user_cancelled")) {
      showError("Inicio de sesión cancelado por el usuario.");
      return;
    }
    showError("Error al iniciar sesión", err);
  }
}

async function redirectLogin() {
  await msalInstance.loginRedirect(loginRequest);
}

function logout() {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.logoutPopup({
      account: accounts[0],
      postLogoutRedirectUri: window.location.origin,
    });
  }
  document.getElementById("userInfo")?.classList.add("hidden");
  document.getElementById("btnLogin")?.classList.remove("hidden");
}

function showModal() {
  document.getElementById("modalOverlay")?.classList.remove("hidden");
}

function hideModal() {
  document.getElementById("modalOverlay")?.classList.add("hidden");
}

function showUserInfo(account: AccountInfo) {
  document.getElementById("btnLogin")?.classList.add("hidden");
  document.getElementById("displayName")!.textContent = account.name ?? "—";
  document.getElementById("userEmail")!.textContent = account.username ?? "—";
  document.getElementById("userName")!.textContent = account.name ?? "—";
  document.getElementById("userInfo")?.classList.remove("hidden");
  document.getElementById("errorMessage")?.classList.add("hidden");
}

function showError(message: string, error?: unknown) {
  const el = document.getElementById("errorMessage");
  if (!el) return;
  el.textContent = error ? `${message}: ${String(error)}` : message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 8000);
}

function checkExistingAccount() {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    showUserInfo(accounts[0]);
    return true;
  }
  return false;
}

async function init() {
  await msalInstance.initialize();
  handleRedirectPromise();

  const existing = checkExistingAccount();
  if (existing && msalInstance.getActiveAccount() === null) {
    msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
  }

  document.getElementById("btnLogin")?.addEventListener("click", login);
  document.getElementById("btnCloseModal")?.addEventListener("click", hideModal);
  document.getElementById("btnCancel")?.addEventListener("click", hideModal);
  document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) hideModal();
  });
  document.getElementById("btnLogout")?.addEventListener("click", logout);
}

document.addEventListener("DOMContentLoaded", init);
