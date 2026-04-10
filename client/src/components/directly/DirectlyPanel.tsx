import React, { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { GopherAvatar } from "./GopherAvatar";
import { GopherInterceptCard } from "./GopherInterceptCard";
import {
  X, MessageSquare, Plus, ChevronLeft, Send, Bot,
  Users, Circle, Search, Loader2
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  conversationId: string;
  senderId: number;
  body: string;
  isGopherMessage: boolean;
  createdAt: Date | string;
  sender: { id: number; name: string | null; email: string | null };
}

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  entityType: string | null;
  entityId: string | null;
  lastMessage: Message | null;
  unreadCount: number;
  participants: Array<{
    userId: number;
    name: string | null;
    email: string | null;
    presence: string;
  }>;
}

interface GopherIntercept {
  answer: string;
  category: string;
  confidence: number;
  walkthroughId: string;
  tone: string;
}

// ---------------------------------------------------------------------------
// Presence dot
// ---------------------------------------------------------------------------

function PresenceDot({ status }: { status: string }) {
  const color =
    status === "online" ? "bg-emerald-400" :
    status === "away" ? "bg-amber-400" :
    "bg-slate-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} />;
}

// ---------------------------------------------------------------------------
// Avatar initials
// ---------------------------------------------------------------------------

function UserAvatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const initials = (name ?? "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["bg-indigo-500", "bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-rose-500"];
  const color = colors[(name ?? "").charCodeAt(0) % colors.length];
  return (
    <div
      className={`${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg, isOwn, currentUserId }: { msg: Message; isOwn: boolean; currentUserId: number }) {
  const isGopher = msg.senderId === 0 || msg.isGopherMessage;
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Parse navigate blocks from Gopher messages
  let body = msg.body;
  let navigateTo: { path: string; label: string } | null = null;
  if (isGopher) {
    const navMatch = body.match(/```navigate\s*(\{[^`]+\})\s*```/);
    if (navMatch) {
      try {
        navigateTo = JSON.parse(navMatch[1]);
        body = body.replace(/```navigate\s*\{[^`]+\}\s*```/, "").trim();
      } catch {
        // ignore
      }
    }
  }

  if (isGopher) {
    return (
      <div className="flex gap-2 mb-3">
        <GopherAvatar state="idle" size={28} className="mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-indigo-700">Gopher</span>
            <span className="text-xs text-slate-400">{time}</span>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl rounded-tl-sm px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed max-w-xs">
            {body}
            {navigateTo && (
              <a
                href={navigateTo.path}
                className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <span>→ {navigateTo.label}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isOwn) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-xs">
          <div className="flex items-center justify-end gap-1.5 mb-0.5">
            <span className="text-xs text-slate-400">{time}</span>
            <span className="text-xs font-semibold text-slate-600">You</span>
          </div>
          <div className="bg-indigo-600 text-white rounded-xl rounded-tr-sm px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
            {body}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mb-3">
      <UserAvatar name={msg.sender.name} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-slate-700">{msg.sender.name ?? "Unknown"}</span>
          <span className="text-xs text-slate-400">{time}</span>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl rounded-tl-sm px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed max-w-xs shadow-sm">
          {body}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation list item
// ---------------------------------------------------------------------------

function ConvListItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const isGopherDm = conv.type === "gopher_dm";
  const isEntity = conv.type === "entity";
  const displayName = isGopherDm
    ? "Gopher AI"
    : conv.name
    ?? conv.participants[0]?.name
    ?? (isEntity ? `${conv.entityType} #${conv.entityId}` : "Conversation");

  const lastText = conv.lastMessage?.body?.slice(0, 60) ?? "No messages yet";
  const presence = conv.participants[0]?.presence ?? "offline";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
        isActive ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50 border border-transparent"
      }`}
    >
      {isGopherDm ? (
        <GopherAvatar state="idle" size={36} />
      ) : (
        <div className="relative">
          <UserAvatar name={displayName} size={36} />
          {!isEntity && (
            <span className="absolute -bottom-0.5 -right-0.5">
              <PresenceDot status={presence} />
            </span>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800 truncate">{displayName}</span>
          {conv.unreadCount > 0 && (
            <span className="ml-1 flex-shrink-0 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate mt-0.5">{lastText}</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface DirectlyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialConversationId?: string;
}

export function DirectlyPanel({ isOpen, onClose, initialConversationId }: DirectlyPanelProps) {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "thread" | "new-dm" | "search">("list");
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId ?? null);
  const [composerText, setComposerText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [gopherIntercept, setGopherIntercept] = useState<GopherIntercept | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [gopherState, setGopherState] = useState<"idle" | "thinking">("idle");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();

  // Debounce search query (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Queries
  const convQuery = trpc.directly.listConversations.useQuery(undefined, {
    enabled: isOpen,
    refetchInterval: 5000,
  });
  const messagesQuery = trpc.directly.getMessages.useQuery(
    { conversationId: activeConvId ?? "", limit: 50 },
    { enabled: !!activeConvId && view === "thread", refetchInterval: 3000 }
  );
  const usersQuery = trpc.directly.listUsers.useQuery(undefined, {
    enabled: view === "new-dm",
  });

  // Mutations
  const sendMutation = trpc.directly.sendMessage.useMutation();
  const gopherQueryMutation = trpc.directly.gopherQuery.useMutation();
  const gopherDmMutation = trpc.directly.getGopherDm.useMutation();
  const markReadMutation = trpc.directly.markRead.useMutation();
  const getDmMutation = trpc.directly.getOrCreateDm.useMutation();

  // Search query
  const searchQuery_ = trpc.directly.searchMessages.useQuery(
    { query: debouncedSearchQuery },
    { enabled: view === "search" && debouncedSearchQuery.length >= 2 }
  );

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  // Mark read when opening a thread
  useEffect(() => {
    if (activeConvId && view === "thread") {
      markReadMutation.mutate({ conversationId: activeConvId });
    }
  }, [activeConvId, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open initial conversation
  useEffect(() => {
    if (initialConversationId) {
      setActiveConvId(initialConversationId);
      setView("thread");
    }
  }, [initialConversationId]);

  // Keyboard shortcut Ctrl/Cmd+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const activeConv = convQuery.data?.find((c) => c.id === activeConvId);
  const isGopherDm = activeConv?.type === "gopher_dm";

  const openGopherDm = useCallback(async () => {
    const result = await gopherDmMutation.mutateAsync();
    setActiveConvId(result.conversationId);
    setView("thread");
    utils.directly.listConversations.invalidate();
  }, [gopherDmMutation, utils]);

  const handleSend = async () => {
    if (!composerText.trim() || !activeConvId || isSending) return;
    const msg = composerText.trim();
    setComposerText("");
    setIsSending(true);

    try {
      if (isGopherDm) {
        // Direct Gopher query
        setGopherState("thinking");
        await gopherQueryMutation.mutateAsync({ conversationId: activeConvId, message: msg });
        setGopherState("idle");
        utils.directly.getMessages.invalidate({ conversationId: activeConvId });
        utils.directly.listConversations.invalidate();
      } else {
        // Normal message with Gopher interception
        const result = await sendMutation.mutateAsync({ conversationId: activeConvId, body: msg });
        if (result.intercepted && result.gopher) {
          setPendingMessage(msg);
          setGopherIntercept(result.gopher);
        } else {
          utils.directly.getMessages.invalidate({ conversationId: activeConvId });
          utils.directly.listConversations.invalidate();
        }
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGopherAccepted = (messageId: string) => {
    setGopherIntercept(null);
    setPendingMessage("");
    utils.directly.getMessages.invalidate({ conversationId: activeConvId! });
    utils.directly.listConversations.invalidate();
  };

  const handleGopherRejected = (messageId: string) => {
    setGopherIntercept(null);
    setPendingMessage("");
    utils.directly.getMessages.invalidate({ conversationId: activeConvId! });
    utils.directly.listConversations.invalidate();
  };

  const startDmWithUser = async (userId: number) => {
    const result = await getDmMutation.mutateAsync({ targetUserId: userId });
    setActiveConvId(result.conversationId);
    setView("thread");
    utils.directly.listConversations.invalidate();
  };

  const filteredUsers = usersQuery.data?.filter((u) =>
    !userSearch ||
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  ) ?? [];

  const getConvTitle = () => {
    if (!activeConv) return "Conversation";
    if (activeConv.type === "gopher_dm") return "Gopher AI";
    if (activeConv.name) return activeConv.name;
    if (activeConv.participants[0]?.name) return activeConv.participants[0].name;
    if (activeConv.type === "entity") return `${activeConv.entityType} #${activeConv.entityId}`;
    return "Conversation";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-[360px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex-shrink-0">
        <MessageSquare className="w-4 h-4 flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">Directly</span>
        <span className="text-xs opacity-60 hidden sm:block">⌘⇧D</span>
        <button
          onClick={() => { setView(view === "search" ? "list" : "search"); setSearchQuery(""); }}
          className={`p-1 rounded hover:bg-white/20 transition-colors ${view === "search" ? "bg-white/20" : ""}`}
          title="Search messages"
        >
          <Search className="w-4 h-4" />
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors ml-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* View: Conversation list */}
      {view === "list" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Action row */}
          <div className="flex gap-2 px-3 pt-3 pb-2 flex-shrink-0">
            <button
              onClick={openGopherDm}
              className="flex items-center gap-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
            >
              <GopherAvatar state="waving" size={18} />
              Ask Gopher
            </button>
            <button
              onClick={() => setView("new-dm")}
              className="flex items-center gap-1.5 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg px-2.5 py-1.5 font-medium transition-colors ml-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              New DM
            </button>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {convQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : convQuery.data?.length === 0 ? (
              <div className="text-center py-10 px-4">
                <GopherAvatar state="waving" size={56} className="mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">Welcome to Directly!</p>
                <p className="text-xs text-slate-400 mt-1">Start a conversation or ask Gopher anything.</p>
                <button
                  onClick={openGopherDm}
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  Chat with Gopher
                </button>
              </div>
            ) : (
              convQuery.data?.map((conv) => (
                <ConvListItem
                  key={conv.id}
                  conv={conv as unknown as Conversation}
                  isActive={conv.id === activeConvId}
                  onClick={() => {
                    setActiveConvId(conv.id);
                    setView("thread");
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* View: New DM */}
      {view === "new-dm" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0">
            <button onClick={() => setView("list")} className="p-1 rounded hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-sm font-medium text-slate-700">New Direct Message</span>
          </div>
          <div className="px-3 pt-2 pb-1 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search people..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {usersQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No users found</p>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startDmWithUser(u.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="relative">
                    <UserAvatar name={u.name} size={36} />
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <PresenceDot status={(u as any).presence ?? "offline"} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.name ?? "Unknown"}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email ?? ""}</p>
                  </div>
                  <span className="text-xs text-slate-300 capitalize">{(u as any).presence ?? "offline"}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* View: Thread */}
      {view === "thread" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Thread header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0">
            <button onClick={() => { setView("list"); setGopherIntercept(null); }} className="p-1 rounded hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            {isGopherDm ? (
              <GopherAvatar state={gopherState} size={28} />
            ) : (
              <UserAvatar name={getConvTitle()} size={28} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{getConvTitle()}</p>
              {isGopherDm && (
                <p className="text-xs text-indigo-500">AI Assistant · Always available</p>
              )}
              {!isGopherDm && activeConv?.participants[0] && (
                <div className="flex items-center gap-1">
                  <PresenceDot status={activeConv.participants[0].presence} />
                  <span className="text-xs text-slate-400 capitalize">{activeConv.participants[0].presence}</span>
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {messagesQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : messagesQuery.data?.length === 0 ? (
              <div className="text-center py-8">
                {isGopherDm ? (
                  <>
                    <GopherAvatar state="waving" size={48} className="mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Ask Gopher anything!</p>
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No messages yet. Say hello!</p>
                  </>
                )}
              </div>
            ) : (
              messagesQuery.data?.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg as Message}
                  isOwn={msg.senderId === user?.id}
                  currentUserId={user?.id ?? 0}
                />
              ))
            )}

            {/* Gopher thinking indicator */}
            {gopherState === "thinking" && (
              <div className="flex gap-2 mb-3">
                <GopherAvatar state="thinking" size={28} className="mt-0.5 flex-shrink-0" />
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Gopher intercept card */}
          {gopherIntercept && activeConvId && (
            <GopherInterceptCard
              conversationId={activeConvId}
              originalMessage={pendingMessage}
              answer={gopherIntercept.answer}
              category={gopherIntercept.category}
              confidence={gopherIntercept.confidence}
              walkthroughId={gopherIntercept.walkthroughId}
              tone={gopherIntercept.tone}
              onAccepted={handleGopherAccepted}
              onRejected={handleGopherRejected}
              onDismiss={() => setGopherIntercept(null)}
            />
          )}

          {/* Composer */}
          <div className="border-t border-slate-100 px-3 py-2 flex-shrink-0">
            {isGopherDm && (
              <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                <Bot className="w-3 h-3" />
                Ask Gopher anything about your orders, inventory, or how to use ClearSight
              </p>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={composerRef}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isGopherDm ? "Ask Gopher..." : "Message... (Enter to send, Shift+Enter for newline)"}
                rows={1}
                className="flex-1 resize-none text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-h-[38px] max-h-[120px] overflow-y-auto"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 120) + "px";
                }}
              />
              <button
                onClick={handleSend}
                disabled={!composerText.trim() || isSending}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View: Search */}
      {view === "search" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search input */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search messages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {debouncedSearchQuery.length >= 2 && searchQuery_.data && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                {searchQuery_.data.length === 0
                  ? "No results"
                  : `${searchQuery_.data.length} result${searchQuery_.data.length !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {/* Loading skeleton */}
            {view === "search" && debouncedSearchQuery.length >= 2 && searchQuery_.isLoading && (
              <div className="space-y-2 px-1 pt-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-xl bg-slate-100 h-16" />
                ))}
              </div>
            )}

            {/* Prompt to type */}
            {debouncedSearchQuery.length < 2 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Search className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Type at least 2 characters</p>
                <p className="text-xs mt-1 opacity-70">to search your message history</p>
              </div>
            )}

            {/* Empty state */}
            {debouncedSearchQuery.length >= 2 && !searchQuery_.isLoading && searchQuery_.data?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No messages found</p>
                <p className="text-xs mt-1 opacity-70">Try a different keyword</p>
              </div>
            )}

            {/* Results list */}
            {searchQuery_.data?.map((result) => {
              const convLabel =
                result.conversationName ??
                (result.conversationType === "gopher_dm"
                  ? "Gopher DM"
                  : result.conversationType === "entity"
                  ? `${result.entityType ?? ""} ${result.entityId ?? ""}`
                  : "DM");

              // Highlight keyword in body
              const body = result.body;
              const kw = debouncedSearchQuery;
              const idx = body.toLowerCase().indexOf(kw.toLowerCase());
              let highlighted: React.ReactNode = body;
              if (idx !== -1) {
                highlighted = (
                  <>
                    {body.slice(0, idx)}
                    <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">
                      {body.slice(idx, idx + kw.length)}
                    </mark>
                    {body.slice(idx + kw.length)}
                  </>
                );
              }

              return (
                <button
                  key={result.messageId}
                  onClick={() => {
                    setActiveConvId(result.conversationId);
                    setView("thread");
                    setSearchQuery("");
                  }}
                  className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100 group"
                >
                  {/* Conversation label + sender */}
                  <div className="flex items-center gap-1.5 mb-1">
                    {result.isGopherMessage ? (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">Gopher</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">
                        {result.senderName}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 truncate flex-1">→ {convLabel}</span>
                    <span className="text-[10px] text-slate-300 flex-shrink-0">
                      {new Date(result.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  {/* Message body with highlight */}
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{highlighted}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
