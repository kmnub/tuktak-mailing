// OpenAI 연락처 추출 전용 래퍼
// 기업명 추출(lib/ai/, lib/crawl/)과 분리된 연락처 전용 모듈

import OpenAI from "openai";

export const CONTACT_PROMPT_VERSION = "contact-v1";

export interface OpenAIContactResult {
  emails: string[];
  telephones: string[];
  rawResponse: string;
  promptVersion: string;
}

export async function extractContactWithOpenAI(
  text: string,
  companyName: string,
  apiKey: string
): Promise<OpenAIContactResult> {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `텍스트에서 ${companyName}의 공식 이메일 주소와 전화번호만 추출하세요.
텍스트에 명확히 있는 값만 반환하고, 추측하거나 생성하지 마세요.
반드시 JSON 형식으로만 응답하세요: {"emails": [], "telephones": []}`,
      },
      {
        role: "user",
        content: text.slice(0, 4000),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 300,
  });

  const rawResponse = completion.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(rawResponse);
    return {
      emails: Array.isArray(parsed.emails)
        ? parsed.emails.filter((e: unknown): e is string => typeof e === "string")
        : [],
      telephones: Array.isArray(parsed.telephones)
        ? parsed.telephones.filter((t: unknown): t is string => typeof t === "string")
        : [],
      rawResponse,
      promptVersion: CONTACT_PROMPT_VERSION,
    };
  } catch {
    return { emails: [], telephones: [], rawResponse, promptVersion: CONTACT_PROMPT_VERSION };
  }
}
