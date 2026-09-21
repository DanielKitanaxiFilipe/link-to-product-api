require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { STORES, detectStore } = require("./stores");
const { getProduct } = require("./scraper");

const app = express();
app.use(cors());
app.use(express.json());

// cache simples em memória (30 min)
const cache = new Map();
const TTL = 30 * 60 * 1000;

function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return { error: "Link inválido." }; }
  if (!["http:", "https:"].includes(u.protocol)) return { error: "Só links http/https." };

  // bloqueia endereços internos (SSRF)
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(u.hostname))
    return { error: "Endereço não permitido." };

  if (process.env.ALLOW_ANY_STORE !== "true" && !detectStore(u.hostname))
    return { error: "Loja não suportada. Veja GET /api/stores." };

  return { url: u.href };
}

async function handle(req, res) {
  const raw = (req.method === "POST" ? req.body?.url : req.query.url) || "";
  const v = validateUrl(String(raw).trim());
  if (v.error) return res.status(400).json({ success: false, error: v.error });

  const hit = cache.get(v.url);
  if (hit && Date.now() - hit.t < TTL) return res.json({ success: true, cached: true, product: hit.data });

  try {
    const product = await getProduct(v.url);
    cache.set(v.url, { t: Date.now(), data: product });
    res.json({ success: true, product });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
}

app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/api/stores", (_, res) =>
  res.json(STORES.map(({ name, category }) => ({ name, category })))
);
app.get("/api/product", handle);   // /api/product?url=https://...
app.post("/api/product", handle);  // { "url": "https://..." }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API a correr em http://localhost:${PORT}`));
