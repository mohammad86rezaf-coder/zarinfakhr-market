/*
 * SILVER ZARIN FAKHR — api/prices.js
 * فایل را در مخزن GitHub در مسیر api/prices.js قرار دهید و در Vercel Deploy کنید.
 *
 * نکته مهم:
 * - برچسب رابط کاربری برای نرخ ارز «دلار» است.
 * - نرخ دلار از صفحه دلار آزاد TGJU خوانده می‌شود، نه از صفحه تتر.
 * - برای قیمت نقره، ابتدا منبع قبلی و سپس صفحه عمومی TGJU امتحان می‌شود.
 * - اگر ساختار سایت منبع تغییر کند یا دسترسی مسدود باشد، API خطا می‌دهد؛ قیمت ساختگی تولید نمی‌کند.
 */

const SOURCES = {
  silverOunce: [
    "https://servatmandi.com/Entity/Summary/10000000001903",
    "https://www.tgju.org/profile/silver_ounce"
  ],
  silver999: [
    "https://servatmandi.com/Entity/Summary/50000000001301",
    "https://www.tgju.org/profile/silver_999"
  ],
  dollar: [
    "https://www.tgju.org/profile/price_dollar_rl"
  ]
};

const TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 30000;

function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const normalized = normalizeDigits(value)
    .replace(/[\s\u00a0]/g, "")
    .replace(/[٬،]/g, ",")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  if (!normalized) return NaN;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanHtml(html) {
  return normalizeDigits(decodeEntities(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u200c\u200e\u200f]/g, " ")
    .replace(/\s+/g, " ")));
}

function candidatesFromHtml(html, type) {
  const raw = String(html || "");
  const text = cleanHtml(raw);
  const found = [];

  // داده‌های ساختاریافته/متغیرهای داخل HTML، فقط با کلیدهای مشخص.
  const keyMap = {
    silverOunce: [
      "SilverOunceLastPrice", "silverOunceLastPrice",
      "silver_ounce", "silverOunce", "lastPrice"
    ],
    silver999: [
      "Silver999LastPrice", "silver999LastPrice",
      "silver_999", "silver999", "lastPrice"
    ],
    dollar: [
      "DollarLastPrice", "dollarLastPrice",
      "price_dollar_rl", "dollar", "lastPrice"
    ]
  };

  for (const key of keyMap[type] || []) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`["']${escaped}["']\\s*:\\s*["']?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]*(?:\\.[0-9]+)?)`, "i"),
      new RegExp(`\\b${escaped}\\b\\s*[:=]\\s*["']?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]*(?:\\.[0-9]+)?)`, "i")
    ];
    for (const pattern of patterns) {
      const m = raw.match(pattern);
      if (m) {
        const n = parseNumber(m[1]);
        if (Number.isFinite(n)) found.push(n);
      }
    }
  }

  // TGJU معمولاً نرخ را در data-col یا بخش «نرخ فعلی» نشان می‌دهد.
  // از اعداد کوچک (تغییر درصد/زمان/شناسه) استفاده نمی‌شود.
  const labelPatterns = [
    /نرخ فعلی\s*[:：]?\s*([0-9][0-9,٬،]{3,})/i,
    /آخرین قیمت\s*[:：]?\s*([0-9][0-9,٬،]{3,})/i,
    /data-col=["']last["'][^>]*>\s*([0-9,٬،]+)/i,
    /id=["']last["'][^>]*>\s*([0-9,٬،]+)/i
  ];
  for (const pattern of labelPatterns) {
    const m = text.match(pattern) || raw.match(pattern);
    if (m) {
      const n = parseNumber(m[1]);
      if (Number.isFinite(n)) found.push(n);
    }
  }

  // استخراج از شناسه رایج TGJU؛ فقط وقتی مقدار واضح در همان المان موجود است.
  const tgjuPatterns = [
    /id=["']last["'][\s\S]{0,180}?>([\s\S]{1,80}?)</i,
    /class=["'][^"']*value[^"']*["'][\s\S]{0,100}?>([\s\S]{1,80}?)</i
  ];
  for (const pattern of tgjuPatterns) {
    const m = raw.match(pattern);
    if (m) {
      const n = parseNumber(cleanHtml(m[1]));
      if (Number.isFinite(n)) found.push(n);
    }
  }

  // قیمت‌های بازار ایران معمولاً بزرگ هستند؛ برای انس دلاری، بازه‌ی مستقل دارد.
  const filtered = found.filter(n => {
    if (type === "silverOunce") return n >= 5 && n <= 10000;
    return n >= 1000 && n < 100000000000;
  });

  // برای کلیدهای صریح، اولین مقدار معتبر؛ برای متن صفحه نیز مقدار اولِ برچسب‌دار.
  return filtered.length ? filtered[0] : NaN;
}

async function fetchText(url) {
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
  const errors = [];
  for (const url of SOURCES[type]) {
    try {
      const body = await fetchText(url);
      const price = candidatesFromHtml(body, type);
      if (Number.isFinite(price) && price > 0) {
        return { price, source: url };
      }
      errors.push(`${url}: قیمت قابل تشخیص نبود`);
    } catch (e) {
      errors.push(`${url}: ${e?.message || "خطای دریافت"}`);
    }
  }
  throw new Error(errors.join(" | "));
}

function setNoCacheHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (origin) {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname.toLowerCase();
      if (
        host.endsWith(".github.io") ||
        host === "zarinfakhr-market-v2.vercel.app" ||
        host === "localhost" ||
        host === "127.0.0.1"
      ) {
        res.setHeader("Access-Control-Allow-Origin", parsed.origin);
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

  setNoCacheHeaders(res);

  const cache = globalThis.__SZF_PRICE_CACHE_V2__ ||
    (globalThis.__SZF_PRICE_CACHE_V2__ = { data: null, timestamp: 0 });

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  const types = ["silverOunce", "silver999", "dollar"];
  const settled = await Promise.allSettled(types.map(getPrice));
  const errors = [];
  const values = {};

  settled.forEach((item, i) => {
    const type = types[i];
    if (item.status === "fulfilled") {
      values[type] = item.value.price;
    } else {
      values[type] = null;
      errors.push(`${type}: ${item.reason?.message || "منبع در دسترس نیست"}`);
    }
  });

  // اگر همه منابع موقتاً قطع شدند، آخرین داده موفق را فقط با برچسب stale برمی‌گردانیم.
  const validCount = Object.values(values).filter(v => Number.isFinite(v) && v > 0).length;
  if (validCount === 0) {
    if (cache.data) {
      return res.status(200).json({
        ...cache.data,
        cached: true,
        stale: true,
        warning: "منابع زنده در دسترس نیستند؛ آخرین داده ذخیره‌شده نمایش داده می‌شود.",
        errors
      });
    }
    return res.status(503).json({
      success: false,
      error: "دریافت قیمت زنده ممکن نشد",
      message: "منبع‌ها پاسخ قابل تشخیص ندادند؛ هیچ قیمت ساختگی نمایش داده نشد.",
      details: errors,
      serverTime: new Date().toISOString()
    });
  }

  const now = new Date().toISOString();
  const result = {
    success: true,
    silverOunce: values.silverOunce,
    silver999Rial: values.silver999,
    silver999Toman: Number.isFinite(values.silver999) ? values.silver999 / 10 : null,
    // دلار آزاد، نه تتر؛ منبع صفحه دلار آزاد است.
    usdRial: values.dollar,
    usdToman: Number.isFinite(values.dollar) ? values.dollar / 10 : null,
    // سازگاری با نسخه قبلی فرانت‌اند؛ مقدار همان نرخ دلار است.
    usdtToman: Number.isFinite(values.dollar) ? values.dollar / 10 : null,
    updatedAt: now,
    serverTime: now,
    partial: validCount !== 3,
    errors,
    cached: false
  };

  // فقط پاسخ کامل در کش ذخیره می‌شود تا داده ناقص جایگزین داده سالم نشود.
  if (!result.partial) {
    cache.data = result;
    cache.timestamp = Date.now();
  }

  return res.status(200).json(result);
     }
