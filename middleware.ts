import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isBlockedApiCaller, isAllowedApiOrigin } from "@/lib/server/api-origin"

export function middleware(request: NextRequest) {
  if (isBlockedApiCaller(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const origin = request.headers.get("origin")
  if (origin && !isAllowedApiOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
