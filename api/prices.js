export default async function handler(req, res) {
  const SOURCES = {
    silverOunce:
      "https://servatmandi.com/Entity/Summary/10000000001903",

    silver999:
      "https://servatmandi.com/Entity/Summary/50000000001301",

    usd:
      "https://servatmandi.com/Entity/Summary/100000000001"
  };

  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    async function getPage(url) {
      const response = await fetch(url, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        throw new Error(
          `خطا در دریافت منبع: ${response.status}`
        );
      }

      return await response.text();
    }

    function normalizeDigits(text) {
      return String(text)
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
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&#x27;/gi, "'")
          .replace(/&quot;/gi, '"')
          .replace(/\s+/g, " ")
          .trim()
      );
    }

    function extractPrice(html, type) {
      const text = htmlToText(html);

      const position = text.indexOf("آخرین قیمت");

      if (position === -1) {
        throw new Error(
          `آخرین قیمت برای ${type} پیدا نشد`
        );
      }

      const section = text.substring(
        position,
        position + 800
      );

      const match = section.match(
        /آخرین قیمت\s*(?:\||:|-)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/i
      );

      if (!match) {
        throw new Error(
          `قیمت معتبر ${type} پیدا نشد`
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
      getPage(SOURCES.silverOunce),
      getPage(SOURCES.silver999),
      getPage(SOURCES.usd)
    ]);

    const silverOunce = extractPrice(
      silverOunceHTML,
      "silverOunce"
    );

    const silver999Rial = extractPrice(
      silver999HTML,
      "silver999"
    );

    const usdRial = extractPrice(
      usdHTML,
      "usd"
    );

    const silver999Toman =
      silver999Rial / 10;

    const usdToman =
      usdRial / 10;

    const result = {
      success: true,

      silverOunce: silverOunce,

      usdToman: usdToman,

      usdRial: usdRial,

      silver999Toman: silver999Toman,

      silver999Rial: silver999Rial,

      updatedAt:
        new Date().toISOString(),

      source: "Servatmandi"
    };

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    return res.status(200).json(result);

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
