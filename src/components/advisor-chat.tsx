"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_QUESTIONS = [
  "Why did I get this risk score?",
  "How can I improve my chances?",
  "What is my debt-to-income ratio?",
  "How was this calculated?",
];

type AdvisorChatProps = {
  applicationId: string;
  applicantName?: string;
  riskTier?: string;
  viewerRole?: "APPLICANT" | "ANALYST";
};

export function AdvisorChat({
  applicationId,
  applicantName,
  riskTier,
  viewerRole = "APPLICANT",
}: AdvisorChatProps) {
  const firstName = applicantName?.split("(")[0].trim().split(" ")[0];
  const greeting = viewerRole === "ANALYST"
    ? `Hello Analyst. I'm Marco, your loan risk advisor. I can walk you through this application's score${riskTier ? ` (${riskTier.toLowerCase().replace("_", " ")} risk)` : ""}, key drivers, and decision rationale.`
    : firstName
    ? `Hi ${firstName}! I'm Marco, your loan advisor. I've reviewed your application${riskTier ? ` (${riskTier.toLowerCase().replace("_", " ")} risk)` : ""} — ask me anything about your score, what it means, or how to improve.`
    : "Hi! I'm Marco, your loan advisor. Ask me about your risk score, approval chances, or how our model works.";
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: greeting },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendText(text: string) {
    if (!text.trim() || loading) return;

    const userMessage = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, message: userMessage }),
      });
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "Sorry, I couldn't process that. Please try again.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong on my end. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    sendText(input);
  }

  return (
    <Card className="flex h-[520px] flex-col border-slate-200/80 bg-white/95 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
            M
          </div>
          <div>
            <CardTitle className="text-base">Marco — Loan Advisor</CardTitle>
            <CardDescription>Credit risk specialist · knows your application</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden pt-0">
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendText(q)}
              disabled={loading}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "rounded-br-md bg-emerald-600 text-white"
                    : "rounded-bl-md border border-slate-100 bg-slate-50 text-slate-800"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Marco is typing...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Marco about your application..."
            className="min-h-[44px] resize-none"
            rows={2}
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()} className="shrink-0 self-end">
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
