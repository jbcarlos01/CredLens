import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ANALYST_COOKIE = "risklens_analyst_session";
const SESSION_VALUE = "authenticated";

export function getAnalystPassword() {
  return process.env.ANALYST_PASSWORD ?? "analyst";
}

export function verifyAnalystPassword(password: string) {
  return password === getAnalystPassword();
}

export async function isAnalystAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get(ANALYST_COOKIE)?.value === SESSION_VALUE;
}

export function analystUnauthorized() {
  return NextResponse.json({ error: "Analyst authentication required" }, { status: 401 });
}

export async function requireAnalyst() {
  if (!(await isAnalystAuthenticated())) {
    return analystUnauthorized();
  }
  return null;
}

export function analystSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  };
}

export function createAnalystSessionCookie() {
  return {
    name: ANALYST_COOKIE,
    value: SESSION_VALUE,
    ...analystSessionCookieOptions(),
  };
}

export function clearAnalystSessionCookie() {
  return {
    name: ANALYST_COOKIE,
    value: "",
    ...analystSessionCookieOptions(),
    maxAge: 0,
  };
}
