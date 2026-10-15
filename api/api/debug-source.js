export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Only GET is allowed"
    });
  }

  const url =
    "https://servatmandi.com/Entity/Summary/50000000001301";

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8"
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "Source HTTP error",
        status: response.status
      });
    }

    const html = await response.text();

    const scripts = [
      ...html.matchAll(
        /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
      )
    ].map(match => {
      try {
        return new URL(match[1], url).href;
      } catch {
        return match[1];
      }
    });

    const inlineScripts = [
      ...html.matchAll(
        /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi
      )
    ].map(match => match[1]);

    const keywords = [
      "price",
      "lastPrice",
      "last_price",
      "50000000001301",
      "SignalR",
      "WebSocket",
      "ajax",
      "api/"
    ];

    const matches = [];

    for (const script of inlineScripts) {
      for (const keyword of keywords) {
        const index = script.toLowerCase().indexOf(
          keyword.toLowerCase()
        );

        if (index !== -1) {
          matches.push({
            keyword,
            snippet: script.slice(
              Math.max(0, index - 150),
              Math.min(script.length, index + 350)
            )
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      httpStatus: response.status,
      htmlLength: html.length,
      scriptUrls: [...new Set(scripts)],
      inlineScriptMatches: matches.slice(0, 20)
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: error.message
    });
  }
  }
