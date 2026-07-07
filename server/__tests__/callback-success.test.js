import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.VITE_CLIENT_ID = "test-client-id";
process.env.VITE_TENANT_ID = "test-tenant-id";
process.env.VITE_CLIENT_SECRET = "test-client-secret";
process.env.SESSION_SECRET = "test-session-secret-32-chars!";
process.env.LOG_LEVEL = "silent";

const { app, tokenVerifier } = await import("../index.js");

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

function makeState(state) {
  return Buffer.from(JSON.stringify(state)).toString("base64");
}

describe("GET /api/auth/callback — éxito", () => {
  before(async () => {
    // Mock jwtVerify para que devuelva un payload válido
    mock.method(tokenVerifier, "verify", async () => ({
      sub: "microsoft-sub-456",
      name: "María García",
      email: "maria@test.com",
      preferred_username: "maria@test.com",
      tid: "test-tenant-id",
      nonce: "test-nonce",
    }));

    // Mock axios.post para que devuelva tokens
    const axios = await import("axios");
    mock.method(axios.default, "post", async () => ({
      data: {
        id_token: "fake-id-token",
        refresh_token: "fake-refresh-token",
      },
    }));

    await startServer();
  });

  after(async () => {
    mock.reset();
    await stopServer();
  });

  it("intercambia code, setea cookies y redirige al frontend", async () => {
    const validState = makeState({
      verifier: "test-verifier-1234567890123456789012345678901234567890",
      nonce: "test-nonce",
      redirectTo: "http://localhost:5173",
      exp: Date.now() + 300_000,
    });

    const res = await fetch(
      `${baseURL}/api/auth/callback?code=valid-code&state=${validState}`,
      { redirect: "manual" }
    );

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "http://localhost:5173");

    const setCookie = res.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("session="), "Debe setear session cookie");
    assert.ok(setCookie.includes("refresh_token="), "Debe setear refresh_token cookie");
    assert.ok(setCookie.includes("HttpOnly"), "Cookies deben ser httpOnly");
    assert.ok(setCookie.includes("Path=/"), "Cookies deben tener path");

    // Verificar que el mock de jwtVerify fue llamado
    const calls = tokenVerifier.verify.mock.calls;
    assert.equal(calls.length, 1, "jwtVerify debe llamarse una vez");
    assert.equal(calls[0].arguments[0], "fake-id-token", "Debe recibir el id_token");
  });

  it("valida nonce y tid del payload", async () => {
    const validState = makeState({
      verifier: "abcdef1234567890123456789012345678901234567890",
      nonce: "test-nonce",
      redirectTo: "http://localhost:5173",
      exp: Date.now() + 300_000,
    });

    const res = await fetch(
      `${baseURL}/api/auth/callback?code=code-2&state=${validState}`,
      { redirect: "manual" }
    );

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "http://localhost:5173");
  });

  it("rechaza nonce inválido", async () => {
    const stateWithWrongNonce = makeState({
      verifier: "abcdef1234567890123456789012345678901234567890",
      nonce: "wrong-nonce",
      redirectTo: "http://localhost:5173",
      exp: Date.now() + 300_000,
    });

    const res = await fetch(
      `${baseURL}/api/auth/callback?code=code-3&state=${stateWithWrongNonce}`,
      { redirect: "manual" }
    );

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.ok(
      location.searchParams.get("error").includes("Nonce"),
      "Debe rechazar nonce inválido"
    );
  });
});
