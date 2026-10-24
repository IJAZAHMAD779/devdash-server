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
 * Format raw repository names (e.g. "fluentui-emoji" -> "Fluent UI Emoji" or "Twemoji")
 */
export function formatRepoTitle(repo: string): string {
  if (!repo) return "";
  // If already mixed case (e.g. "Twemoji", "Material-UI"), keep capitalization
  if (/[a-z]/.test(repo) && /[A-Z]/.test(repo)) {
    return repo.replace(/[-_]/g, " ").trim();
  }
  return repo
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUi\b/g, "UI")
    .replace(/\bJs\b/g, "JS")
    .replace(/\bTs\b/g, "TS")
    .replace(/\bCss\b/g, "CSS")
    .replace(/\bHtml\b/g, "HTML")
    .trim();
}

/**
 * Extract owner and repo from a GitHub URL
 */
export function parseGitHubRepo(parsedUrl: URL): { owner: string; repo: string } | null {
  const isGitHub = /(?:^|\.)github\.com$/i.test(parsedUrl.hostname);
  if (!isGitHub) return null;

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathSegments.length < 2) return null;

  const reserved = new Set([
    "about", "pricing", "features", "explore", "topics", "trending", "collections",
    "events", "readme", "marketplace", "login", "join", "security", "customer-stories",
    "enterprise", "solutions", "settings", "notifications", "search", "pulls", "issues",
    "stars", "sponsors", "site", "orgs"
  ]);

  const owner = pathSegments[0];
  const repo = pathSegments[1].replace(/\.git$/i, "");

  if (reserved.has(owner.toLowerCase()) || reserved.has(repo.toLowerCase())) {
    return null;
  }

  return { owner, repo };
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

  // Check if this is a GitHub repository URL
  const ghRepo = parseGitHubRepo(parsedUrl);
  if (ghRepo) {
    const { owner, repo } = ghRepo;
    const formattedTitle = formatRepoTitle(repo);
    const ghFavicon = "https://github.githubassets.com/favicons/favicon.svg";

    // 1. First attempt: Query GitHub's public API (unauthenticated 60 req/hr)
    try {
      const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        signal: AbortSignal.timeout(Math.min(timeoutMs, 2500)),
        headers: {
          "User-Agent": "DevDash-Workspace/1.0",
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (ghRes.ok) {
        const ghData: any = await ghRes.json();
        const apiTitle = ghData.name ? formatRepoTitle(ghData.name) : formattedTitle;
        const apiDesc = (ghData.description || "").trim();
        const topics = Array.isArray(ghData.topics) ? ghData.topics : [];
        const language = ghData.language ? [ghData.language.toLowerCase()] : [];

        return {
          title: apiTitle || formattedTitle,
          description: apiDesc || `Official open-source ${formattedTitle} repository by ${owner} on GitHub.`,
          favicon: ghFavicon,
          domain: "github.com",
          url: parsedUrl.href,
          suggestedCategory: "repo",
          keywords: Array.from(new Set(["repo", "github", "open-source", repo.toLowerCase(), owner.toLowerCase(), ...language, ...topics]))
        };
      }
    } catch {
      // API call timed out or rate limited, proceed to HTML scrape
    }
  }

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
      // Read first 200KB where head and early meta tags live
      const headHtml = htmlText.slice(0, 200000);

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

      // If GitHub, extract the actual repo title from "GitHub - owner/repo: ..."
      if (ghRepo) {
        const repoTitleMatch = title.match(/^(?:GitHub\s*-\s*)?[^/:]+\/([^/:]+)/i);
        if (repoTitleMatch && repoTitleMatch[1]) {
          title = formatRepoTitle(repoTitleMatch[1].trim());
        } else if (!title || title.toLowerCase() === "github" || title.toLowerCase() === "github.com") {
          title = formatRepoTitle(ghRepo.repo);
        }
      }

      // Description extraction (og:description, description, twitter:description)
      const descMatch =
        headHtml.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1] ||
        headHtml.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i)?.[1];

      if (descMatch) {
        let cleanDesc = decodeHtmlEntities(descMatch);
        // Strip GitHub boilerplates from description
        if (ghRepo) {
          cleanDesc = cleanDesc
            .replace(/\s*\.?\s*Contribute to [^\s]+ development by creating an account on GitHub\.?/i, "")
            .trim();
        }
        description = cleanDesc;
      }

      // Keywords extraction
      const kwMatch = headHtml.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i)?.[1];
      if (kwMatch) {
        const decoded = decodeHtmlEntities(kwMatch);
        keywords.push(
          ...decoded
            .split(",")
            .map((k) => k.trim().toLowerCase())
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
    // Graceful fallback to domain or repository info
  }

  // Handle repository fallbacks if description was empty or fetch failed
  if (ghRepo) {
    const formattedTitle = formatRepoTitle(ghRepo.repo);
    if (!title || title.toLowerCase() === "github" || title.toLowerCase() === "github.com") {
      title = formattedTitle;
    }
    if (!description || description.length < 5) {
      description = `Official open-source ${formattedTitle} repository by ${ghRepo.owner} on GitHub.`;
    }
    favicon = "https://github.githubassets.com/favicons/favicon.svg";
    return {
      title,
      description,
      favicon,
      domain: "github.com",
      url: parsedUrl.href,
      suggestedCategory: "repo",
      keywords: Array.from(new Set(["repo", "github", "open-source", ghRepo.repo.toLowerCase(), ghRepo.owner.toLowerCase(), ...keywords]))
    };
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
