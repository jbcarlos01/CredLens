import { NextResponse } from "next/server";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      return NextResponse.json({ online: false, modelLoaded: false });
    }
    const data = await response.json();
    return NextResponse.json({
      online: true,
      modelLoaded: Boolean(data.model_loaded),
      url: ML_SERVICE_URL,
    });
  } catch {
    return NextResponse.json({ online: false, modelLoaded: false });
  }
}
