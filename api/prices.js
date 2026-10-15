/*
 * SILVER ZARIN FAKHR — api/prices.js
 *
 * مسیر فایل در GitHub:
 * api/prices.js
 *
 * منابع فقط همان سه آدرس درخواستی کاربر هستند.
 * نکته: منبع سوم صفحه «تتر» در ثروتمندی است؛ در خروجی و رابط سایت
 * نام آن «دلار» نمایش داده می‌شود، اما از نظر منبع داده، قیمت تتر است.
 */

const SOURCES = {
  silver999: "https://servatmandi.com/Entity/Summary/50000000001301",
  silverOunce: "https://servatmandi.com/Entity/Summary/10000000001903",
  dollar: "https://servatmandi.com/Entity/Summary/5000000000000"
};

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 30000;

function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function parseNumber(value) {
  if (value == null) return NaN;
  const s = normalizeDigits(value)
    .replace(/[\s\u00a0]/g, "")
    .replace(/[٬،]/g, ",")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractPrice(html, type) {
  const raw = decodeEntities(html);
  const text = normalizeDigits(
    raw.replace(/<[^>]*>/g, " ")
       .replace(/[\u200c\u200e\u200f]/g, " ")
       .replace(/\s+/g, " ")
  );

  // ابتدا مقادیر دارای کلیدهای متداول در داده‌های جاسازی‌شده را بررسی می‌کنیم.
  const keys = {
    silver999: [
      "Silver999LastPrice", "silver999LastPrice", "silver_999",
      "lastPrice", "LastPrice", "last_price"
    ],
    silverOunce: [
      "SilverOunceLastPrice", "silverOunceLastPrice", "silver_ounce",
      "lastPrice", "LastPrice", "last_price"
    ],
    dollar: [
      "TetherLastPrice", "tetherLastPrice", "USDTLastPrice",
      "lastPrice", "LastPrice", "last_price"
    ]
  }[type];

  const found = [];
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `["']?${escaped}["']?\\s*[:=]\\s*["']?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]*(?:\\.[0-9]+)?)`,
      "i"
    );
    const m = raw.match(re);
    if (m) {
      const n = parseNumber(m[1]);
      if (Number.isFinite(n)) found.push(n);
    }
  }

  // اگر مقدارها در متن قابل مشاهده صفحه موجود باشند، بر اساس عنوان صفحه
  // و برچسب‌های قیمت تلاش می‌کنیم؛ از حدس زدن قیمت بر اساس اعداد تصادفی پرهیز می‌شود.
  const labelRegexes = [
    /آخرین قیمت[\s\S]{0,160}?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]{3,})/i,
    /قیمت فعلی[\s\S]{0,160}?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]{3,})/i,
    /نرخ فعلی[\s\S]{0,160}?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]{3,})/i,
    /data-last-price=["']([0-9۰-۹٠-٩,٬،.]+)["']/i,
    /data-price=["']([0-9۰-۹٠-٩,٬،.]+)["']/i
  ];
  for (const re of labelRegexes) {
    const m = text.match(re) || raw.match(re);
    if (m) {
      const n = parseNumber(m[1]);
      if (Number.isFinite(n)) found.push(n);
    }
  }

  const valid = found.filter(n => {
    if (type === "silverOunce") return n >= 5 && n <= 10000;
    if (type === "silver999") return n >= 1000 && n < 100000000;
    return n >= 1000 && n < 100000000000;
  });

  return valid.length ? valid[0] : NaN;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SZFMarketPrices/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.7"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getPrice(type) {
  const url = SOURCES[type];
  const html = await fetchPage(url);
  const price = extractPrice(html, type);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${url}: قیمت از HTML اولیه قابل استخراج نبود؛ احتمالاً سایت مقدار را با JavaScript بارگذاری می‌کند.`);
  }
  return price;
}

function noCache(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (origin) {
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
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  noCache(res);

  const cache = globalThis.__SZF_SERVATMANDI_CACHE__ ||
    (globalThis.__SZF_SERVATMANDI_CACHE__ = { data: null, timestamp: 0 });

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  const types = ["silver999", "silverOunce", "dollar"];
  const settled = await Promise.allSettled(types.map(getPrice));
  const errors = [];
  const values = {};

  settled.forEach((result, i) => {
    const type = types[i];
    if (result.status === "fulfilled") values[type] = result.value;
    else {
      values[type] = null;
      errors.push(`${type}: ${result.reason?.message || "دریافت قیمت ناموفق بود"}`);
    }
  });

  const validCount = Object.values(values).filter(v => Number.isFinite(v) && v > 0).length;
  if (validCount === 0) {
    return res.status(503).json({
      success: false,
      message: "هیچ قیمت قابل‌اعتمادی از HTML اولیه سه صفحه دریافت نشد؛ قیمت ساختگی نمایش داده نمی‌شود.",
      errors,
      sources: SOURCES,
      serverTime: new Date().toISOString()
    });
  }

  const now = new Date().toISOString();
  const result = {
    success: true,
    silverOunce: values.silverOunce,
    silver999Rial: values.silver999,
    silver999Toman: Number.isFinite(values.silver999) ? values.silver999 / 10 : null,

    // برچسب نمایشی سایت «دلار» است؛ منبع داده این فیلد صفحه تتر است.
    usdRial: values.dollar,
    usdToman: Number.isFinite(values.dollar) ? values.dollar / 10 : null,

    // برای سازگاری با نسخه‌های قدیمی فرانت‌اند نگه داشته شده است.
    usdtToman: Number.isFinite(values.dollar) ? values.dollar / 10 : null,

    updatedAt: now,
    serverTime: now,
    partial: validCount !== 3,
    errors,
    sources: SOURCES,
    cached: false
  };

  if (!result.partial) {
    cache.data = result;
    cache.timestamp = Date.now();
  }

  return res.status(200).json(result);
    }
