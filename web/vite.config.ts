import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

// The app is published inside the existing Pages site at /myfinancial/app/ and
// reads the SAME data the static pages are built from — one pipeline, one copy.
const BASE = "/myfinancial/app/";
const DATA_URL = "/myfinancial/data/";
const DATA_DIR = path.resolve(__dirname, "../dist/data");

/**
 * In production those JSON files sit one level above the app. In dev there is
 * no Pages server to provide them, so serve them straight off disk — the app
 * then develops against real generated data rather than a fixture that drifts.
 */
function serveBuiltData() {
  return {
    name: "serve-built-data",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url?.startsWith(DATA_URL)) return next();
        const file = path.join(DATA_DIR, req.url.slice(DATA_URL.length).split("?")[0]);
        if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) return next();
        res.setHeader("content-type", "application/json");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwind(), serveBuiltData()],
  resolve: {
    alias: {
      // The tax, goals and estate engines live one level up and are imported by
      // BOTH the Node server and this app. Aliasing rather than copying is the
      // whole point: a slab change edits one file, and every surface moves.
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    // dev-only: Vite refuses to serve outside its root without this, and the
    // shared engines are outside it by design.
    fs: { allow: [path.resolve(__dirname), path.resolve(__dirname, "..")] },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/app"),
    emptyOutDir: true,
    // The screener index is ~1.3 MB of JSON fetched at runtime; keeping the
    // bundle itself small is what makes the first paint feel instant.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["motion"],
        },
      },
    },
  },
});
