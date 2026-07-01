import { NextResponse } from "next/server";
import {
  createAnalystSessionCookie,
  verifyAnalystPassword,
} from "@/lib/analyst-auth";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password || !verifyAnalystPassword(password)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(createAnalystSessionCookie());
    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
