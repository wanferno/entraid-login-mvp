import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";

// ── Env vars (antes de importar el módulo) ────────────────────
process.env.VITE_CLIENT_ID = "test-client-id";
process.env.VITE_TENANT_ID = "test-tenant-id";
process.env.VITE_CLIENT_SECRET = "test-client-secret";
process.env.SESSION_SECRET = "test-session-secret-32-chars!";
process.env.LOG_LEVEL = "silent";

const { app } = await import("../index.js");

// ── Test server lifecycle ─────────────────────────────────────
let server;
let baseURL;

function startServer() {
  return new Promise((resolve) => {
    server = createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      baseURL = `http://localhost:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// ── Tests ─────────────────────────────────────────────────────
describe("Routes", () => {
  let originalAxiosPost;

  before(async () => {
    // Mock axios.post para evitar llamadas reales a Microsoft
    const axios = await import("axios");
    mock.method(axios.default, "post", async () => ({
      data: {
        id_token: "mock-id-token",
        refresh_token: "mock-refresh-token",
      },
    }));

    await startServer();
  });

  after(async () => {
    mock.reset();
    await stopServer();
  });

  // ── Health ──────────────────────────────────────────────────
  describe("GET /api/health", () => {
    it("responde con status ok", async () => {
      const res = await fetch(`${baseURL}/api/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, "ok");
      assert.ok(typeof body.uptime === "number");
    });
  });

  // ── Login ───────────────────────────────────────────────────
  describe("GET /api/auth/login", () => {
    it("redirige a Microsoft con parámetros correctos", async () => {
      const res = await fetch(`${baseURL}/api/auth/login`, {
        redirect: "manual",
      });
      assert.equal(res.status, 302);

      const location = res.headers.get("location");
      assert.ok(
        location.startsWith(
          "https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/authorize"
        )
      );

      const url = new URL(location);
      assert.equal(url.searchParams.get("client_id"), "test-client-id");
      assert.equal(url.searchParams.get("response_type"), "code");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.get("prompt"), "login");
      assert.ok(url.searchParams.has("code_challenge"));
      assert.ok(url.searchParams.has("state"));
      assert.ok(url.searchParams.has("nonce"));
    });

    it("incluye redirect personalizado en el state", async () => {
      const res = await fetch(
        `${baseURL}/api/auth/login?redirect=https://miapp.com`,
        { redirect: "manual" }
      );
      assert.equal(res.status, 302);

      const location = res.headers.get("location");
      const url = new URL(location);
      const stateRaw = Buffer.from(
        url.searchParams.get("state"),
        "base64"
      ).toString();
      const state = JSON.parse(stateRaw);
      assert.equal(state.redirectTo, "https://miapp.com");
    });
  });

  // ── Me ──────────────────────────────────────────────────────
  describe("GET /api/auth/me", () => {
    it("devuelve authenticated: false sin cookie", async () => {
      const res = await fetch(`${baseURL}/api/auth/me`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.authenticated, false);
    });

    it("devuelve authenticated: true con sesión válida", async () => {
      const sessionToken = jwt.sign(
        {
          sub: "user-123",
          name: "Pepe",
          email: "pepe@test.com",
          tid: "test-tenant-id",
        },
        "test-session-secret-32-chars!",
        { expiresIn: "1h" }
      );

      const res = await fetch(`${baseURL}/api/auth/me`, {
        headers: { Cookie: `session=${sessionToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.authenticated, true);
      assert.equal(body.user.sub, "user-123");
      assert.equal(body.user.name, "Pepe");
    });

    it("devuelve authenticated: false con sesión expirada sin refresh cookie", async () => {
      const expiredToken = jwt.sign(
        {
          sub: "user-123",
          name: "Pepe",
          email: "pepe@test.com",
          tid: "test-tenant-id",
        },
        "test-session-secret-32-chars!",
        { expiresIn: "0s" }
      );

      const res = await fetch(`${baseURL}/api/auth/me`, {
        headers: { Cookie: `session=${expiredToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.authenticated, false);
    });

    it("intenta refresh con sesión expirada y refresh_token cookie", async () => {
      const expiredToken = jwt.sign(
        {
          sub: "user-123",
          name: "Pepe",
          email: "pepe@test.com",
          tid: "test-tenant-id",
        },
        "test-session-secret-32-chars!",
        { expiresIn: "0s" }
      );

      const res = await fetch(`${baseURL}/api/auth/me`, {
        // refresh_token cookie no está encryptada con la clave de test, así que falla
        headers: {
          Cookie: `session=${expiredToken}; refresh_token=invalido`,
        },
      });
      // Al fallar el decrypt del refresh, retorna authenticated: false
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.authenticated, false);
    });
  });

  // ── Logout ──────────────────────────────────────────────────
  describe("POST /api/auth/logout", () => {
    it("limpia cookies y devuelve logoutUrl", async () => {
      const res = await fetch(`${baseURL}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-By": "bff-mvp",
          Cookie: "session=abc; refresh_token=xyz",
        },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.ok(body.logoutUrl, "Debe incluir logoutUrl");
      assert.ok(
        body.logoutUrl.includes("oauth2/v2.0/logout"),
        "logoutUrl debe apuntar a Microsoft"
      );
      assert.ok(
        body.logoutUrl.includes("post_logout_redirect_uri"),
        "logoutUrl debe incluir post_logout_redirect_uri"
      );

      const setCookie = res.headers.get("set-cookie") || "";
      assert.ok(setCookie.includes("session="));
      assert.ok(setCookie.includes("refresh_token="));
    });

    it("rechaza POST sin header CSRF", async () => {
      const res = await fetch(`${baseURL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error, "CSRF detectado");
    });
  });

  // ── Callback errores ───────────────────────────────────────
  describe("GET /api/auth/callback — errores", () => {
    it("responde error si falta code y state", async () => {
      const res = await fetch(`${baseURL}/api/auth/callback`, {
        redirect: "manual",
      });
      assert.equal(res.status, 302);
      const location = new URL(res.headers.get("location"));
      assert.ok(location.searchParams.get("error").includes("Faltan"));
    });

    it("responde error si Microsoft envía error", async () => {
      const res = await fetch(
        `${baseURL}/api/auth/callback?error=access_denied&error_description=El+usuario+declinó`,
        { redirect: "manual" }
      );
      assert.equal(res.status, 302);
      const location = new URL(res.headers.get("location"));
      assert.ok(location.searchParams.get("error").includes("cancelada"));
    });

    it("responde error si el state expiró", async () => {
      const expiredState = Buffer.from(
        JSON.stringify({
          verifier: "abc",
          nonce: "xyz",
          redirectTo: "http://localhost:5173",
          exp: Date.now() - 1000,
        })
      ).toString("base64");

      const res = await fetch(
        `${baseURL}/api/auth/callback?code=abc&state=${expiredState}`,
        { redirect: "manual" }
      );
      assert.equal(res.status, 302);
      const location = new URL(res.headers.get("location"));
      assert.ok(location.searchParams.get("error").includes("inválido"));
    });
  });

  // ── Callback con axios mockeado ────────────────────────────
  describe("GET /api/auth/callback — con axios mockeado", () => {
    it("llega a jwtVerify y falla con token inválido (jose real)", async () => {
      // El state es válido, axios devuelve id_token mockeado,
      // pero jose.jwtVerify falla porque "mock-id-token" no es un JWT real.
      const validState = Buffer.from(
        JSON.stringify({
          verifier: "test-verifier-1234567890123456789012345678901234567890",
          nonce: "test-nonce",
          redirectTo: "http://localhost:5173",
          exp: Date.now() + 300_000,
        })
      ).toString("base64");

      const res = await fetch(
        `${baseURL}/api/auth/callback?code=valid-code&state=${validState}`,
        { redirect: "manual" }
      );
      assert.equal(res.status, 302);
      const location = new URL(res.headers.get("location"));
      assert.ok(
        location.searchParams.get("error").includes("inválido") ||
          location.searchParams.get("error").includes("Token")
      );
    });
  });
});
