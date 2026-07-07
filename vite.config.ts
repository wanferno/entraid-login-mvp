import { defineConfig } from "vite";
import { readFileSync } from "fs";

const httpsEnabled = process.env.HTTPS === "true";

export default defineConfig({
  server: {
    port: 5173,
    https: httpsEnabled
      ? {
          key: readFileSync("certs/key.pem"),
          cert: readFileSync("certs/cert.pem"),
        }
      : undefined,
  },
});
