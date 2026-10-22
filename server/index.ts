import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createProductsHandler } from "./http/productsHandler";
import { createProductNewsHandler } from "./http/productNewsHandler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.all("/api/products", createProductsHandler());
  app.all("/api/product-news", createProductNewsHandler());
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port =
    process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3001);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
