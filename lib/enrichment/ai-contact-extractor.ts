// OpenAI 기반 연락처 추출 fallback
// 반드시 Firecrawl + 기본 파싱이 실패했을 때만 실행할 것
// AI 결과는 무조건 is_verified: false

import * as cheerio from "cheerio";
import { extractContactWithOpenAI } from "@/lib/integrations/openai";

export interface AIContactResult {
  emails: string[];
  telephones: string[];
  sourceUrl: string;
  rawResponse: string;
  promptVersion: string;
  isVerified: false; // 항상 false — 자동 확정 금지
}

function getCleanText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, noscript").remove();
  $("div,p,td,th,li,br,h1,h2,h3,h4,h5,h6,span,a,strong,b,em,i,label,dd,dt").before(" ");
  return $("body").text().replace(/\s+/g, " ").trim();
}

export async function extractContactWithAI(
  html: string,
  companyName: string,
  sourceUrl: string,
  openaiApiKey: string
): Promise<AIContactResult> {
  const text = getCleanText(html);
  const result = await extractContactWithOpenAI(text, companyName, openaiApiKey);

  return {
    emails: result.emails,
    telephones: result.telephones,
    sourceUrl,
    rawResponse: result.rawResponse,
    promptVersion: result.promptVersion,
    isVerified: false,
  };
}
