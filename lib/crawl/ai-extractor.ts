import OpenAI from "openai";

const SYSTEM_PROMPT = `아래 텍스트에서 기업명만 추출해라.
쇼핑몰, 블로그, 뉴스 사이트 이름은 제외해라.
내비게이션 메뉴, 버튼 텍스트, 주소, 전화번호는 제외해라.
반드시 JSON 형식으로만 반환해라: {"companies": ["기업명1", "기업명2"]}`;

/**
 * HTML → Playwright 모두 실패했을 때 최후 수단으로 사용하는 AI 추출기.
 * extract-with-ai.ts(사용자 체크박스용)와 달리 짧고 단순한 프롬프트를 사용한다.
 * 입력 텍스트는 최대 10,000자로 제한한다.
 */
export async function extractCompaniesAI(
  text: string,
  sourceUrl: string
): Promise<{ name: string; source_url: string; selector: string }[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 10000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed: unknown = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      "companies" in parsed &&
      Array.isArray((parsed as { companies: unknown }).companies)
    ) {
      return (parsed as { companies: unknown[] }).companies
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((name) => ({ name: name.trim(), source_url: sourceUrl, selector: "ai" }));
    }
  } catch (err) {
    console.error("[AI fallback 오류]", err);
  }

  return [];
}
