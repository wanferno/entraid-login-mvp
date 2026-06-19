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

const app = express();
const PORT = 3001;
const SESSION_SECRET = crypto.randomBytes(32).toString("hex");

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json());

const pkceStore = new Map();

function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const CLIENT_ID = process.env.VITE_CLIENT_ID;
const TENANT_ID = process.env.VITE_TENANT_ID;
const CLIENT_SECRET = process.env.VITE_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${PORT}/api/auth/callback`;
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET) {
  console.error("Faltan variables de entorno: VITE_CLIENT_ID, VITE_TENANT_ID, VITE_CLIENT_SECRET");
  process.exit(1);
}

app.get("/api/auth/login", (req, res) => {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  const state = crypto.randomUUID();

  pkceStore.set(state, {
    verifier,
    redirectTo: req.query.redirect || "http://localhost:5173",
  });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
  });

  res.redirect(`${AUTHORITY}/oauth2/v2.0/authorize?${params}`);
});

app.get("/api/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("Error de Microsoft:", error, req.query.error_description);
    return res.redirect(`http://localhost:5173?error=${encodeURIComponent("Autenticación cancelada")}`);
  }

  if (!code || !state) {
    return res.redirect("http://localhost:5173?error=Faltan+parámetros");
  }

  const stored = pkceStore.get(state);
  if (!stored) return res.redirect("http://localhost:5173?error=State+inválido");
  pkceStore.delete(state);

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

    const { id_token } = tokenRes.data;
    const payload = JSON.parse(
      Buffer.from(id_token.split(".")[1], "base64").toString()
    );

    const sessionToken = jwt.sign(
      {
        sub: payload.sub,
        name: payload.name,
        email: payload.email || payload.preferred_username,
        tid: payload.tid,
      },
      SESSION_SECRET,
      { expiresIn: "1h" }
    );

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000,
    });

    res.redirect(stored.redirectTo);
  } catch (err) {
    const detail = err.response?.data?.error_description || err.response?.data?.error || err.message;
    console.error("Error en callback:", detail);
    const msg = typeof detail === "string" ? detail : "Error al autenticar";
    res.redirect(`http://localhost:5173?error=${encodeURIComponent(msg)}`);
  }
});

app.get("/api/auth/me", (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.json({ authenticated: false });

  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    res.json({ authenticated: true, user: payload });
  } catch {
    res.json({ authenticated: false });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`BFF corriendo en http://localhost:${PORT}`);
});
