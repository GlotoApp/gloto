import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import manifestHandler from "./api/manifest.js";

const appManifestPlugin = {
  name: "app-manifest",
  configureServer(server) {
    server.middlewares.use("/api/manifest", (req, res, next) => {
      if (req.method !== "GET") return next();

      const requestUrl = new URL(req.url || "/", "http://localhost");
      const mockResponse = {
        setHeader: (...args) => res.setHeader(...args),
        status(statusCode) {
          res.statusCode = statusCode;
          return this;
        },
        json(body) {
          res.end(JSON.stringify(body));
        },
      };

      manifestHandler(
        { query: { start_url: requestUrl.searchParams.get("start_url") } },
        mockResponse,
      );
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appManifestPlugin],
  resolve: {
    // Esto obliga a Vite a usar una sola copia de React y React-DOM
    // Evita el error de "Invalid Hook Call" y conflictos de useContext
    dedupe: ["react", "react-dom"],
  },
  // Opcional: Asegura que los módulos en carpetas personalizadas se procesen bien
  optimizeDeps: {
    include: ["framer-motion", "lucide-react"],
  },
});
