const SOURCE_URL = "https://jouaren.com/ons";

function normalizeDigits(value) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";

  return String(value)
    .replace(/[۰-۹]/g, d => String(persian.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(arabic.indexOf(d)))
    .replace(/[٬،]/g, ",")
    .replace(/[\u00a0\u202f]/g, " ");
}

function parseNumber(value) {
  if (!value) return null;

  const normalized = normalizeDigits(value)
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.]/g, "");

  const number = Number(normalized);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

function extractNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      const value = parseNumber(match[1]);

      if (value !== null) return value;
    }
  }

  return null;
}

function calculatePrices(silverOunce, usdToman, silver999Toman) {
  // قیمت هر گرم نقره ۹۲۵ بر اساس نقره ۹۹۹
  const silver925Toman =
    silver999Toman !== null
      ? (silver999Toman * 925) / 999
      : null;

  // فرمول سفارشی قیمت مثقال ۱۷ عیار طبق دستور کاربر:
  // انس نقره × دلار
  // ÷ 31.103
  // ÷ 1000
  // × 700
  // × 4.608

  const mesghal17Toman =
    silverOunce !== null && usdToman !== null
      ? (
          (silverOunce * usdToman / 31.103 / 1000)
          * 700
          * 4.608
        )
      : null;

  const now = new Date().toISOString();

  return {
    silverOunce,
    usdToman,
    usdRial: usdToman !== null ? usdToman * 10 : null,

    silver999Toman,
    silver999Rial:
      silver999Toman !== null ? silver999Toman * 10 : null,

    silver925Toman,
    silver925Rial:
      silver925Toman !== null ? silver925Toman * 10 : null,

    usdtToman: usdToman,

    // قیمت نهایی مثقال ۱۷ عیار به تومان
    mesghal17Toman:
      mesghal17Toman !== null
        ? Math.round(mesghal17Toman)
        : null,

    updatedAt: now,
    serverTime: now,
    source: SOURCE_URL
  };
}

async function getPrices() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SILVER-ZARIN-FAKHR/1.0)",
      "Accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(
      `دریافت اطلاعات منبع ناموفق بود: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  const text = normalizeDigits(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
  );

  // قیمت انس جهانی نقره به دلار
  let silverOunce = extractNumber(text, [
    /قیمت\s*هر\s*انس\s*نقره[^$]{0,100}\$\s*([\d,]+(?:\.\d+)?)/i,
    /انس\s*جهانی\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    /XAG\/USD[\s\S]{0,300}?\$([\d,]+(?:\.\d+)?)/i
  ]);

  // قیمت دلار بازار ایران به تومان
  const usdToman = extractNumber(text, [
    /نرخ\s*دلار\s*بازار\s*([\d,]+)\s*تومان/i
  ]);

  // قیمت هر گرم نقره ۹۹۹ به تومان
  const silver999Toman = extractNumber(text, [
    /گرم\s*۹۹۹\s*\(\s*بازار\s*ایران\s*\)\s*([\d,]+)\s*تومان/i,
    /گرم\s*999\s*\(\s*بازار\s*ایران\s*\)\s*([\d,]+)\s*تومان/i
  ]);

  const errors = [];

  if (
    silverOunce === null ||
    silverOunce < 5 ||
    silverOunce > 200
  ) {
    errors.push("قیمت معتبر انس نقره پیدا نشد.");
    silverOunce = null;
  }

  if (
    usdToman === null ||
    usdToman < 1000 ||
    usdToman > 10000000
  ) {
    errors.push("قیمت معتبر دلار به تومان پیدا نشد.");
  }

  if (
    silver999Toman === null ||
    silver999Toman < 1000 ||
    silver999Toman > 100000000
  ) {
    errors.push("قیمت معتبر نقره ۹۹۹ پیدا نشد.");
  }

  const prices = calculatePrices(
    silverOunce,
    usdToman,
    silver999Toman
  );

  return {
    success: errors.length === 0,

    ...prices,

    // حفظ ساختار خروجی برای سازگاری با پنل فعلی
    prices: {
      silverOunce: prices.silverOunce,
      silver999: prices.silver999Rial,
      silver999Rial: prices.silver999Rial,
      silver999Toman: prices.silver999Toman,
      usd: prices.usdRial,
      usdRial: prices.usdRial,
      usdToman: prices.usdToman,
      silver925Toman: prices.silver925Toman,
      silver925Rial: prices.silver925Rial,
      mesghal17Toman: prices.mesghal17Toman
    },

    partial: errors.length > 0,
    errors
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "فقط درخواست GET پشتیبانی می‌شود."
    });
  }

  try {
    const result = await getPrices();

    return res
      .status(result.success ? 200 : 502)
      .json(result);
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "دریافت قیمت‌ها با خطا مواجه شد.",
      details: [
        error && error.message
          ? error.message
          : "خطای نامشخص"
      ],
      source: SOURCE_URL,
      updatedAt: new Date().toISOString()
    });
  }
};
