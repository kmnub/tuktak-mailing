import * as cheerio from "cheerio";

// CLAUDE.md §5-2: 제외 키워드 목록
const EXCLUDE_KEYWORDS = [
  "더보기",
  "자세히",
  "자세히보기",
  "신청",
  "참가신청",
  "로그인",
  "회원가입",
  "로그아웃",
  "마이페이지",
  "닫기",
  "확인",
  "취소",
  "이전",
  "다음",
  "목록",
  "전체보기",
  "뒤로가기",
  "공지사항",
  "문의하기",
  "개인정보처리방침",
  "이용약관",
  "사이트맵",
  "검색",
  "홈",
  "메인",
  "TOP",
  "Login",
  "Register",
  "Close",
  "Next",
  "Prev",
  "More",
];

// CLAUDE.md §5-3: 유효한 기업명 검사 (순수 함수)
function isValidCompanyName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (/^[\d\s]+$/.test(trimmed)) return false; // 숫자만
  if (/[<>{}[\]\\|`~]/.test(trimmed)) return false; // 특수문자
  if (/^(www\.|http|mailto)/.test(trimmed)) return false; // URL 형태
  if (EXCLUDE_KEYWORDS.some((kw) => trimmed.includes(kw))) return false;
  return true;
}

// CLAUDE.md §5-1: 우선 탐색 태그 순서대로 추출 (순수 함수 — fetch 호출 없음)
export function extractCompanies(
  html: string,
  sourceUrl: string
): { name: string; source_url: string }[] {
  const $ = cheerio.load(html);
  const candidates: { name: string; source_url: string }[] = [];

  // 우선순위 순서: a → h2 → h3 → li
  const selectors = ["a", "h2", "h3", "li"] as const;

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      // 자식 요소 제외하고 직접 텍스트만 추출 (노이즈 방지)
      const text = $(el).clone().children().remove().end().text().trim();

      if (text && isValidCompanyName(text)) {
        candidates.push({ name: text, source_url: sourceUrl });
      }
    });
  }

  return candidates;
}
