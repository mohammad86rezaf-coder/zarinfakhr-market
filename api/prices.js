export default async function handler(req, res) {
  // =========================================================
  // SILVER ZARIN FAKHR
  // Stable Market Price API
  // =========================================================

  const SOURCES = {
    silverOunce:
      "https://servatmandi.com/Entity/Summary/10000000001903",

    silver999:
      "https://servatmandi.com/Entity/Summary/50000000001301",

    usd:
      "https://servatmandi.com/Entity/Summary/100000000001"
  };

  // ---------------------------------------------------------
  // تنظیمات پایداری
  // ---------------------------------------------------------

  const REQUEST_TIMEOUT = 8000; // 8 ثانیه
  const RETRY_COUNT = 1;        // یک بار تلاش مجدد
  const CACHE_TTL = 10000;      // 10 ثانیه

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
    const text = htmlToText(html);

    if (!text) {
      throw new Error(
        `محتوای ${type} خالی است`
      );
    }

    // -------------------------------------------------------
    // حالت اصلی: عبارت «آخرین قیمت»
    // -------------------------------------------------------

    const lastPriceIndex =
      text.indexOf("آخرین قیمت");

    if (lastPriceIndex !== -1) {
      const section = text.substring(
        lastPriceIndex,
        lastPriceIndex + 1200
      );

      /*
       * نمونه‌های قابل قبول:
       *
       * آخرین قیمت 4950000
       * آخرین قیمت: 4,950,000
       * آخرین قیمت | 4,950,000
       * آخرین قیمت - ۴۹۵۰۰۰۰
       */

      const patterns = [
        /آخرین\s*قیمت\s*(?:\||:|-)?\s*([0-9]+(?:[,\٬،][0-9]{3})*(?:\.[0-9]+)?)/i,

        /آخرین\s*قیمت[\s\S]{0,80}?([0-9]{3,}(?:[,\٬،][0-9]{3})*)/i
      ];

      for (const pattern of patterns) {
        const match = section.match(pattern);

        if (!match) {
          continue;
        }

        const price = parseNumber(match[1]);

        if (
          Number.isFinite(price) &&
          price > 0
        ) {
          return price;
        }
      }
    }

    // -------------------------------------------------------
    // روش دوم:
    // اگر ساختار سایت کمی تغییر کرده باشد، اطراف عبارت
    // «قیمت» را بررسی می‌کنیم.
    // -------------------------------------------------------

    const priceWords = [
      "قیمت فعلی",
      "قیمت",
      "آخرین نرخ",
      "نرخ فعلی"
    ];

    for (const word of priceWords) {
      const index = text.indexOf(word);

      if (index === -1) {
        continue;
      }

      const section = text.substring(
        index,
        index + 500
      );

      const matches =
        section.match(
          /([0-9]{3,}(?:[,\٬،][0-9]{3})*(?:\.[0-9]+)?)/g
        );

      if (!matches) {
        continue;
      }

      for (const item of matches) {
        const price = parseNumber(item);

        if (
          Number.isFinite(price) &&
          price > 0
        ) {
          return price;
        }
      }
    }

    throw new Error(
      `قیمت معتبر ${type} پیدا نشد`
    );
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

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(
            `${type}: HTTP ${response.status}`
          );
        }

        const html =
          await response.text();

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
        SOURCES.usd,
        "usd"
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
          "usd"
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
        "تمام منابع قیمت در دسترس نیستند",

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
      !validUSD
  };

  // =========================================================
  // ذخیره آخرین داده معتبر
  // =========================================================

  cache.data = result;
  cache.timestamp = Date.now();

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
    cached: false,

    // اگر یک منبع موقتاً مشکل داشته باشد،
    // اطلاعات خطا برای پنل لازم نیست.
    // فقط در لاگ سرور ثبت می‌شود.
  });
      }
