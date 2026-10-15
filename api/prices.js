export default async function handler(req, res) {
  const SOURCES = {
    silverOunce: "https://servatmandi.com/Entity/Summary/10000000001903",
    silver999: "https://servatmandi.com/Entity/Summary/50000000001301",
    usd: "https://servatmandi.com/Entity/Summary/5000000000000"
  };

  const origin = req.headers.origin || "";
  try {
    const u = new URL(origin), h = u.hostname.toLowerCase();
    if (h.endsWith(".github.io") || h === "zarinfakhr-market-v2.vercel.app" || h === "localhost" || h === "127.0.0.1") {
      res.setHeader("Access-Control-Allow-Origin", u.origin);
      res.setHeader("Vary", "Origin");
    }
  } catch (_) {}
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  function digits(s) {
    return String(s).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  }
  function textFromHtml(html) {
    return digits(String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
      .replace(/&#39;|&#x27;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/[\u200c\u200e\u200f]/g, " ").replace(/\s+/g, " ").trim());
  }
  function number(raw) {
    const s = digits(raw).replace(/[٬،,\s]/g, "");
    return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
  }
  function extract(html, name) {
    const t = textFromHtml(html);
    // Strictly parse the value adjacent to "آخرین قیمت". No generic fallback.
    const m = t.match(/آخرین\s*قیمت\s*[|:：\-–—]?\s*([0-9][0-9,٬،]*(?:\.[0-9]+)?)/i);
    if (!m) throw new Error(name + ": ردیف «آخرین قیمت» پیدا نشد");
    const n = number(m[1]);
    if (!Number.isFinite(n) || n <= 0) throw new Error(name + ": مقدار قیمت نامعتبر است");
    return n;
  }
  async function fetchPrice(url, name) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7"
        }, signal: controller.signal, cache: "no-store"
      });
      if (!r.ok) throw new Error(name + ": HTTP " + r.status);
      const html = await r.text();
      if (!html || html.length < 100) throw new Error(name + ": پاسخ خالی");
      return extract(html, name);
    } finally { clearTimeout(timer); }
  }

  const keys = ["silverOunce", "silver999", "usd"];
  const urls = [SOURCES.silverOunce, SOURCES.silver999, SOURCES.usd];
  const results = await Promise.allSettled(urls.map((u, i) => fetchPrice(u, keys[i])));
  const v = {}, errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") v[keys[i]] = r.value;
    else errors.push(r.reason?.message || keys[i] + ": خطای دریافت");
  });

  // Sanity bands prevent the known bad value 1900 being treated as live price.
  const ok = {
    silverOunce: Number.isFinite(v.silverOunce) && v.silverOunce >= 10 && v.silverOunce <= 500,
    silver999: Number.isFinite(v.silver999) && v.silver999 >= 100000 && v.silver999 <= 100000000,
    usd: Number.isFinite(v.usd) && v.usd >= 10000 && v.usd <= 10000000
  };
  Object.keys(ok).forEach(k => { if (!ok[k]) errors.push(k + ": قیمت استخراج‌شده خارج از محدوده معتبر است"); });

  if (!ok.silverOunce || !ok.silver999 || !ok.usd) {
    return res.status(503).json({
      success: false, partial: true,
      error: "قیمت معتبر از همه منابع دریافت نشد؛ قیمت اشتباه منتشر نشود",
      details: errors,
      extractedForDebug: { silverOunce: v.silverOunce ?? null, silver999Rial: v.silver999 ?? null, usdRial: v.usd ?? null },
      sources: SOURCES, serverTime: new Date().toISOString()
    });
  }

  const now = new Date().toISOString();
  return res.status(200).json({
    success: true,
    silverOunce: v.silverOunce,
    silver999Rial: v.silver999,
    silver999Toman: v.silver999 / 10,
    usdRial: v.usd,
    usdToman: v.usd / 10,
    usdtToman: v.usd / 10,
    updatedAt: now, serverTime: now, partial: false, errors: [],
    sources: { silver999: SOURCES.silver999, silverOunce: SOURCES.silverOunce, dollar: SOURCES.usd },
    cached: false
  });
                             }
