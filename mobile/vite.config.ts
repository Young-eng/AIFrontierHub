import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const reactRoot = path.resolve(root, "node_modules/react");
const reactDomRoot = path.resolve(root, "node_modules/react-dom");

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    alias: {
      "@": path.resolve(root, "../src"),
      react: reactRoot,
      "react-dom": reactDomRoot,
      "react/jsx-runtime": path.resolve(reactRoot, "jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(reactRoot, "jsx-dev-runtime.js"),
      "fs/promises": path.resolve(root, "src/shims/fs-promises.ts"),
      fs: path.resolve(root, "src/shims/fs.ts"),
      path: path.resolve(root, "src/shims/path.ts"),
      crypto: path.resolve(root, "src/shims/crypto.ts"),
      "next/link": path.resolve(root, "src/shims/next-link.tsx"),
      "next/navigation": path.resolve(root, "src/shims/next-navigation.ts"),
      "next/font/google": path.resolve(root, "src/shims/next-font.ts"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
