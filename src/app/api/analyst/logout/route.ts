import { NextResponse } from "next/server";
import { clearAnalystSessionCookie } from "@/lib/analyst-auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(clearAnalystSessionCookie());
  return response;
}
