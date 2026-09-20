import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const required = [
      "VITE_API_BASE_URL",
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_APP_ID",
    ];
    const missing = required.filter((name) => !env[name] || env[name].startsWith("your-"));
    if (missing.length) {
      throw new Error(`Missing public build configuration: ${missing.join(", ")}. Set these variables before building or deploying.`);
    }
  }
  return { plugins: [react()] };
});
