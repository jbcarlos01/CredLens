import { NextResponse } from "next/server";
import { requireAnalyst } from "@/lib/analyst-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        prediction: { include: { factors: { orderBy: { impact: "desc" } } } },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json(application);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const authError = await requireAnalyst();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const status = body.status as "APPROVED" | "REVIEW" | "DECLINED" | undefined;

    if (!status) {
      return NextResponse.json({ error: "Status required" }, { status: 400 });
    }

    const application = await prisma.application.update({
      where: { id },
      data: { status },
      include: { prediction: true },
    });

    await prisma.auditLog.create({
      data: {
        action: "STATUS_UPDATED",
        entity: "Application",
        entityId: id,
        details: `Manual status set to ${status}`,
      },
    });

    return NextResponse.json(application);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
