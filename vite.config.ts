import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        recorder: resolve(__dirname, "src/content/recorder.ts"),
        overlay: resolve(__dirname, "src/content/overlay.ts")
      },
      output: {
        entryFileNames: assetInfo => {
          const name = assetInfo.name?.split("/").slice(-1)[0].replace(/\.[tj]s$/, "");
          return `assets/${name}.js`;
        }
      }
    }
  }
});
