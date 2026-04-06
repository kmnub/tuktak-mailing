import * as cheerio from "cheerio";

// CLAUDE.md §5-2: 제외 키워드 목록 (완전 일치 또는 prefix 일치)
const EXCLUDE_EXACT: Set<string> = new Set([
  // 탐색/접근성
  "본문 바로가기", "주메뉴 바로가기", "사이드메뉴 바로가기", "메뉴 바로가기",
  "바로가기", "주요 메뉴", "스킵 네비게이션",
  "상단으로", "위로 가기", "TOP",
  // 영문 공통 UI
  "HOME", "COMPANY", "AGREEMENT", "PRIVACY POLICY", "GUIDE", "PARTNERSHIP",
  "LOGIN", "JOIN", "CART", "ORDER", "MYPAGE", "COMMUNITY", "BRAND",
  "BOOKMARK", "BOOKMARK +", "QUICK ICON", "BANK INFO", "CS CENTER",
  "Korea", "Skip",
  // 액션
  "더보기", "자세히", "자세히보기", "신청", "참가신청",
  "로그인", "회원가입", "로그아웃", "마이페이지",
  "닫기", "확인", "취소", "이전", "다음", "목록", "전체보기", "뒤로가기",
  // 메뉴/정보
  "공지사항", "문의하기", "개인정보처리방침", "이용약관", "사이트맵",
  "검색", "홈", "메인",
  // 쇼핑몰/커머스 UI
  "장바구니", "상품후기", "최근본상품", "고객센터", "배송조회", "즐겨찾기",
  "인기순", "판매인기순", "낮은가격순", "높은가격순", "상품평많은순",
  // 영문 범용
  "Login", "Register", "Close", "Next", "Prev", "More",
]);

// 포함만 해도 제외할 substring 패턴
const EXCLUDE_CONTAINS = [
  "바로가기",      // 주메뉴 바로가기, 콘텐츠 바로가기 등 모두 제외
  "소개",          // 팔도밥상페어 소개, 트래블쇼 소개 등
  "안내",          // 관람안내, 참가안내 등
  "@",             // 이메일
  "사업자등록번호",
  "통신판매업",
  "개인정보 보호",
  "Copyright",
  "ⓒ", "©",
];

// CLAUDE.md §5-3: 유효한 기업명 검사 (순수 함수)
function isValidCompanyName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (/^[\d\s\-\.]+$/.test(trimmed)) return false;           // 숫자/전화번호만
  if (/[<>{}[\]\\|`~]/.test(trimmed)) return false;          // 특수문자
  if (/^(www\.|http|mailto)/.test(trimmed)) return false;    // URL 형태
  if (/\d{2,4}-\d{3,4}-\d{4}/.test(trimmed)) return false;  // 전화번호 패턴
  if (/\(\d+\)/.test(trimmed)) return false;                 // CART (0) 등

  // ALL_CAPS 짧은 문자열은 UI 버튼 (LOGIN, JOIN 등)
  if (/^[A-Z\s&\+]+$/.test(trimmed) && trimmed.length < 25) return false;

  if (EXCLUDE_EXACT.has(trimmed)) return false;
  if (EXCLUDE_CONTAINS.some((kw) => trimmed.includes(kw))) return false;

  return true;
}

// CLAUDE.md §5-1: 우선 탐색 태그 순서대로 추출 (순수 함수 — fetch 호출 없음)
export function extractCompanies(
  html: string,
  sourceUrl: string
): { name: string; source_url: string; selector: string }[] {
  const $ = cheerio.load(html);

  // 1단계: 명백한 UI 노이즈 영역 제거
  $(
    "nav, header, footer, script, style, noscript," +
    ".gnb, .lnb, .snb, .tnb, .navigation, .sidebar, .side_bar," +
    "#header, #footer, #nav, #gnb, #lnb, #snb," +
    "#footer_wrap, .footer_wrap, .header_wrap," +
    ".floating, .quick_menu, .sticky"
  ).remove();

  // 2단계: 본문 영역 우선 탐색 (없으면 body 전체)
  const $root =
    $("main").length ? $("main") :
    $("[role='main']").length ? $("[role='main']") :
    $("article").length ? $("article") :
    $("#content").length ? $("#content") :
    $(".content").first().length ? $(".content").first() :
    $("body");

  const candidates: { name: string; source_url: string; selector: string }[] = [];

  // h2/h3 우선(헤딩은 섹션 제목), 그 다음 li, a 순
  const selectors = ["h2", "h3", "li", "a"] as const;

  for (const selector of selectors) {
    $root.find(selector).each((_, el) => {
      const text = $(el).clone().children().remove().end().text().trim();
      if (text && isValidCompanyName(text)) {
        candidates.push({ name: text, source_url: sourceUrl, selector });
      }
    });
  }

  return candidates;
}
