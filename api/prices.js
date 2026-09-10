export default async function handler(req, res) {
  const SOURCES = {
    gold:
      "https://servatmandi.com/Entity/Summary/10000000001901",

    silver:
      "https://servatmandi.com/Entity/Summary/10000000001903",

    usd:
      "https://servatmandi.com/Entity/Summary/100000000001"
  };

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language":
      "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7"
  };

  try {
    async function getPage(url, name) {
      let response;

      try {
        response = await fetch(url, {
          method: "GET",
          headers,
          redirect: "follow",
          cache: "no-store"
        });
      } catch (error) {
        throw new Error(
          `اتصال به ${name} شکست خورد: ${error.message}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `${name}: HTTP ${response.status} ${response.statusText}`
        );
      }

      const text = await response.text();

      if (!text || text.length < 100) {
        throw new Error(
          `${name}: پاسخ منبع خالی یا ناقص است`
        );
      }

      return text;
    }

    function normalizeDigits(text) {
      return text
        .replace(/[۰-۹]/g, function (d) {
          return "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
        })
        .replace(/[٠-٩]/g, function (d) {
          return "٠١٢٣٤٥٦٧٨٩".indexOf(d);
        });
    }

    function htmlToText(html) {
      return normalizeDigits(
        html
          .replace(
            /<script[\s\S]*?<\/script>/gi,
            " "
          )
          .replace(
            /<style[\s\S]*?<\/style>/gi,
            " "
          )
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&quot;/gi, '"')
          .replace(/&#x27;/gi, "'")
          .replace(/&#39;/gi, "'")
          .replace(/\s+/g, " ")
          .trim()
      );
    }

    function extractPrice(html, type) {
      const text = htmlToText(html);

      const position =
        text.indexOf("آخرین قیمت");

      if (position === -1) {
        throw new Error(
          `عبارت «آخرین قیمت» برای ${type} پیدا نشد`
        );
      }

      const section = text.substring(
        position,
        position + 500
      );

      const match = section.match(
        /آخرین\s*قیمت\s*(?:\||:)?\s*([0-9]+(?:[,.][0-9]+)*)/
      );

      if (!match) {
        throw new Error(
          `عدد قیمت ${type} پیدا نشد`
        );
      }

      const raw = match[1].replace(/,/g, "");
      const price = Number(raw);

      if (!Number.isFinite(price)) {
        throw new Error(
          `قیمت ${type} عدد معتبر نیست`
        );
      }

      return price;
    }

    const results =
      await Promise.allSettled([
        getPage(SOURCES.gold, "طلا"),
        getPage(SOURCES.silver, "نقره"),
        getPage(SOURCES.usd, "دلار")
      ]);

    const goldResult = results[0];
    const silverResult = results[1];
    const usdResult = results[2];

    const errors = [];

    if (goldResult.status === "rejected") {
      errors.push(
        `gold: ${goldResult.reason.message}`
      );
    }

    if (silverResult.status === "rejected") {
      errors.push(
        `silver: ${silverResult.reason.message}`
      );
    }

    if (usdResult.status === "rejected") {
      errors.push(
        `usd: ${usdResult.reason.message}`
      );
    }

    if (errors.length > 0) {
      throw new Error(
        errors.join(" | ")
      );
    }

    const goldOunce =
      extractPrice(
        goldResult.value,
        "gold"
      );

    const silverOunce =
      extractPrice(
        silverResult.value,
        "silver"
      );

    const usdRial =
      extractPrice(
        usdResult.value,
        "usd"
      );

    if (
      !Number.isFinite(goldOunce) ||
      goldOunce <= 0
    ) {
      throw new Error(
        "قیمت طلا معتبر نیست"
      );
    }

    if (
      !Number.isFinite(silverOunce) ||
      silverOunce <= 0
    ) {
      throw new Error(
        "قیمت نقره معتبر نیست"
      );
    }

    if (
      !Number.isFinite(usdRial) ||
      usdRial <= 0
    ) {
      throw new Error(
        "قیمت دلار معتبر نیست"
      );
    }

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    return res.status(200).json({
      success: true,
      goldOunce: goldOunce,
      silverOunce: silverOunce,
      usdRial: usdRial,
      updatedAt:
        new Date().toISOString(),
      source: "Servatmandi"
    });

  } catch (error) {

    console.error(
      "PRICE API ERROR:",
      error
    );

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(500).json({
      success: false,
      error:
        "دریافت اطلاعات بازار با خطا مواجه شد",
      message:
        error.message,
      updatedAt:
        new Date().toISOString()
    });
  }
}
