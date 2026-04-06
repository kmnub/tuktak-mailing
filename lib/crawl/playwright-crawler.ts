const TIMEOUT = 30000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Playwright(Chromium)로 페이지를 렌더링한 뒤 HTML을 반환한다.
 * - networkidle 이후 스크롤 + "더보기" 클릭까지 시도한다.
 * - 실패 시 null 반환 (fetch fallback과 동일한 인터페이스).
 *
 * 동적 임포트를 사용하는 이유: Next.js 번들러가 playwright 네이티브 바이너리를
 * 클라이언트 번들에 포함하려는 시도를 막기 위해서다. next.config.ts에
 * serverExternalPackages: ["playwright"] 가 함께 설정돼야 한다.
 */
export async function fetchWithPlaywright(url: string): Promise<string | null> {
  try {
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: "ko-KR",
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: "networkidle", timeout: TIMEOUT });

      // lazy-load 콘텐츠 유도 스크롤
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight / 2)
      );
      await page.waitForTimeout(800);
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await page.waitForTimeout(800);

      // "더보기" 버튼 클릭 시도
      const buttons = await page.locator("button, a").all();
      for (const btn of buttons) {
        const text = await btn.textContent().catch(() => "");
        if (text && /더\s*보기|더보기|load\s*more/i.test(text)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[Playwright 오류]", err);
    return null;
  }
}
