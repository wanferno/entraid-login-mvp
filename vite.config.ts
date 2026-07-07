import { defineConfig } from "vite";
import { readFileSync } from "fs";

const httpsEnabled = process.env.HTTPS === "true";
const frontendPort = parseInt(process.env.FRONTEND_PORT || "5173", 10);

export default defineConfig({
  server: {
    port: frontendPort,
    https: httpsEnabled
      ? {
          key: readFileSync("certs/key.pem"),
          cert: readFileSync("certs/cert.pem"),
        }
      : undefined,
  },
});
