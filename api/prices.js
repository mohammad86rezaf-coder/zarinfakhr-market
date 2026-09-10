export default async function handler(req, res) {
  const SOURCES = {
    silverOunce:
      "https://servatmandi.com/Entity/Summary/10000000001903",

    silver999:
      "https://servatmandi.com/Entity/Summary/50000000001301",

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
      const response = await fetch(url, {
        method: "GET",
        headers,
        redirect: "follow",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          `${name}: HTTP ${response.status}`
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
        .replace(/[۰-۹]/g, d =>
          "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
        )
        .replace(/[٠-٩]/g, d =>
          "٠١٢٣٤٥٦٧٨٩".indexOf(d)
        );
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

      const price = Number(
        match[1].replace(/,/g, "")
      );

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(
          `قیمت ${type} معتبر نیست`
        );
      }

      return price;
    }

    const [
      silverOunceHTML,
      silver999HTML,
      usdHTML
    ] = await Promise.all([
      getPage(
        SOURCES.silverOunce,
        "انس نقره"
      ),

      getPage(
        SOURCES.silver999,
        "نقره 999"
      ),

      getPage(
        SOURCES.usd,
        "دلار"
      )
    ]);

    const silverOunce =
      extractPrice(
        silverOunceHTML,
        "انس نقره"
      );

    const silver999Rial =
      extractPrice(
        silver999HTML,
        "نقره 999"
      );

    const usdRial =
      extractPrice(
        usdHTML,
        "دلار"
      );

    const silver999Toman =
      silver999Rial / 10;

    const usdToman =
      usdRial / 10;

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

      silverOunce,

      silver999Rial,

      silver999Toman,

      usdRial,

      usdToman,

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
