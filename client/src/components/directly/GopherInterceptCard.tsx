import React, { useEffect, useState } from "react";
import { GopherAvatar } from "./GopherAvatar";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, BookOpen, ChevronRight } from "lucide-react";

interface GopherInterceptCardProps {
  conversationId: string;
  originalMessage: string;
  answer: string;
  category: string;
  confidence: number;
  walkthroughId?: string;
  tone: string;
  onAccepted: (messageId: string) => void;
  onRejected: (messageId: string) => void;
  onDismiss: () => void;
}

const TIMEOUT_SECONDS = 10;

const categoryLabels: Record<string, string> = {
  order_status: "Order Status",
  inventory: "Inventory",
  shipment: "Shipment",
  sla: "SLA",
  forecast: "Forecast",
  navigation: "Navigation Help",
  report: "Report",
  general: "General",
  none: "Info",
};

export function GopherInterceptCard({
  conversationId,
  originalMessage,
  answer,
  category,
  confidence,
  walkthroughId,
  tone,
  onAccepted,
  onRejected,
  onDismiss,
}: GopherInterceptCardProps) {
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_SECONDS);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, navigate] = useLocation();

  const acceptMutation = trpc.directly.gopherAccept.useMutation();
  const rejectMutation = trpc.directly.gopherReject.useMutation();

  // Countdown timer — auto-accept after TIMEOUT_SECONDS
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAccept();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = async () => {
    const result = await acceptMutation.mutateAsync({
      conversationId,
      answer,
      walkthroughId,
    });
    onAccepted(result.messageId);

    // If there's a walkthrough with a path, navigate there
    if (result.walkthrough?.steps?.[0]?.path) {
      navigate(result.walkthrough.steps[0].path as string);
    }
  };

  const handleReject = async () => {
    const result = await rejectMutation.mutateAsync({
      conversationId,
      originalMessage,
    });
    onRejected(result.messageId);
  };

  const gopherState = tone === "encouraging" ? "celebrating" : category === "navigation" ? "teaching" : "found";

  return (
    <div className="mx-3 mb-2 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white">
        <GopherAvatar state={gopherState} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">Gopher has an answer</p>
          <p className="text-xs opacity-75">{categoryLabels[category] ?? "Info"} · {confidence}% confident</p>
        </div>
        {/* Countdown ring */}
        <div className="relative w-8 h-8 flex-shrink-0">
          <svg viewBox="0 0 32 32" className="w-8 h-8 -rotate-90">
            <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 13}`}
              strokeDashoffset={`${2 * Math.PI * 13 * (1 - timeLeft / TIMEOUT_SECONDS)}`}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{timeLeft}</span>
        </div>
      </div>

      {/* Answer preview */}
      <div className="px-3 py-2">
        <p className="text-xs text-slate-500 mb-1">Gopher's answer:</p>
        <p
          className={`text-sm text-slate-800 leading-relaxed ${!isExpanded && answer.length > 150 ? "line-clamp-3" : ""}`}
        >
          {answer}
        </p>
        {answer.length > 150 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 flex items-center gap-0.5"
          >
            {isExpanded ? "Show less" : "Show more"}
            <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>
        )}

        {walkthroughId && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-100 rounded-md px-2 py-1">
            <BookOpen className="w-3 h-3 flex-shrink-0" />
            <span>Includes step-by-step walkthrough</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-3 pb-3">
        <button
          onClick={handleAccept}
          disabled={acceptMutation.isPending}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-2 transition-colors disabled:opacity-60"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Use Gopher's answer
        </button>
        <button
          onClick={handleReject}
          disabled={rejectMutation.isPending}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-2 transition-colors disabled:opacity-60"
        >
          <XCircle className="w-3.5 h-3.5" />
          Send mine
        </button>
      </div>
    </div>
  );
}
