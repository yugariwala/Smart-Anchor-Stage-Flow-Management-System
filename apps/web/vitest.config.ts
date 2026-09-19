import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    restoreMocks: true,
    clearMocks: true,
  },
});
