// 서버 전용 환경변수 로더
// 클라이언트 코드에서 import 금지

export type ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
  FIRECRAWL_API_KEY: string;
  SERPER_API_KEY: string;
};

export function getServerEnv(): ServerEnv {
  const vars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    SERPER_API_KEY: process.env.SERPER_API_KEY,
  };

  const missing = (Object.entries(vars) as [keyof typeof vars, string | undefined][])
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`필수 서버 환경변수 누락: ${missing.join(", ")}`);
  }

  return vars as ServerEnv;
}
