import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  splitting: false,
  external: ["@elizaos/core"],
  clean: true,
});
