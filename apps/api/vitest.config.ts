import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: false,
    setupFiles: ["./src/testSetup.ts"],
  },
});
