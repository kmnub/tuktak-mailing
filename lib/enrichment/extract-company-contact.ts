import * as cheerio from "cheerio";
import { scrapeWithFirecrawl } from "@/lib/integrations/firecrawl";

export interface ContactResult {
  homepageUrl: string;
  emails: string[];
  telephones: string[];
  sourceUrls: string[];
  extractionMethods: string[];
  confidence: number;
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g;

// 유효하지 않은 이메일 필터 (이미지 파일명, 예시 등)
const EMAIL_BLACKLIST = ["example", "sentry", "wixpress", "@2x", ".png", ".jpg", ".gif"];

function buildContactPages(baseUrl: string): string[] {
  try {
    const u = new URL(baseUrl);
    const origin = `${u.protocol}//${u.host}`;
    return [
      baseUrl,
      `${origin}/contact`,
      `${origin}/about`,
      `${origin}/company`,
      `${origin}/about-us`,
      `${origin}/contact-us`,
    ];
  } catch {
    return [baseUrl];
  }
}

// 1순위: JSON-LD schema.org 추출
function fromJsonLd(html: string): { emails: string[]; phones: string[] } {
  const $ = cheerio.load(html);
  const emails: string[] = [];
  const phones: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const nodes = JSON.parse($(el).html() ?? "{}");
      const arr: unknown[] = Array.isArray(nodes) ? nodes : [nodes];
      for (const node of arr) {
        if (!node || typeof node !== "object") continue;
        const n = node as Record<string, unknown>;

        if (typeof n.email === "string" && n.email) emails.push(n.email);
        if (typeof n.telephone === "string" && n.telephone) phones.push(n.telephone);

        // ContactPoint
        const cp = n.contactPoint;
        if (cp && typeof cp === "object") {
          const c = cp as Record<string, unknown>;
          if (typeof c.email === "string" && c.email) emails.push(c.email);
          if (typeof c.telephone === "string" && c.telephone) phones.push(c.telephone);
        }
      }
    } catch {
      // JSON 파싱 실패 무시
    }
  });

  return { emails, phones };
}

// 2순위: mailto: / tel: 링크 추출
function fromLinks(html: string): { emails: string[]; phones: string[] } {
  const $ = cheerio.load(html);
  const emails: string[] = [];
  const phones: string[] = [];

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const email = href.replace("mailto:", "").split("?")[0].trim();
    if (email) emails.push(email);
  });

  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const tel = href.replace("tel:", "").trim();
    if (tel) phones.push(tel);
  });

  return { emails, phones };
}

// 3순위: 본문 regex 추출 (가장 낮은 신뢰도)
function fromRegex(html: string): { emails: string[]; phones: string[] } {
  const $ = cheerio.load(html);
  $("script, style, nav, header, noscript").remove();
  const text = $("body").text();

  const emails = [...new Set(text.match(EMAIL_RE) ?? [])].filter(
    (e) => !EMAIL_BLACKLIST.some((b) => e.toLowerCase().includes(b))
  );
  const phones = [...new Set(text.match(PHONE_RE) ?? [])];

  return { emails, phones };
}

async function fetchBasic(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function processPage(
  url: string,
  firecrawlApiKey: string
): Promise<{
  emails: Set<string>;
  phones: Set<string>;
  methods: string[];
  fetched: boolean;
  html: string | null;
}> {
  let html: string | null = null;
  const methods: string[] = [];

  const fc = await scrapeWithFirecrawl(url, firecrawlApiKey);
  if (fc?.html) {
    html = fc.html;
    methods.push("firecrawl");
  } else {
    html = await fetchBasic(url);
    if (html) methods.push("fetch");
  }

  if (!html) return { emails: new Set(), phones: new Set(), methods: [], fetched: false, html: null };

  const emails = new Set<string>();
  const phones = new Set<string>();

  // JSON-LD (1순위)
  const jsonLd = fromJsonLd(html);
  jsonLd.emails.forEach((e) => emails.add(e));
  jsonLd.phones.forEach((p) => phones.add(p));
  if (jsonLd.emails.length || jsonLd.phones.length) methods.push("json-ld");

  // links (2순위)
  const links = fromLinks(html);
  links.emails.forEach((e) => emails.add(e));
  links.phones.forEach((p) => phones.add(p));
  if (links.emails.length || links.phones.length) methods.push("links");

  // regex (3순위) — 앞서 수집 실패 시만 시도
  if (emails.size === 0 && phones.size === 0) {
    const regex = fromRegex(html);
    regex.emails.forEach((e) => emails.add(e));
    regex.phones.forEach((p) => phones.add(p));
    if (regex.emails.length || regex.phones.length) methods.push("regex");
  }

  return { emails, phones, methods, fetched: true, html };
}

export async function extractCompanyContact(
  homepageUrl: string,
  firecrawlApiKey: string
): Promise<ContactResult & { firstPageHtml: string | null }> {
  const pages = buildContactPages(homepageUrl);
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const sourceUrls: string[] = [];
  const allMethods: string[] = [];
  let firstPageHtml: string | null = null;

  for (const pageUrl of pages) {
    const result = await processPage(pageUrl, firecrawlApiKey);

    if (pageUrl === homepageUrl) firstPageHtml = result.html;

    if (result.emails.size > 0 || result.phones.size > 0) {
      result.emails.forEach((e) => allEmails.add(e));
      result.phones.forEach((p) => allPhones.add(p));
      sourceUrls.push(pageUrl);
      result.methods.forEach((m) => {
        if (!allMethods.includes(m)) allMethods.push(m);
      });
    }

    // 이메일·전화 모두 확보되면 조기 종료
    if (allEmails.size > 0 && allPhones.size > 0) break;
  }

  const emails = [...allEmails];
  const telephones = [...allPhones];

  const hasHighConfidence =
    allMethods.includes("json-ld") || allMethods.includes("links");
  const confidence =
    emails.length > 0 || telephones.length > 0
      ? hasHighConfidence
        ? 0.85
        : 0.5
      : 0;

  return {
    homepageUrl,
    emails,
    telephones,
    sourceUrls,
    extractionMethods: allMethods,
    confidence,
    firstPageHtml,
  };
}
