import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Send, ChevronDown, ChevronUp, AtSign } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

type NoteType = "internal" | "client" | "system" | "decision";

interface NoteTypeMeta {
  label: string;
  color: string;
  bg: string;
}

const NOTE_TYPE_META: Record<NoteType, NoteTypeMeta> = {
  internal: { label: "Internal", color: "text-gray-500", bg: "bg-gray-100" },
  client: { label: "Client", color: "text-blue-600", bg: "bg-blue-50" },
  system: { label: "System", color: "text-purple-600", bg: "bg-purple-50" },
  decision: { label: "Decision", color: "text-amber-700", bg: "bg-amber-50" },
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(date).toLocaleDateString();
}

interface NotesPanelProps {
  entityType: string;
  entityId: string;
  defaultOpen?: boolean;
  className?: string;
}

export function NotesPanel({
  entityType,
  entityId,
  defaultOpen = false,
  className = "",
}: NotesPanelProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("internal");
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);
  const [mentionedUserNames, setMentionedUserNames] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  const { data: notes = [], isLoading } = trpc.notes.list.useQuery(
    { entityType, entityId },
    { enabled: isOpen }
  );

  const { data: allUsers = [] } = trpc.notes.listUsers.useQuery(undefined, {
    enabled: isOpen && !!user,
  });

  const addNote = trpc.notes.add.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate({ entityType, entityId });
      setBody("");
      setMentionedUserIds([]);
      setMentionedUserNames([]);
    },
  });

  const filteredUsers = allUsers.filter(
    (u) =>
      mentionQuery &&
      (u.name?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(mentionQuery.toLowerCase()))
  );

  function handleBodyChange(val: string) {
    setBody(val);
    // Detect @mention trigger
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = val.slice(atIdx + 1);
      if (!query.includes(" ") && query.length > 0) {
        setMentionQuery(query);
        setShowMentionPicker(true);
        return;
      }
    }
    setShowMentionPicker(false);
    setMentionQuery("");
  }

  function selectMention(userId: number, userName: string) {
    const atIdx = body.lastIndexOf("@");
    const newBody = body.slice(0, atIdx) + `@${userName} `;
    setBody(newBody);
    setMentionedUserIds((prev) => Array.from(new Set([...prev, userId])));
    setMentionedUserNames((prev) => Array.from(new Set([...prev, userName])));
    setShowMentionPicker(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  }

  function handleSubmit() {
    if (!body.trim()) return;
    addNote.mutate({
      entityType,
      entityId,
      noteType,
      bodyText: body.trim(),
      mentionedUserIds,
    });
  }

  return (
    <div className={`border border-border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span>Notes</span>
          {notes.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {notes.length}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Body */}
      {isOpen && (
        <div className="flex flex-col gap-0">
          {/* Notes list */}
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {isLoading && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Loading notes…
              </div>
            )}
            {!isLoading && notes.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notes yet. Add the first one below.
              </div>
            )}
            {notes.map((note) => {
              const meta = NOTE_TYPE_META[note.noteType as NoteType] ?? NOTE_TYPE_META.internal;
              return (
                <div
                  key={note.id}
                  className={`px-4 py-3 ${meta.bg}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">
                        {note.authorName ?? "System"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1 py-0 ${meta.color} border-current`}
                      >
                        {meta.label}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                      {formatRelativeTime(note.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {note.bodyText}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Compose area */}
          {user && (
            <div className="border-t border-border p-3 bg-background">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  placeholder="Add a note… (type @ to mention someone)"
                  className="text-sm resize-none min-h-[72px] pr-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <AtSign className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />

                {/* Mention picker */}
                {showMentionPicker && filteredUsers.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
                    {filteredUsers.slice(0, 6).map((u) => (
                      <button
                        key={u.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectMention(u.id, u.name ?? u.email ?? `user-${u.id}`);
                        }}
                      >
                        {u.name ?? u.email}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-2 gap-2">
                <Select
                  value={noteType}
                  onValueChange={(v) => setNoteType(v as NoteType)}
                >
                  <SelectTrigger className="h-7 text-xs w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="decision">Decision</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground hidden sm:block">
                    ⌘↵ to send
                  </span>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleSubmit}
                    disabled={!body.trim() || addNote.isPending}
                  >
                    <Send className="h-3 w-3" />
                    {addNote.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>

              {mentionedUserNames.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Mentioning: {mentionedUserNames.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
