export interface ScrapedUrlMetadata {
  title: string;
  description: string;
  favicon: string;
  domain: string;
  url: string;
  suggestedCategory: string;
  keywords: string[];
}

/**
 * Decode common HTML entities into readable UTF-8 characters
 */
function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Infer the best category based on URL, title, description, and keywords
 */
function inferCategory(url: string, title: string, description: string, keywords: string[]): string {
  const combinedText = `${url} ${title} ${description} ${keywords.join(" ")}`.toLowerCase();

  // Repository detection
  if (/github\.com|gitlab\.com|bitbucket\.org|\brepo\b|open[- ]source/i.test(combinedText)) {
    return "repo";
  }

  // Design, visual, typography, animations
  if (
    /animation|flower|words you can feel|typography|canvas|webgl|shader|3d|illustration|font|palette|color|design system|svg|icon|figma|css/i.test(
      combinedText
    )
  ) {
    return "design";
  }

  // Documentation / API
  if (
    /documentation|\bdocs\b|api reference|sdk|developer guide|handbook|cheat ?sheet|specification|manual/i.test(
      combinedText
    )
  ) {
    return "docs";
  }

  // Cloud / Hosting / Infrastructure
  if (
    /hosting|deploy|serverless|docker|kubernetes|aws|vercel|render|supabase|firebase|neon|cockroach|cloudflare|database/i.test(
      combinedText
    )
  ) {
    return "hosting";
  }

  // AI & Prompts
  if (/prompt|llm|\bgpt\b|openai|anthropic|claude|gemini|artificial intelligence|machine learning/i.test(combinedText)) {
    return "prompts";
  }

  return "tools";
}

/**
 * Fetch and extract rich metadata from a URL with timeout and fallback protection
 */
export async function fetchUrlMetadata(rawUrl: string, timeoutMs = 3500): Promise<ScrapedUrlMetadata> {
  let formattedUrl = (rawUrl || "").trim();
  if (!formattedUrl) {
    return {
      title: "Unknown Resource",
      description: "",
      favicon: "",
      domain: "",
      url: "",
      suggestedCategory: "tools",
      keywords: []
    };
  }

  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(formattedUrl);
  } catch {
    return {
      title: formattedUrl,
      description: "",
      favicon: "",
      domain: formattedUrl,
      url: formattedUrl,
      suggestedCategory: "tools",
      keywords: []
    };
  }

  const domain = parsedUrl.hostname.replace(/^www\./, "");
  const fallbackFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  let title = domain;
  let description = "";
  let favicon = fallbackFavicon;
  const keywords: string[] = [];

  try {
    const res = await fetch(parsedUrl.href, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (res.ok) {
      const htmlText = await res.text();
      // Read first 160KB where head and early meta tags live
      const headHtml = htmlText.slice(0, 160000);

      // Title extraction (og:title, twitter:title, then <title>)
      const ogTitle =
        headHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)?.[1];

      const htmlTitle = headHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

      if (ogTitle) {
        title = decodeHtmlEntities(ogTitle);
      } else if (htmlTitle) {
        title = decodeHtmlEntities(htmlTitle);
      }

      // Description extraction (og:description, description, twitter:description)
      const descMatch =
        headHtml.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i)?.[1];

      if (descMatch) {
        description = decodeHtmlEntities(descMatch);
      }

      // Keywords extraction
      const kwMatch = headHtml.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i)?.[1];
      if (kwMatch) {
        const decoded = decodeHtmlEntities(kwMatch);
        keywords.push(
          ...decoded
            .split(",")
            .map(k => k.trim().toLowerCase())
            .filter(Boolean)
        );
      }

      // Favicon extraction
      const iconMatch =
        headHtml.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
        headHtml.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)?.[1];

      if (iconMatch) {
        try {
          favicon = new URL(iconMatch, parsedUrl.origin).href;
        } catch {
          favicon = fallbackFavicon;
        }
      }
    }
  } catch {
    // Graceful fallback to domain
  }

  const suggestedCategory = inferCategory(parsedUrl.href, title, description, keywords);

  return {
    title,
    description,
    favicon,
    domain,
    url: parsedUrl.href,
    suggestedCategory,
    keywords
  };
}
