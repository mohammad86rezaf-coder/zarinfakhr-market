export default async function handler(req, res) {
  const SOURCES = {
    silverOunce: "https://servatmandi.com/Entity/Summary/10000000001903",
    silver999: "https://servatmandi.com/Entity/Summary/50000000001301",
    // Source is Tether (USDT); the frontend label should display "دلار".
    usd: "https://servatmandi.com/Entity/Summary/5000000000000"
  };

  // CORS
  const origin = req.headers.origin || "";
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (
      host.endsWith(".github.io") ||
      host === "zarinfakhr-market-v2.vercel.app" ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
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
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed"
    });
  }

  function normalizeDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, d => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)])
      .replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
  }

  function htmlToText(html) {
    return normalizeDigits(
      String(html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#x27;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/[\u200c\u200e\u200f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  function parseNumber(raw) {
    const cleaned = normalizeDigits(raw).replace(/[٬،,\s]/g, "");
    return /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
  }

  function extractPrice(html, key) {
    const text = htmlToText(html);

    // Only extract a number directly following the "آخرین قیمت" label.
    // Do not fall back to arbitrary numbers elsewhere on the page.
    const patterns = [
      /آخرین\s*قیمت\s*[|:：\-–—]?\s*([0-9][0-9,٬،]*(?:\.[0-9]+)?)/i,
      /آخرین\s*قیمت\s*([0-9][0-9,٬،]*(?:\.[0-9]+)?)/i
    ];

    let price = NaN;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        price = parseNumber(match[1]);
        if (Number.isFinite(price) && price > 0) break;
      }
    }

    if (!Number.isFinite(price) || price <= 0) {
      // Diagnostic text helps identify what Vercel actually receives.
      const index = text.indexOf("آخرین");
      const snippet = index >= 0
        ? text.slice(Math.max(0, index - 100), index + 300)
        : text.slice(0, 500);

      throw new Error(
        key + ": ردیف قیمت در پاسخ پیدا نشد. متن دریافتی: " + snippet
      );
    }

    // Source values: ounce in USD, silver and Tether in rials.
    const ranges = {
      silverOunce: [10, 500],
      silver999: [100000, 100000000],
      usd: [10000, 10000000]
    };

    const range = ranges[key];
    if (!range || price < range[0] || price > range[1]) {
      throw new Error(
        key + ": قیمت خارج از محدوده معتبر است: " + price
      );
    }

    return price;
  }

  async function fetchPrice(url, key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(key + ": HTTP " + response.status);
      }

      const html = await response.text();
      if (!html || html.length < 100) {
        throw new Error(key + ": پاسخ خالی یا ناقص");
      }

      return extractPrice(html, key);
    } finally {
      clearTimeout(timer);
    }
  }

  const keys = ["silverOunce", "silver999", "usd"];
  const urls = [
    SOURCES.silverOunce,
    SOURCES.silver999,
    SOURCES.usd
  ];

  const results = await Promise.allSettled(
    urls.map((url, index) => fetchPrice(url, keys[index]))
  );

  const values = {};
  const errors = [];

  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === "fulfilled") {
      values[key] = result.value;
    } else {
      errors.push(
        result.reason && result.reason.message
          ? result.reason.message
          : key + ": خطای دریافت قیمت"
      );
    }
  });

  const valid = {
    silverOunce: Number.isFinite(values.silverOunce),
    silver999: Number.isFinite(values.silver999),
    usd: Number.isFinite(values.usd)
  };

  if (!valid.silverOunce || !valid.silver999 || !valid.usd) {
    return res.status(503).json({
      success: false,
      partial: true,
      error: "قیمت معتبر از همه منابع دریافت نشد؛ قیمت اشتباه منتشر نشود",
      details: errors,
      extractedForDebug: {
        silverOunce: values.silverOunce ?? null,
        silver999Rial: values.silver999 ?? null,
        usdRial: values.usd ?? null
      },
      sources: SOURCES,
      serverTime: new Date().toISOString()
    });
  }

  const now = new Date().toISOString();

  return res.status(200).json({
    success: true,
    silverOunce: values.silverOunce,
    silver999Rial: values.silver999,
    silver999Toman: values.silver999 / 10,
    usdRial: values.usd,
    usdToman: values.usd / 10,
    usdtToman: values.usd / 10,
    updatedAt: now,
    serverTime: now,
    partial: false,
    errors: [],
    sources: {
      silver999: SOURCES.silver999,
      silverOunce: SOURCES.silverOunce,
      dollar: SOURCES.usd
    },
    cached: false
  });
}
