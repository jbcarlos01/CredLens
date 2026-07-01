import { NextResponse } from "next/server";
import {
  generateAdvisorReply,
  generateAdvisorReplyWithLlm,
  type AdvisorContext,
} from "@/lib/advisor";
import { isAnalystAuthenticated } from "@/lib/analyst-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { applicationId, message } = await request.json();

    if (!applicationId || !message) {
      return NextResponse.json(
        { error: "applicationId and message are required" },
        { status: 400 },
      );
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        prediction: { include: { factors: true } },
        chatSessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { messages: { orderBy: { createdAt: "asc" } } },
        },
      },
    });

    if (!application?.prediction) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    let session = application.chatSessions[0];
    if (!session) {
      session = await prisma.chatSession.create({
        data: { applicationId },
        include: { messages: true },
      });
    }

    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "user", content: message },
    });

    const history = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const context: AdvisorContext = {
      viewerRole: (await isAnalystAuthenticated()) ? "ANALYST" : "APPLICANT",
      applicantName: application.applicantName,
      email: application.email,
      status: application.status,
      age: application.age,
      employmentType: application.employmentType,
      employmentYears: application.employmentYears,
      annualIncome: application.annualIncome,
      loanAmount: application.loanAmount,
      loanTermMonths: application.loanTermMonths,
      existingDebt: application.existingDebt,
      creditHistoryYears: application.creditHistoryYears,
      numCreditInquiries: application.numCreditInquiries,
      hasDelinquency: application.hasDelinquency,
      homeOwnership: application.homeOwnership,
      loanPurpose: application.loanPurpose,
      scoring: {
        defaultProbability: application.prediction.defaultProbability,
        riskTier: application.prediction.riskTier,
        modelVersion: application.prediction.modelVersion,
        factors: application.prediction.factors.map((f) => ({
          feature: f.feature,
          label: f.label,
          impact: f.impact,
          direction: f.direction as "increases" | "decreases",
          value: f.value ?? undefined,
        })),
      },
    };

    const reply =
      (await generateAdvisorReplyWithLlm(message, context, history)) ??
      generateAdvisorReply(message, context, history);

    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: reply },
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
