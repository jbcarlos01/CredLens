import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAnalyst } from "@/lib/analyst-auth";
import { prisma } from "@/lib/prisma";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  status: z.enum(["APPROVED", "DECLINED"]),
});

export async function PATCH(request: Request) {
  const authError = await requireAnalyst();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const { ids, status } = parsed.data;

    const result = await prisma.application.updateMany({
      where: {
        id: { in: ids },
        status: "REVIEW",
      },
      data: { status },
    });

    if (result.count > 0) {
      await prisma.auditLog.create({
        data: {
          action: "BULK_STATUS_UPDATED",
          entity: "Application",
          details: `${result.count} application(s) set to ${status}`,
        },
      });
    }

    return NextResponse.json({ updated: result.count, status });
  } catch {
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}
