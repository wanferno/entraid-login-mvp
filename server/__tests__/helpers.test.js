import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.VITE_CLIENT_ID = "test-client-id";
process.env.VITE_TENANT_ID = "test-tenant-id";
process.env.VITE_CLIENT_SECRET = "test-client-secret";
process.env.SESSION_SECRET = "test-session-secret-32-chars!";

const { base64url, encrypt, decrypt } = await import("../index.js");

describe("base64url", () => {
  it("codifica un buffer sin padding", () => {
    const buf = Buffer.from("test");
    const result = base64url(buf);
    assert.equal(result, "dGVzdA");
    assert.ok(!result.includes("="));
  });

  it("codifica bytes aleatorios sin padding", () => {
    const buf = crypto.randomBytes(32);
    const result = base64url(buf);
    assert.ok(!result.includes("="));
    assert.ok(!result.includes("+"));
    assert.ok(!result.includes("/"));
  });

  it("produce strings URL-safe", () => {
    const buf = Buffer.from([0xff, 0xfb, 0xfc]); // contiene + y / en base64 normal
    const result = base64url(buf);
    assert.ok(!result.includes("+"));
    assert.ok(!result.includes("/"));
    assert.ok(!result.includes("="));
  });
});

describe("encrypt / decrypt", () => {
  it("hace round-trip correctamente", () => {
    const original = "my-refresh-token-value";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  it("produce distintos ciphertexts para el mismo input (random IV)", () => {
    const input = "same-value-every-time";
    const a = encrypt(input);
    const b = encrypt(input);
    assert.notEqual(a, b);
  });

  it("el formato del ciphertext tiene 3 partes separadas por :", () => {
    const result = encrypt("anything");
    const parts = result.split(":");
    assert.equal(parts.length, 3);
    // iv: 32 hex chars (16 bytes)
    assert.equal(parts[0].length, 32);
    // tag: 32 hex chars (16 bytes)
    assert.equal(parts[2].length, 32);
  });
});
