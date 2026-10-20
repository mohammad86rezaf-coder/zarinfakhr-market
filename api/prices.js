/*
 * SILVER ZARIN FAKHR — Vercel Serverless Function
 * فایل را در مخزن GitHub با مسیر دقیق api/prices.js قرار بده.
 * این تابع صفحه عمومی قیمت ژوآرن را سمت سرور می‌خواند تا مشکل CORS و HTML/JSON حل شود.
 */

const SOURCE_URL = "https://jouaren.com/ons";

function normalizeDigits(value) {
  return String(value || "")
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function toNumber(value) {
  const cleaned = normalizeDigits(value)
    .replace(/[٬،,\s]/g, "")
    .replace(/[٫]/g, ".")
    .replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function pageText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatchNumber(text, regex) {
  const match = regex.exec(text);
  return match ? toNumber(match[1]) : NaN;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "فقط درخواست GET مجاز است." });
  }

  try {
    const upstream = await fetch(SOURCE_URL, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; SZFMarketPanel/1.0)"
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!upstream.ok) {
      throw new Error("منبع قیمت با کد HTTP " + upstream.status + " پاسخ داد.");
    }

    const html = await upstream.text();
    const text = pageText(html);

    const silverOunce = firstMatchNumber(text, /انس جهانی\s*\$?\s*([0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٬،]*)/g);
    const usdToman = firstMatchNumber(text, /نرخ دلار بازار\s*([0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٬،\s]*?)\s*تومان/g);
    const silver999Toman = firstMatchNumber(text, /گرم ۹۹۹\s*\(بازار ایران\)\s*([0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٬،\s]*?)\s*تومان/g);

    if (!(silverOunce > 0) || !(usdToman > 0) || !(silver999Toman > 0)) {
      throw new Error("ساختار صفحه قیمت تغییر کرده یا قیمت‌ها در دسترس نیستند.");
    }

    const silver925Toman = silver999Toman * 925 / 999;
    // فرمول مورد استفاده پنل: انس × نرخ تومان دلار ÷ 31.1034768 × 0.700 × 4.608
    const mesghal17Toman = (silverOunce * usdToman / 31.1034768) * 0.700 * 4.608;

    return res.status(200).json({
      success: true,
      source: SOURCE_URL,
      updatedAt: new Date().toISOString(),
      silverOunce,
      usdToman,
      usdRial: usdToman * 10,
      silver999Toman,
      silver999Rial: silver999Toman * 10,
      silver925Toman,
      silver925Rial: silver925Toman * 10,
      mesghal17Toman,
      partial: false
    });
  } catch (error) {
    console.error("SZF market API error:", error);
    return res.status(502).json({
      success: false,
      message: error && error.message ? error.message : "دریافت اطلاعات بازار ناموفق بود."
    });
  }
};
