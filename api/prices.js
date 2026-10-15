// ============================================================
// SILVER ZARIN FAKHR
// LIVE SILVER PRICE API
// Source: Jouaren
// ============================================================

const SOURCE =
  "https://jouaren.com/ons";

const TIMEOUT_MS = 15000;

export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0"
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "فقط درخواست GET مجاز است"
    });
  }

  function normalizeDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, d =>
        String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      )
      .replace(/[٠-٩]/g, d =>
        String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
      );
  }

  function htmlToText(html) {
    return normalizeDigits(
      String(html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#x27;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/[\u200c\u200e\u200f]/g, " ")
        .replace(/\s+/g, " ")
    ).trim();
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

  function extractNearLabel(text, label, pattern) {
    const match = text.match(label);

    if (!match || match.index === undefined) {
      return null;
    }

    const section = text.slice(
      match.index,
      match.index + 220
    );

    const found = section.match(pattern);

    if (!found) {
      return null;
    }

    return parseNumber(found[1]);
  }

  function validate(value, min, max) {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
    );
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    const response = await fetch(SOURCE, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,*/*",

        "Accept-Language":
          "fa-IR,fa;q=0.9,en;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(
        "خطای دریافت اطلاعات از ژوآرن: HTTP " +
        response.status
      );
    }

    const html = await response.text();

    if (!html || html.length < 100) {
      throw new Error(
        "پاسخ منبع قیمت معتبر نیست"
      );
    }

    const text = htmlToText(html);

    // انس جهانی نقره به دلار
    const silverOunce = extractNearLabel(
      text,
      /انس جهانی نقره/i,
      /(?:\$|USD\s*)\s*([\d,٬،.]+)/
    );

    // نرخ دلار بازار ایران به تومان
    const usdToman = extractNearLabel(
      text,
      /نرخ دلار بازار/i,
      /([\d۰-۹٠-٩][\d۰-۹٠-٩,٬،.]*)\s*تومان/i
    );

    // قیمت هر گرم نقره 999 به تومان
    const silver999Toman = extractNearLabel(
      text,
      /گرم\s*999\s*\(\s*بازار ایران\s*\)/i,
      /([\d۰-۹٠-٩][\d۰-۹٠-٩,٬،.]*)\s*تومان/i
    );

    const errors = [];

    if (!validate(silverOunce, 10, 500)) {
      errors.push(
        "قیمت انس جهانی نقره پیدا نشد یا نامعتبر است"
      );
    }

    if (!validate(usdToman, 10000, 10000000)) {
      errors.push(
        "نرخ دلار به تومان پیدا نشد یا نامعتبر است"
      );
    }

    if (!validate(silver999Toman, 10000, 100000000)) {
      errors.push(
        "قیمت نقره 999 پیدا نشد یا نامعتبر است"
      );
    }

    if (errors.length > 0) {
      return res.status(503).json({
        success: false,
        error: "استخراج قیمت‌ها کامل نشد",
        details: errors,
        prices: {
          silverOunce,
          usdToman,
          silver999Toman
        },
        source: SOURCE,
        checkedAt: new Date().toISOString()
      });
    }

    // تبدیل تومان به ریال
    const usdRial = usdToman * 10;

    const silver999Rial =
      silver999Toman * 10;

    // محاسبه ارزش نظری نقره 925
    const silver925Toman =
      silver999Toman * 925 / 999;

    const silver925Rial =
      silver925Toman * 10;

    const now = new Date().toISOString();

    return res.status(200).json({
      success: true,

      silverOunce,

      usdToman,
      usdRial,

      silver999Toman,
      silver999Rial,

      silver925Toman,
      silver925Rial,

      usdtToman: usdToman,

      updatedAt: now,
      serverTime: now,

      source: SOURCE,
      partial: false,
      errors: []
    });

  } catch (error) {
    return res.status(503).json({
      success: false,
      error: "دریافت اطلاعات قیمت ناموفق بود",
      details: [
        error.name === "AbortError"
          ? "مهلت دریافت اطلاعات تمام شد"
          : String(error.message || error)
      ],
      source: SOURCE,
      checkedAt: new Date().toISOString()
    });

  } finally {
    clearTimeout(timer);
  }
}
