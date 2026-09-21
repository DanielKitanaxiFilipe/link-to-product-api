const cheerio = require("cheerio");
const { detectStore } = require("./stores");

/* ------------------------------------------------------------------ */
/* 1. BUSCAR O HTML                                                    */
/* ------------------------------------------------------------------ */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,pt;q=0.8",
};

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text(), finalUrl: res.url || url };
}

// Serviço externo anti-bot (opcional): https://www.scraperapi.com
async function fetchScraperApi(url) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) throw new Error("SCRAPER_API_KEY não definida");
  const api = `https://api.scraperapi.com/?api_key=${key}&render=true&url=${encodeURIComponent(url)}`;
  const res = await fetch(api, { signal: AbortSignal.timeout(70000) });
  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status}`);
  return { html: await res.text(), finalUrl: url };
}

// Navegador headless (opcional): npm i puppeteer  +  USE_BROWSER=true
async function fetchBrowser(url) {
  if (process.env.USE_BROWSER !== "true") throw new Error("USE_BROWSER desligado");
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(HEADERS["User-Agent"]);
    await page.setExtraHTTPHeaders({ "Accept-Language": HEADERS["Accept-Language"] });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    return { html: await page.content(), finalUrl: page.url() };
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ */
/* 2. UTILITÁRIOS                                                      */
/* ------------------------------------------------------------------ */

const clean = (s) => (s == null ? "" : String(s).replace(/\s+/g, " ").trim());

const SYMBOLS = { "$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "R$": "BRL", "¥": "CNY", "Kz": "AOA" };

function parsePrice(raw) {
  if (raw == null || raw === "") return { value: null, currency: null };
  if (typeof raw === "number") return { value: raw, currency: null };
  const str = String(raw);
  let currency = null;
  for (const [sym, code] of Object.entries(SYMBOLS)) if (str.includes(sym)) { currency = code; break; }
  const m = str.match(/\d[\d.,\s]*/);
  if (!m) return { value: null, currency };
  let n = m[0].replace(/\s/g, "");
  const lastDot = n.lastIndexOf("."), lastComma = n.lastIndexOf(",");
  if (lastDot > -1 && lastComma > -1) {
    // o último separador é o decimal
    n = lastComma > lastDot ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
  } else if (lastComma > -1) {
    n = /,\d{1,2}$/.test(n) ? n.replace(",", ".") : n.replace(/,/g, "");
  }
  const value = parseFloat(n);
  return { value: Number.isFinite(value) ? value : null, currency };
}

const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const abs = (u, base) => { try { return u ? new URL(u, base).href : null; } catch { return null; } };
const unique = (arr) => [...new Set(arr.filter(Boolean))];

/* ------------------------------------------------------------------ */
/* 3. EXTRAÇÃO (JSON-LD → Open Graph → seletores da loja)              */
/* ------------------------------------------------------------------ */

function readJsonLd($) {
  const found = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const walk = (n) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        const types = toArray(n["@type"]).map(String);
        if (types.some((t) => /^(Product|ProductGroup|IndividualProduct)$/i.test(t))) found.push(n);
        if (n["@graph"]) walk(n["@graph"]);
      };
      walk(data);
    } catch { /* JSON inválido, ignora */ }
  });
  return found[0] || null;
}

function fromJsonLd(p, base) {
  if (!p) return {};
  const offers = toArray(p.offers).flatMap((o) => (o && o.offers ? toArray(o.offers) : [o])).filter(Boolean);
  const offer = offers[0] || {};
  const price = parsePrice(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price);
  const brand = typeof p.brand === "object" ? p.brand?.name : p.brand;
  const images = toArray(p.image).map((i) => abs(typeof i === "object" ? i.url : i, base));
  // variantes (ProductGroup / vários offers)
  const variantColors = toArray(p.hasVariant).map((v) => v?.color);
  return {
    name: clean(p.name),
    description: clean(p.description),
    brand: clean(brand),
    sku: clean(p.sku || p.mpn || p.gtin13 || ""),
    images,
    price: price.value,
    currency: offer.priceCurrency || price.currency || null,
    availability: clean(String(offer.availability || "").split("/").pop()),
    color: clean(toArray(p.color).join(", ")),
    colors: unique([...toArray(p.color), ...variantColors].map(clean)),
    sizes: unique(toArray(p.size).map(clean)),
  };
}

function fromMeta($, base) {
  const meta = (n) => $(`meta[property="${n}"], meta[name="${n}"]`).attr("content");
  const price = parsePrice(
    meta("product:price:amount") || meta("og:price:amount") || meta("twitter:data1")
  );
  return {
    name: clean(meta("og:title") || meta("twitter:title") || $("title").first().text()),
    description: clean(meta("og:description") || meta("description")),
    images: unique([abs(meta("og:image") || meta("twitter:image"), base)]),
    price: price.value,
    currency: meta("product:price:currency") || meta("og:price:currency") || price.currency || null,
    brand: clean(meta("product:brand") || meta("og:brand")),
  };
}

// Seletores específicos por loja (quando o JSON-LD não vem completo)
const SELECTORS = {
  amazon: {
    name: "#productTitle",
    price: ["#corePrice_feature_div .a-offscreen", ".a-price .a-offscreen", "#priceblock_ourprice"],
    image: ["#landingImage@data-old-hires", "#landingImage@src", "#imgBlkFront@src"],
    description: ["#feature-bullets", "#productDescription"],
    color: ["#variation_color_name .selection", "#inline-twister-expanded-dimension-text-color_name"],
    sizes: ["#native_dropdown_selected_size_name option", "#variation_size_name .a-dropdown-prompt"],
    brand: ["#bylineInfo"],
  },
  ebay: {
    name: "h1.x-item-title__mainTitle, h1[data-testid='x-item-title'] span",
    price: [".x-price-primary span", "[itemprop='price']@content"],
    image: [".ux-image-carousel-item img@src", ".ux-image-magnify__container img@src"],
    description: [".x-about-this-item"],
  },
  aliexpress: {
    name: "h1[data-pl='product-title'], h1",
    price: [".price--currentPriceText--V8_y_b5", "[class*='currentPrice']"],
  },
  walmart: { name: "h1[itemprop='name']", price: ["[itemprop='price']"] },
  bestbuy: { name: ".sku-title h1", price: [".priceView-customer-price span"] },
  newegg: { name: "h1.product-title", price: [".price-current"] },
  etsy: { name: "h1[data-buy-box-listing-title]", price: ["[data-buy-box-region='price'] .wt-text-title-larger"] },
  ikea: { name: "h1", price: [".pip-temp-price__integer", ".pip-price__integer"] },
  nike: { name: "#pdp_product_title, h1", price: ["#price-container", "[data-testid='currentPrice-container']"] },
  zara: { name: "h1", price: [".money-amount__main", ".price__amount-current", ".price__amount", ".price-current__amount"] },
};

function pick($, list) {
  for (const sel of toArray(list)) {
    const [css, attr] = sel.split("@");
    const el = $(css).first();
    if (!el.length) continue;
    const v = attr ? el.attr(attr) : el.text();
    if (clean(v)) return clean(v);
  }
  return "";
}

function fromSelectors($, storeKey, base) {
  const s = SELECTORS[storeKey];
  if (!s) return {};
  const price = parsePrice(pick($, s.price));
  const sizes = s.sizes
    ? unique($(toArray(s.sizes)[0].split("@")[0]).map((_, e) => clean($(e).text())).get())
    : [];
  return {
    name: pick($, s.name),
    price: price.value,
    currency: price.currency,
    images: unique([abs(pick($, s.image), base)]),
    description: pick($, s.description),
    color: pick($, s.color),
    sizes: sizes.filter((x) => x && !/select|escolh/i.test(x)),
    brand: pick($, s.brand).replace(/^(Visit the|Brand:|Marca:)\s*/i, "").replace(/\s*Store$/i, ""),
  };
}

// junta as fontes: a primeira com valor ganha
function merge(...sources) {
  const out = {};
  for (const src of sources) {
    for (const [k, v] of Object.entries(src || {})) {
      const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) continue;
      if (Array.isArray(v)) out[k] = unique([...(out[k] || []), ...v]);
      else if (out[k] == null || out[k] === "") out[k] = v;
    }
  }
  return out;
}

function extract(html, url, store) {
  const $ = cheerio.load(html);
  const ld = fromJsonLd(readJsonLd($), url);
  const sel = fromSelectors($, store?.key, url);
  const meta = fromMeta($, url);
  return merge(ld, sel, meta);
}

/* ------------------------------------------------------------------ */
/* 4. CONVERSÃO PARA KWANZAS (taxas configuráveis no .env)             */
/* ------------------------------------------------------------------ */

function toAoa(value, currency) {
  if (value == null) return null;
  const cur = (currency || process.env.DEFAULT_CURRENCY || "USD").toUpperCase();
  if (cur === "AOA") return Math.round(value);
  const rate = parseFloat(process.env[`RATE_${cur}_AOA`] || { USD: 912, EUR: 1000, GBP: 1170 }[cur]);
  return rate ? Math.round(value * rate) : null;
}

/* ------------------------------------------------------------------ */
/* 5. FUNÇÃO PRINCIPAL                                                 */
/* ------------------------------------------------------------------ */

const complete = (d) => d.name && d.price != null && d.images?.length;

async function getProduct(inputUrl) {
  const parsed = new URL(inputUrl);
  const store = detectStore(parsed.hostname);

  const strategies = [fetchDirect];
  if (process.env.SCRAPER_API_KEY) strategies.push(fetchScraperApi);
  if (process.env.USE_BROWSER === "true") strategies.push(fetchBrowser);

  let best = null;
  let lastErr = null;
  let finalUrl = inputUrl;

  for (const strat of strategies) {
    try {
      const r = await strat(inputUrl);
      const data = extract(r.html, r.finalUrl, detectStore(new URL(r.finalUrl).hostname) || store);
      if (!best || Object.keys(data).length > Object.keys(best).length) { best = data; finalUrl = r.finalUrl; }
      if (complete(data)) break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!best || !best.name) {
    const err = new Error(
      `Não foi possível ler o produto (${lastErr?.message || "página sem dados"}). ` +
        "A loja pode estar a bloquear o acesso — ative SCRAPER_API_KEY ou USE_BROWSER no .env."
    );
    err.status = 422;
    throw err;
  }

  const images = best.images || [];
  const currency = best.currency || process.env.DEFAULT_CURRENCY || "USD";

  return {
    productLink: finalUrl,
    productName: best.name,
    storeName: store?.name || parsed.hostname.replace(/^www\./, ""),
    storeCategory: store?.category || null,
    brand: best.brand || null,
    sku: best.sku || null,
    description: best.description || null,
    image: images[0] || null,
    images,
    price: best.price ?? null,
    currency,
    priceAoa: toAoa(best.price, currency),
    color: best.color || null,
    colors: best.colors || [],
    sizes: best.sizes || [],
    variants: [best.color, ...(best.sizes || [])].filter(Boolean).join(" / ") || "",
    availability: best.availability || null,
    quantity: 1,
    complete: Boolean(complete(best)),
  };
}

module.exports = { getProduct };
