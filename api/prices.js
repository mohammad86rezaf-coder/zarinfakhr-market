/* نسخه اصلاح‌شده متنی prices.js.
   توجه: نمایش قیمت زنده به استقرار این API روی Vercel و دسترسی منبع‌های قیمت وابسته است. */

export default async function handler(req, res) {
  // =========================================================
  // SILVER ZARIN FAKHR
  // Stable Market Price API
  // CORS برای اتصال امن صفحه استاتیک GitHub Pages به API عمومی قیمت
  // =========================================================

  const origin = req.headers.origin || "";
  let allowedOrigin = "";

  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.toLowerCase();
    const isGitHubPages = hostname.endsWith(".github.io");
    const isVercelApp = hostname === "zarinfakhr-market-v2.vercel.app";
    const isLocalDev = hostname === "localhost" || hostname === "127.0.0.1";

    if (isGitHubPages || isVercelApp || isLocalDev) {
      allowedOrigin = parsedOrigin.origin;
    }
  } catch (_) {
    // درخواست بدون Origin نیز برای بررسی مستقیم API مجاز می‌ماند.
  }

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed"
    });
  }

  const SOURCES = {
    silverOunce:
      "https://servatmandi.com/Entity/Summary/10000000001903",

    silver999:
      "https://servatmandi.com/Entity/Summary/50000000001301",

    usdt:
      "https://servatmandi.com/Entity/Summary/5000000000000"
  };

  // ---------------------------------------------------------
  // تنظیمات پایداری
  // ---------------------------------------------------------

  const REQUEST_TIMEOUT = 6000; // 6 ثانیه؛ با تلاش مجدد، زیر مهلت مرورگر
  const RETRY_COUNT = 1;        // یک بار تلاش مجدد
  const CACHE_TTL = 30000;      // 30 ثانیه؛ کاهش درخواست به منابع قیمت

  // ---------------------------------------------------------
  // حافظه موقت سرور
  // توجه: در Serverless ممکن است بین Instanceها مشترک نباشد.
  // ولی برای کاهش درخواست‌های پشت سرهم بسیار مفید است.
  // ---------------------------------------------------------

  if (!globalThis.__SZF_PRICE_CACHE__) {
    globalThis.__SZF_PRICE_CACHE__ = {
      data: null,
      timestamp: 0
    };
  }

  const cache = globalThis.__SZF_PRICE_CACHE__;

  // ---------------------------------------------------------
  // اگر کش هنوز معتبر است، مستقیماً همان داده را برگردان
  // ---------------------------------------------------------

  if (
    cache.data &&
    Date.now() - cache.timestamp < CACHE_TTL
  ) {
    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    return res.status(200).json({
      ...cache.data,
      cached: true
    });
  }

  // =========================================================
  // Headers
  // =========================================================

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language":
      "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",

    "Connection":
      "keep-alive"
  };

  // =========================================================
  // تبدیل ارقام فارسی و عربی به انگلیسی
  // =========================================================

  function normalizeDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, function (d) {
        return "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
      })
      .replace(/[٠-٩]/g, function (d) {
        return "٠١٢٣٤٥٦٧٨٩".indexOf(d);
      });
  }

  // =========================================================
  // Decode ساده HTML Entityها
  // =========================================================

  function decodeHtmlEntities(text) {
    return String(text)
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#x2F;/gi, "/")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  // =========================================================
  // تبدیل HTML به متن قابل جستجو
  // =========================================================

  function htmlToText(html) {
    return normalizeDigits(
      decodeHtmlEntities(
        String(html)
          .replace(
            /<script[\s\S]*?<\/script>/gi,
            " "
          )
          .replace(
            /<style[\s\S]*?<\/style>/gi,
            " "
          )
          .replace(
            /<noscript[\s\S]*?<\/noscript>/gi,
            " "
          )
          .replace(
            /<svg[\s\S]*?<\/svg>/gi,
            " "
          )
          .replace(
            /<[^>]*>/g,
            " "
          )
          .replace(/\u200c/g, " ")
          .replace(/\u200f/g, " ")
          .replace(/\u200e/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
    );
  }

  // =========================================================
  // تبدیل عدد به عدد واقعی
  // =========================================================

  function parseNumber(value) {
    if (value === null || value === undefined) {
      return NaN;
    }

    let text = normalizeDigits(String(value));

    text = text
      .replace(/[٬،]/g, ",")
      .replace(/\s+/g, "")
      .replace(/,/g, "");

    const number = Number(text);

    return number;
  }

  // =========================================================
  // استخراج قیمت
  // =========================================================

  function extractPrice(html, type) {
    // هرگز از عددهای عمومی موجود در اسکریپت‌ها/شناسه‌های صفحه قیمت‌سازی نمی‌کنیم.
    const raw = String(html || "");
    const explicitKeys = {
      silverOunce: ["SilverOunceLastPrice", "silverOunceLastPrice"],
      silver999: ["Silver999LastPrice", "silver999LastPrice"],
      usdt: ["USDTLastPrice", "usdtLastPrice"]
    }[type] || [];

    for (const key of explicitKeys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `["']${escaped}["']\\s*:\\s*["']?([0-9۰-۹٠-٩][0-9۰-۹٠-٩,٬،]*(?:\\.[0-9]+)?)`,
        "i"
      );
      const match = raw.match(pattern);
      if (match) {
        const price = parseNumber(match[1]);
        if (Number.isFinite(price) && price > 0) return price;
      }
    }

    // متن قابل مشاهده؛ اسکریپت‌ها حذف می‌شوند تا اعداد شناسه‌ها به‌عنوان قیمت انتخاب نشوند.
    const text = htmlToText(raw);
    if (!text) throw new Error(`محتوای ${type} خالی است`);

    const match = /آخرین قیمت\s*[:：|]?\s*([0-9]{1,3}(?:[٬،,][0-9]{3})+(?:\.[0-9]+)?|[0-9]{4,}(?:\.[0-9]+)?)/.exec(text);
    if (match) {
      const price = parseNumber(match[1]);
      if (Number.isFinite(price) && price > 0) return price;
    }

    throw new Error(`قیمت ${type} در متن HTML صفحه پیدا نشد. منبع مقدار را با JavaScript بارگذاری می‌کند؛ باید درخواست داده‌ای که نمودار دریافت می‌کند شناسایی شود.`);
  }

  // =========================================================
  // دریافت یک صفحه با Timeout
  // =========================================================

  async function getPage(url, type) {
    let lastError = null;

    for (
      let attempt = 0;
      attempt <= RETRY_COUNT;
      attempt++
    ) {
      const controller =
        new AbortController();

      const timeout =
        setTimeout(() => {
          controller.abort();
        }, REQUEST_TIMEOUT);

      try {
        const response =
          await fetch(url, {
            method: "GET",
            headers,
            signal: controller.signal,

            // جلوگیری از استفاده از کش داخلی fetch
            cache: "no-store"
          });

        if (!response.ok) {
          throw new Error(
            `${type}: HTTP ${response.status}`
          );
        }

        const html =
          await response.text();
        clearTimeout(timeout);

        if (
          !html ||
          html.trim().length < 50
        ) {
          throw new Error(
            `${type}: پاسخ خالی یا ناقص`
          );
        }

        return html;

      } catch (error) {
        clearTimeout(timeout);

        lastError = error;

        console.error(
          `PRICE SOURCE ERROR [${type}] attempt=${attempt + 1}:`,
          error
        );

        // کمی مکث قبل از Retry
        if (attempt < RETRY_COUNT) {
          await new Promise(resolve =>
            setTimeout(resolve, 500)
          );
        }
      }
    }

    throw new Error(
      `${type}: ${lastError?.message || "خطای نامشخص"}`
    );
  }

  // =========================================================
  // دریافت سه منبع به صورت مستقل
  // =========================================================

  const results =
    await Promise.allSettled([
      getPage(
        SOURCES.silverOunce,
        "silverOunce"
      ),

      getPage(
        SOURCES.silver999,
        "silver999"
      ),

      getPage(
        SOURCES.usdt,
        "usdt"
      )
    ]);

  // =========================================================
  // استخراج قیمت‌ها
  // =========================================================

  let silverOunce = null;
  let silver999Rial = null;
  let usdRial = null;

  const errors = [];

  // ---------------------------------------------------------
  // انس نقره
  // ---------------------------------------------------------

  if (
    results[0].status === "fulfilled"
  ) {
    try {
      silverOunce =
        extractPrice(
          results[0].value,
          "silverOunce"
        );
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push(
      results[0].reason?.message ||
      "خطا در دریافت انس نقره"
    );
  }

  // ---------------------------------------------------------
  // نقره 999
  // ---------------------------------------------------------

  if (
    results[1].status === "fulfilled"
  ) {
    try {
      silver999Rial =
        extractPrice(
          results[1].value,
          "silver999"
        );
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push(
      results[1].reason?.message ||
      "خطا در دریافت نقره 999"
    );
  }

  // ---------------------------------------------------------
  // دلار
  // ---------------------------------------------------------

  if (
    results[2].status === "fulfilled"
  ) {
    try {
      usdRial =
        extractPrice(
          results[2].value,
          "usdt"
        );
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push(
      results[2].reason?.message ||
      "خطا در دریافت دلار"
    );
  }

  // =========================================================
  // استفاده از آخرین داده معتبر در صورت قطعی موقت
  // =========================================================

  if (cache.data) {
    if (
      !Number.isFinite(silverOunce) &&
      Number.isFinite(
        cache.data.silverOunce
      )
    ) {
      silverOunce =
        cache.data.silverOunce;
    }

    if (
      !Number.isFinite(silver999Rial) &&
      Number.isFinite(
        cache.data.silver999Rial
      )
    ) {
      silver999Rial =
        cache.data.silver999Rial;
    }

    if (
      !Number.isFinite(usdRial) &&
      Number.isFinite(
        cache.data.usdRial
      )
    ) {
      usdRial =
        cache.data.usdRial;
    }
  }

  // =========================================================
  // اعتبارسنجی نهایی
  // =========================================================

  const validSilverOunce =
    Number.isFinite(silverOunce) &&
    silverOunce > 0;

  const validSilver999 =
    Number.isFinite(silver999Rial) &&
    silver999Rial > 0;

  const validUSD =
    Number.isFinite(usdRial) &&
    usdRial > 0;

  // اگر هیچ داده معتبری نداریم
  if (
    !validSilverOunce &&
    !validSilver999 &&
    !validUSD
  ) {
    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(503).json({
      success: false,

      error:
        "دریافت اطلاعات بازار با خطا مواجه شد",

      message:
        "تمام منابع قیمت در دسترس نیستند؛ جزئیات خطا را در details ببینید.",

      details:
        errors,

      serverTime:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString()
    });
  }

  // =========================================================
  // تبدیل ریال به تومان
  // =========================================================

  const usdToman =
    validUSD
      ? usdRial / 10
      : null;

  const silver999Toman =
    validSilver999
      ? silver999Rial / 10
      : null;

  // =========================================================
  // زمان
  // =========================================================

  const now =
    new Date().toISOString();

  // =========================================================
  // نتیجه نهایی
  // =========================================================

  const result = {
    success: true,

    silverOunce:
      validSilverOunce
        ? silverOunce
        : null,

    usdToman,

    // نام دقیق‌تر برای نرخ تتر؛ usdToman برای سازگاری با نسخه فعلی باقی مانده است.
    usdtToman: usdToman,

    usdRial:
      validUSD
        ? usdRial
        : null,

    silver999Toman,

    silver999Rial:
      validSilver999
        ? silver999Rial
        : null,

    serverTime: now,

    updatedAt: now,

    // فقط برای کنترل داخلی/عیب‌یابی
    partial:
      !validSilverOunce ||
      !validSilver999 ||
      !validUSD,

    // برای عیب‌یابی، فقط خطاهای دریافت/استخراج را برمی‌گردانیم.
    errors: errors.slice(0, 6)
  };

  // =========================================================
  // ذخیره آخرین داده معتبر
  // =========================================================

  if (!result.partial) {
    cache.data = result;
    cache.timestamp = Date.now();
  }

  // =========================================================
  // Response Headers
  // =========================================================

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "Expires",
    "0"
  );

  // =========================================================
  // پاسخ
  // =========================================================

  return res.status(200).json({
    ...result,
    cached: false
  });
     }
