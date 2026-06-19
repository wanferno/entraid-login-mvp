const BFF_URL = "http://localhost:3001";

function showUserInfo(user: { name: string; email: string }) {
  document.getElementById("btnLogin")?.classList.add("hidden");
  document.getElementById("displayName")!.textContent = user.name ?? "—";
  document.getElementById("userEmail")!.textContent = user.email ?? "—";
  document.getElementById("userName")!.textContent = user.name ?? "—";
  document.getElementById("userInfo")?.classList.remove("hidden");
}

function showError(message: string) {
  const el = document.getElementById("errorMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 8000);
}

async function checkSession() {
  try {
    const res = await fetch(`${BFF_URL}/api/auth/me`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.authenticated) {
      showUserInfo(data.user);
    }
  } catch {
    showError("No se pudo conectar con el servidor BFF");
  }
}

function login() {
  window.location.href = `${BFF_URL}/api/auth/login?redirect=${encodeURIComponent(window.location.origin)}`;
}

async function logout() {
  await fetch(`${BFF_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-By": "bff-mvp" },
  });
  window.location.reload();
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    showError(error);
    history.replaceState(null, "", window.location.pathname);
  }

  checkSession();

  document.getElementById("btnLogin")?.addEventListener("click", login);
  document.getElementById("btnLogout")?.addEventListener("click", logout);
}

document.addEventListener("DOMContentLoaded", init);
