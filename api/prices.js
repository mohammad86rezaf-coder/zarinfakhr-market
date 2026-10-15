// ============================================================
// SILVER ZARIN FAKHR
// LIVE PRICE API — Vercel Serverless Function
// ============================================================

const SOURCES = {
  silverOunce:
    "https://servatmandi.com/Entity/Summary/10000000001903",

  silver999:
    "https://servatmandi.com/Entity/Summary/50000000001301",

  usd:
    "https://servatmandi.com/Entity/Summary/5000000000000"
};

const TIMEOUT_MS = 10000;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const origin = req.headers.origin || "";

  try {
    const parsedOrigin = new URL(origin);

    const allowedHosts = [
      "zarinfakhr-market-v2.vercel.app",
      "localhost",
      "127.0.0.1"
    ];

    if (
      allowedHosts.includes(parsedOrigin.hostname) ||
      parsedOrigin.hostname.endsWith(".github.io")
    ) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        parsedOrigin.origin
      );
      res.setHeader("Vary", "Origin");
    }
  } catch (_) {}

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");

    return res.status(405).json({
      success: false,
      error: "فقط درخواست GET مجاز است"
    });
  }

  function normalizeDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, digit =>
        String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
      )
      .replace(/[٠-٩]/g, digit =>
        String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
      );
  }

  function decodeHtml(value) {
    return String(value)
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&#x27;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function htmlToText(html) {
    return normalizeDigits(
      decodeHtml(
        String(html)
          .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
          .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
          .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
          .replace(/<[^>]*>/g, " ")
      )
    )
      .replace(/[\u200c\u200e\u200f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseNumber(value) {
    const normalized = normalizeDigits(value)
      .replace(/[,\u066C\u060C\s]/g, "");

    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
      return null;
    }

    const number = Number(normalized);

    return Number.isFinite(number) && number > 0
      ? number
      : null;
  }

  async function fetchSource(key, url) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/json,*/*",

          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(
          key + ": خطای HTTP " + response.status
        );
      }

      const body = await response.text();

      if (!body || body.length < 20) {
        throw new Error(key + ": پاسخ منبع خالی است");
      }

      // اگر منبع مستقیماً JSON برگرداند، ساختار آن را بررسی می‌کنیم.
      let json = null;

      try {
        json = JSON.parse(body);
      } catch (_) {}

      if (json !== null) {
        const result = findPriceInJson(json, key);

        if (result !== null) {
          return result;
        }
      }

      // در غیر این صورت HTML را بررسی می‌کنیم.
      const text = htmlToText(body);

      const price = extractLabeledPrice(text, key);

      if (price !== null) {
        return price;
      }

      throw new Error(
        key +
        ": قیمت در پاسخ اولیه پیدا نشد؛ " +
        "ممکن است قیمت با JavaScript بارگذاری شود"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  function findPriceInJson(data, key) {
    const acceptedKeys = {
      silverOunce: [
        "silverOunce",
        "ounce",
        "price",
        "lastPrice",
        "last_price",
        "value"
      ],

      silver999: [
        "silver999",
        "price",
        "lastPrice",
        "last_price",
        "value"
      ],

      usd: [
        "usd",
        "usdt",
        "price",
        "lastPrice",
        "last_price",
        "value"
      ]
    };

    if (!data || typeof data !== "object") {
      return null;
    }

    for (const name of acceptedKeys[key] || []) {
      if (
        Object.prototype.hasOwnProperty.call(data, name)
      ) {
        const value = data[name];

        if (typeof value === "number" && value > 0) {
          return value;
        }

        if (typeof value === "string") {
          const parsed = parseNumber(value);

          if (parsed !== null) {
            return parsed;
          }
        }
      }
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === "object") {
        const result = findPriceInJson(value, key);

        if (result !== null) {
          return result;
        }
      }
    }

    return null;
  }

  function extractLabeledPrice(text, key) {
    const labels = {
      silverOunce: [
        /انس\s*نقره/i,
        /نقره\s*\(\s*Silver\s*\)/i
      ],

      silver999: [
        /نقره\s*999/i
      ],

      usd: [
        /تتر\s*\(\s*USDT/i,
        /دلار\s*آمریکا/i
      ]
    };

    const patterns = [
      /آخرین\s*قیمت\s*[:：]?\s*([\d۰-۹٠-٩][\d۰-۹٠-٩,٬،.]*)/i,
      /آخرین\s*مقدار\s*[:：]?\s*([\d۰-۹٠-٩][\d۰-۹٠-٩,٬،.]*)/i
    ];

    for (const label of labels[key] || []) {
      const match = text.match(label);

      if (!match || match.index === undefined) {
        continue;
      }

      const section = text.slice(
        match.index,
        match.index + 1500
      );

      for (const pattern of patterns) {
        const priceMatch = section.match(pattern);

        if (priceMatch) {
          const parsed = parseNumber(priceMatch[1]);

          if (parsed !== null) {
            return parsed;
          }
        }
      }
    }

    return null;
  }

  function validatePrice(key, value) {
    const ranges = {
      silverOunce: [10, 500],
      silver999: [100000, 100000000],
      usd: [10000, 10000000]
    };

    const range = ranges[key];

    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= range[0] &&
      value <= range[1]
    );
  }

  const keys = [
    "silverOunce",
    "silver999",
    "usd"
  ];

  const results = await Promise.allSettled(
    keys.map(key => fetchSource(key, SOURCES[key]))
  );

  const prices = {};
  const errors = [];

  results.forEach((result, index) => {
    const key = keys[index];

    if (result.status === "rejected") {
      errors.push(
        result.reason?.message || key + ": خطای دریافت"
      );

      return;
    }

    const price = result.value;

    if (!validatePrice(key, price)) {
      errors.push(
        key + ": قیمت خارج از محدوده معتبر است"
      );

      return;
    }

    prices[key] = price;
  });

  const now = new Date().toISOString();

  if (errors.length > 0) {
    return res.status(503).json({
      success: false,
      error: "دریافت قیمت معتبر کامل نشد",
      details: errors,
      prices: {
        silverOunce: prices.silverOunce ?? null,
        silver999Rial: prices.silver999 ?? null,
        usdRial: prices.usd ?? null
      },
      updatedAt: now,
      sources: SOURCES
    });
  }

  // منبع نقره و تتر در این پروژه بر حسب ریال است.
  const silver999Rial = prices.silver999;
  const silver999Toman = silver999Rial / 10;

  // قیمت نقره 925 از قیمت نقره 999 محاسبه می‌شود.
  const silver925Rial =
    silver999Rial * 925 / 999;

  const silver925Toman =
    silver925Rial / 10;

  const usdRial = prices.usd;
  const usdToman = usdRial / 10;

  return res.status(200).json({
    success: true,

    silverOunce: prices.silverOunce,

    silver999Rial,
    silver999Toman,

    silver925Rial,
    silver925Toman,

    usdRial,
    usdToman,

    usdtToman: usdToman,

    updatedAt: now,
    serverTime: now,

    partial: false,
    errors: [],
    sources: SOURCES
  });
                                     }
