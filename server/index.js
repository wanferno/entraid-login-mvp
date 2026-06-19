import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import axios from "axios";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const ENCRYPTION_KEY = crypto.createHash("sha256").update(SESSION_SECRET).digest();

const CLIENT_ID = process.env.VITE_CLIENT_ID;
const TENANT_ID = process.env.VITE_TENANT_ID;
const CLIENT_SECRET = process.env.VITE_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${PORT}/api/auth/callback`;
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: { target: "pino/file", options: { destination: 1 } },
});

if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET) {
  logger.fatal({ CLIENT_ID: !!CLIENT_ID, TENANT_ID: !!TENANT_ID, CLIENT_SECRET: !!CLIENT_SECRET }, "Variables de entorno faltantes");
  process.exit(1);
}

// ── Health ──────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Rate limiting ──────────────────────────────────────────────
const limiterLogin = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { error: "Demasiadas solicitudes, intente más tarde" },
});
const limiterCallback = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { error: "Demasiadas solicitudes, intente más tarde" },
});
const limiterGeneral = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: { error: "Demasiadas solicitudes, intente más tarde" },
});

// ── CSRF ────────────────────────────────────────────────────────
function csrfCheck(req, res, next) {
  if (req.method === "POST" && req.headers["x-requested-by"] !== "bff-mvp") {
    logger.warn({ ip: req.ip, path: req.path }, "CSRF detectado");
    return res.status(403).json({ error: "CSRF detectado" });
  }
  next();
}

// ── Request logging ─────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      logger.info({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    }
  });
  next();
});

// ── Middleware global ──────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use("/api/auth/login", limiterLogin);
app.use("/api/auth/callback", limiterCallback);
app.use("/api", limiterGeneral);
app.use(csrfCheck);

// ── JWKS ────────────────────────────────────────────────────────
let jwks;
function getJWKS() {
  if (!jwks) {
    const url = new URL(
      `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`
    );
    jwks = createRemoteJWKSet(url);
  }
  return jwks;
}

// ── Helpers ────────────────────────────────────────────────────
function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${enc}:${cipher.getAuthTag().toString("hex")}`;
}

function decrypt(text) {
  const [iv, enc, tag] = text.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ENCRYPTION_KEY,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let dec = decipher.update(enc, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

function setSessionCookie(res, payload) {
  const token = jwt.sign(
    {
      sub: payload.sub,
      name: payload.name,
      email: payload.email || payload.preferred_username,
      tid: payload.tid,
    },
    SESSION_SECRET,
    { expiresIn: "1h" }
  );

  res.cookie("session", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 1000,
  });
}

async function tryRefresh(req, res) {
  const encrypted = req.cookies?.refresh_token;
  if (!encrypted) return null;

  try {
    const refreshToken = decrypt(encrypted);
    const tokenRes = await axios.post(
      `${AUTHORITY}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "openid profile email offline_access",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { id_token, refresh_token: newRefreshToken } = tokenRes.data;
    const { payload: verified } = await jwtVerify(id_token, getJWKS(), {
      issuer: `${AUTHORITY}/v2.0`,
      audience: CLIENT_ID,
    });

    setSessionCookie(res, verified);

    if (newRefreshToken) {
      res.cookie("refresh_token", encrypt(newRefreshToken), {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000,
      });
    }

    logger.info({ sub: verified.sub }, "Refresh token exitoso");
    return verified;
  } catch (err) {
    logger.warn({ error: err.message }, "Refresh token falló");
    res.clearCookie("refresh_token");
    return null;
  }
}

// ── Endpoints ──────────────────────────────────────────────────

app.get("/api/auth/login", (req, res) => {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  const nonce = crypto.randomUUID();

  const statePayload = {
    verifier,
    nonce,
    redirectTo: req.query.redirect || "http://localhost:5173",
    exp: Date.now() + 300_000,
  };
  const state = base64url(Buffer.from(JSON.stringify(statePayload)));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email offline_access",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
  });

  logger.info({ tenant: TENANT_ID }, "Inicio flujo OAuth");
  res.redirect(`${AUTHORITY}/oauth2/v2.0/authorize?${params}`);
});

app.get("/api/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.error({ error, description: req.query.error_description }, "Error de Microsoft en callback");
    return res.redirect(`http://localhost:5173?error=${encodeURIComponent("Autenticación cancelada")}`);
  }

  if (!code || !state) {
    return res.redirect("http://localhost:5173?error=Faltan+par%C3%B3metros");
  }

  let stored;
  try {
    const raw = Buffer.from(state, "base64").toString();
    stored = JSON.parse(raw);
    if (Date.now() > stored.exp) throw new Error("expirado");
  } catch {
    logger.warn("State inválido en callback");
    return res.redirect("http://localhost:5173?error=State+inv%C3%A1lido");
  }

  try {
    const tokenRes = await axios.post(
      `${AUTHORITY}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: stored.verifier,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { id_token, refresh_token } = tokenRes.data;

    let payload;
    try {
      const { payload: verified } = await jwtVerify(id_token, getJWKS(), {
        issuer: `${AUTHORITY}/v2.0`,
        audience: CLIENT_ID,
      });
      payload = verified;
    } catch (err) {
      logger.error({ error: err.message }, "ID Token inválido");
      return res.redirect(
        "http://localhost:5173?error=Token+de+identidad+inv%C3%A1lido"
      );
    }

    if (payload.nonce && payload.nonce !== stored.nonce) {
      logger.warn("Nonce inválido en callback");
      return res.redirect("http://localhost:5173?error=Nonce+inv%C3%A1lido");
    }

    if (payload.tid !== TENANT_ID) {
      logger.warn({ tid_recibido: payload.tid, tid_esperado: TENANT_ID }, "Tenant no autorizado");
      return res.redirect("http://localhost:5173?error=Tenant+no+autorizado");
    }

    setSessionCookie(res, payload);

    if (refresh_token) {
      res.cookie("refresh_token", encrypt(refresh_token), {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000,
      });
    }

    logger.info({ sub: payload.sub, email: payload.email || payload.preferred_username }, "Autenticación exitosa");
    res.redirect(stored.redirectTo);
  } catch (err) {
    const detail = err.response?.data?.error_description || err.response?.data?.error || err.message;
    logger.error({ error: detail }, "Error en callback");
    const msg = typeof detail === "string" ? detail : "Error al autenticar";
    res.redirect(`http://localhost:5173?error=${encodeURIComponent(msg)}`);
  }
});

app.get("/api/auth/me", async (req, res) => {
  const token = req.cookies?.session;

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    return res.json({ authenticated: true, user: payload });
  } catch {
    const user = await tryRefresh(req, res);
    if (user) {
      return res.json({ authenticated: true, user: { sub: user.sub, name: user.name, email: user.email || user.preferred_username, tid: user.tid } });
    }
    return res.json({ authenticated: false });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("session");
  res.clearCookie("refresh_token");
  logger.info("Sesión cerrada");
  res.json({ ok: true });
});

app.listen(PORT, () => {
  logger.info({ port: PORT, url: `http://localhost:${PORT}` }, "BFF iniciado");
});
