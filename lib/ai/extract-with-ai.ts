import OpenAI from "openai";
import * as cheerio from "cheerio";

// 텍스트 추출용 — script/style/nav 제거 후 body 텍스트만
function getCleanText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

const SYSTEM_PROMPT = `당신은 박람회·전시회·쇼핑몰 페이지에서 참가기업명과 브랜드명을 추출하는 전문가입니다.

추출 규칙:
1. 실제 회사명·브랜드명·상호명만 추출합니다.
2. 다음 패턴에서 이름을 인식하세요:
   - 「이름」 / 『이름』 / (이름) 형태
   - "백화점 입점 OO", "출품사 OO", "브랜드 OO" 뒤에 오는 이름
   - 제품 제조사 또는 판매사 이름
3. 다음은 반드시 제외하세요:
   - 내비게이션·UI 버튼 텍스트 (로그인, 장바구니, 검색 등)
   - 주소·전화번호·이메일
   - 페이지 설명 문구 ("관람 안내", "참가 안내" 등)
   - 행사명 자체 (메가쇼, 트래블쇼 등 주최측 이름)

반드시 다음 JSON 형식으로만 반환하세요:
{"companies": ["회사명1", "회사명2"]}`;

/**
 * OpenAI GPT를 이용해 HTML에서 기업명을 추출한다.
 * 페이지 텍스트를 15,000자씩 청크로 나눠 처리한다.
 */
export async function extractCompaniesWithAI(
  html: string,
  sourceUrl: string
): Promise<{ name: string; source_url: string }[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");

  const client = new OpenAI({ apiKey });
  const fullText = getCleanText(html);
  if (!fullText) return [];

  // 긴 페이지는 15,000자 청크로 분할
  const CHUNK_SIZE = 15000;
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
    chunks.push(fullText.slice(i, i + CHUNK_SIZE));
  }

  const allNames = new Set<string>();

  for (const chunk of chunks) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: chunk },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        "companies" in parsed &&
        Array.isArray((parsed as { companies: unknown }).companies)
      ) {
        for (const name of (parsed as { companies: unknown[] }).companies) {
          if (typeof name === "string" && name.trim().length > 0) {
            allNames.add(name.trim());
          }
        }
      }
    } catch {
      // JSON 파싱 실패 시 무시
    }
  }

  return Array.from(allNames).map((name) => ({ name, source_url: sourceUrl }));
}
