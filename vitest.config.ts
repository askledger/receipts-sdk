import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["console/**", "node_modules/**", "dist/**", "go-sdk/**", "rust-sdk/**", "java-sdk/**", "python-sdk/**"],
    setupFiles: ["./test/vitest.setup.ts"],
    // Several tests generate large volumes of receipts/signatures (scan-scaling,
    // exact-aggregation, chain-concurrency). Under full-suite parallelism they can
    // exceed vitest's default 5s and fail flakily on loaded CI. 20s is generous
    // enough to be reliable while still catching a genuinely hung test.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
