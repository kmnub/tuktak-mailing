import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function verifySession(token: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const tokenBytes = new Uint8Array(
      token.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      tokenBytes,
      encoder.encode("admin-session")
    );
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 로그인 페이지 및 인증 API는 통과
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("admin_session")?.value;
  const secret = process.env.SESSION_SECRET;

  if (!session || !secret || !(await verifySession(session, secret))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
