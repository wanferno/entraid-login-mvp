const PROTO = window.location.protocol === "https:" ? "https" : "http";
const BFF_PORT = import.meta.env.VITE_BFF_PORT || "3001";
const BFF_URL = `${PROTO}://localhost:${BFF_PORT}`;

// ── State ───────────────────────────────────────────────────

// ── DOM refs ────────────────────────────────────────────────
const loadingState = document.getElementById("loadingState")!;
const loginState = document.getElementById("loginState")!;
const userInfo = document.getElementById("userInfo")!;
const errorEl = document.getElementById("errorMessage")!;
const errorText = document.getElementById("errorText")!;
const btnLogin = document.getElementById("btnLogin")!;
const btnLogout = document.getElementById("btnLogout")!;
const btnDismissError = document.getElementById("btnDismissError")!;
const modalOverlay = document.getElementById("modalOverlay")!;
const displayName = document.getElementById("displayName")!;
const userEmail = document.getElementById("userEmail")!;
const userNameEl = document.getElementById("userName")!;
const userAvatar = document.getElementById("userAvatar")!;

// ── UI helpers ──────────────────────────────────────────────
function showLoading(show: boolean) {
  loadingState.classList.toggle("hidden", !show);
}

function showLoginButton(show: boolean) {
  loginState.classList.toggle("hidden", !show);
}

function showUserCard(show: boolean) {
  userInfo.classList.toggle("hidden", !show);
}

function showModal(show: boolean) {
  modalOverlay.classList.toggle("hidden", !show);
}

function setLogoutLoading(loading: boolean) {
  const textEl = btnLogout.querySelector(".btn-text") as HTMLElement;
  const spinnerEl = btnLogout.querySelector(".btn-spinner") as HTMLElement;
  (btnLogout as HTMLButtonElement).disabled = loading;
  textEl.classList.toggle("hidden", loading);
  spinnerEl.classList.toggle("hidden", !loading);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] ?? "?").toUpperCase();
}

function showError(message: string) {
  errorText.textContent = message;
  errorEl.classList.remove("hidden");
}

function hideError() {
  errorEl.classList.add("hidden");
}

function showUserInfo(user: { name: string; email: string }) {
  displayName.textContent = user.name ?? "—";
  userEmail.textContent = user.email ?? "—";
  userNameEl.textContent = user.name ?? "—";
  userAvatar.textContent = initials(user.name ?? user.email ?? "?");
  showLoading(false);
  showLoginButton(false);
  showUserCard(true);
}

// ── API ─────────────────────────────────────────────────────
async function checkSession() {
  try {
    const res = await fetch(`${BFF_URL}/api/auth/me`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.authenticated) {
      showUserInfo(data.user);
    } else {
      showLoading(false);
      showLoginButton(true);
    }
  } catch {
    showLoading(false);
    showLoginButton(true);
    showError("No se pudo conectar con el servidor BFF");
  }
}

function login() {
  showModal(true);
  window.location.href = `${BFF_URL}/api/auth/login?redirect=${encodeURIComponent(window.location.origin)}`;
}

async function logout() {
  setLogoutLoading(true);
  try {
    const res = await fetch(`${BFF_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-By": "bff-mvp" },
    });
    const data = await res.json();
    if (data.logoutUrl) {
      window.location.href = data.logoutUrl;
    } else {
      window.location.reload();
    }
  } catch {
    setLogoutLoading(false);
    showError("Error al cerrar sesión");
  }
}

// ── Init ────────────────────────────────────────────────────
function init() {
  // Error from callback redirect
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    showError(error);
    history.replaceState(null, "", window.location.pathname);
  }

  // Show loading state, then check session
  showLoading(true);
  checkSession();

  // Events
  btnLogin.addEventListener("click", login);
  btnLogout.addEventListener("click", logout);
  btnDismissError.addEventListener("click", hideError);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) showModal(false);
  });

  // Close modal if user navigates back
  window.addEventListener("pageshow", () => {
    showModal(false);
  });
}

document.addEventListener("DOMContentLoaded", init);
