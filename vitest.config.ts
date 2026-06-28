import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["console/**", "node_modules/**", "dist/**", "go-sdk/**", "rust-sdk/**", "java-sdk/**", "python-sdk/**"],
  },
});
