import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js",
          dest: "",
        },
        {
          src: "node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm",
          dest: "",
        },
      ],
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
