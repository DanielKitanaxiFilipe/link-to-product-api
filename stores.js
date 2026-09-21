// label = parte do domínio que identifica a loja (funciona com .com, .pt, .co.uk, etc.)
const STORES = [
  { key: "aliexpress",   label: "aliexpress",   name: "AliExpress",   category: "Eletrónica, acessórios, roupa, ferramentas" },
  { key: "alibaba",      label: "alibaba",      name: "Alibaba",      category: "Compras em quantidade / negócios" },
  { key: "shein",        label: "shein",        name: "SHEIN",        category: "Roupa, moda, acessórios" },
  { key: "temu",         label: "temu",         name: "Temu",         category: "Produtos baratos, casa, eletrónica, acessórios" },
  { key: "ebay",         label: "ebay",         name: "eBay",         category: "Eletrónica, roupa, peças, produtos diversos" },
  { key: "amazon",       label: "amazon",       name: "Amazon",       category: "Eletrónica, livros, casa, tecnologia", extra: ["amzn", "a.co"] },
  { key: "zara",         label: "zara",         name: "Zara",         category: "Roupa e moda" },
  { key: "hm",           label: "hm",           name: "H&M",          category: "Roupa e acessórios" },
  { key: "nike",         label: "nike",         name: "Nike",         category: "Ténis e roupa" },
  { key: "adidas",       label: "adidas",       name: "Adidas",       category: "Ténis e roupa" },
  { key: "asos",         label: "asos",         name: "ASOS",         category: "Moda" },
  { key: "boohoo",       label: "boohoo",       name: "Boohoo",       category: "Roupa" },
  { key: "fashionnova",  label: "fashionnova",  name: "Fashion Nova", category: "Moda" },
  { key: "pullandbear",  label: "pullandbear",  name: "Pull&Bear",    category: "Roupa" },
  { key: "bershka",      label: "bershka",      name: "Bershka",      category: "Roupa" },
  { key: "stradivarius", label: "stradivarius", name: "Stradivarius", category: "Roupa" },
  { key: "mango",        label: "mango",        name: "Mango",        category: "Roupa" },
  { key: "decathlon",    label: "decathlon",    name: "Decathlon",    category: "Desporto" },
  { key: "ikea",         label: "ikea",         name: "IKEA",         category: "Casa e mobiliário" },
  { key: "etsy",         label: "etsy",         name: "Etsy",         category: "Artesanato, presentes e produtos personalizados" },
  { key: "walmart",      label: "walmart",      name: "Walmart",      category: "Produtos variados" },
  { key: "bestbuy",      label: "bestbuy",      name: "Best Buy",     category: "Eletrónica" },
  { key: "newegg",       label: "newegg",       name: "Newegg",       category: "Computadores e eletrónica" },
  { key: "stockx",       label: "stockx",       name: "StockX",       category: "Ténis e streetwear" },
  { key: "footlocker",   label: "footlocker",   name: "Foot Locker",  category: "Ténis e roupa" },
];

function detectStore(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  return (
    STORES.find(
      (s) => parts.includes(s.label) || (s.extra || []).some((e) => host.includes(e))
    ) || null
  );
}

module.exports = { STORES, detectStore };
