import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  SkipForward,
  Trash2,
  PlayCircle,
  StopCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  LogIn,
  LogOut,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
type TaskStatus = "pending" | "in_progress" | "done" | "skipped";
type TaskPriority = "critical" | "high" | "medium" | "low";

interface ShiftTask {
  id: number;
  taskType: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  entityType?: string | null;
  entityId?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  sortOrder: number;
  createdAt: Date;
}

interface ShiftSession {
  id: number;
  userId: number;
  userName: string;
  warehouseId?: string | null;
  role?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  notes?: string | null;
  tasks: ShiftTask[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SHIFT_ROLES = [
  { value: "picker", label: "Picker" },
  { value: "packer", label: "Packer" },
  { value: "receiver", label: "Receiver" },
  { value: "qc", label: "QC Inspector" },
  { value: "shipping", label: "Shipping" },
  { value: "forklift", label: "Forklift Operator" },
  { value: "supervisor", label: "Supervisor" },
  { value: "returns", label: "Returns" },
  { value: "general", label: "General Labor" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: "Pending", icon: <Circle className="h-4 w-4" />, color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "text-blue-500" },
  done: { label: "Done", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-500" },
  skipped: { label: "Skipped", icon: <SkipForward className="h-4 w-4" />, color: "text-gray-400" },
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "text-red-600 bg-red-50 dark:bg-red-950/40",
  high: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
  medium: "text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30",
  low: "text-gray-500 bg-gray-50 dark:bg-gray-800/40",
};

function formatDuration(startedAt: Date, endedAt?: Date | null): string {
  const end = endedAt ? new Date(endedAt) : new Date();
  const start = new Date(startedAt);
  const ms = end.getTime() - start.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Live Clock Hook ──────────────────────────────────────────────────────────
function useLiveClock(startedAt: Date) {
  const [elapsed, setElapsed] = useState(() => formatDuration(startedAt));
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatDuration(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

// ─── Add Task Dialog ──────────────────────────────────────────────────────────
function AddTaskDialog({
  shiftSessionId,
  onClose,
}: {
  shiftSessionId: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("general");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [description, setDescription] = useState("");

  const addTask = trpc.myShift.addTask.useMutation({
    onSuccess: () => {
      utils.myShift.currentShift.invalidate();
      toast.success("Task added");
      onClose();
    },
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Add Shift Task</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Task Type</label>
          <Select value={taskType} onValueChange={setTaskType}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="allocation">Allocation</SelectItem>
              <SelectItem value="receiving">Receiving</SelectItem>
              <SelectItem value="qc">QC</SelectItem>
              <SelectItem value="shipping">Shipping</SelectItem>
              <SelectItem value="returns">Returns</SelectItem>
              <SelectItem value="exception">Exception</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="h-9"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional details…"
            className="resize-none min-h-[64px] text-sm"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() =>
            addTask.mutate({
              shiftSessionId,
              taskType,
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
            })
          }
          disabled={!title.trim() || addTask.isPending}
        >
          {addTask.isPending ? "Adding…" : "Add Task"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({ task, shiftId: _shiftId }: { task: ShiftTask; shiftId: number }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);

  const updateStatus = trpc.myShift.updateTaskStatus.useMutation({
    onSuccess: () => utils.myShift.currentShift.invalidate(),
    onError: () => toast.error("Failed to update task"),
  });

  const deleteTask = trpc.myShift.deleteTask.useMutation({
    onSuccess: () => {
      utils.myShift.currentShift.invalidate();
      toast.success("Task removed");
    },
  });

  const sm = STATUS_META[task.status];
  const pc = PRIORITY_COLOR[task.priority];
  const isDone = task.status === "done" || task.status === "skipped";

  return (
    <div className={`border-b last:border-b-0 transition-colors ${isDone ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          className={`shrink-0 ${sm.color} hover:scale-110 transition-transform`}
          onClick={() => {
            if (task.status === "pending") updateStatus.mutate({ id: task.id, status: "in_progress" });
            else if (task.status === "in_progress") updateStatus.mutate({ id: task.id, status: "done" });
          }}
          title={task.status === "pending" ? "Start" : task.status === "in_progress" ? "Mark done" : undefined}
          disabled={isDone}
        >
          {sm.icon}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? "line-through" : ""}`}>{task.title}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${pc}`}>
              {task.priority}
            </span>
            <span className="text-[10px] text-muted-foreground">{task.taskType}</span>
          </div>
          {task.description && (
            <button
              className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5 hover:text-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Hide" : "Show"} notes
            </button>
          )}
          {expanded && task.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{task.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task.status === "pending" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-yellow-600"
              onClick={() => updateStatus.mutate({ id: task.id, status: "skipped" })}
              title="Skip"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-500"
            onClick={() => deleteTask.mutate({ id: task.id })}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Active Shift View ────────────────────────────────────────────────────────
function ActiveShiftView({ shift }: { shift: ShiftSession }) {
  const utils = trpc.useUtils();
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);
  const [endNotes, setEndNotes] = useState("");
  const elapsed = useLiveClock(new Date(shift.startedAt));

  const endShift = trpc.myShift.endShift.useMutation({
    onSuccess: () => {
      utils.myShift.currentShift.invalidate();
      utils.myShift.recentShifts.invalidate();
      toast.success("Clocked out — shift ended");
      setShowEndShift(false);
    },
  });

  const tasks = shift.tasks ?? [];
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  const sorted = [...tasks].sort((a, b) => {
    const order = { in_progress: 0, pending: 1, done: 2, skipped: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.sortOrder - b.sortOrder;
  });

  const roleLabel = SHIFT_ROLES.find((r) => r.value === shift.role)?.label ?? shift.role;

  return (
    <div className="space-y-4">
      {/* Clock-in banner */}
      <Card className="border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {/* Live clock */}
              <div className="flex flex-col items-center justify-center bg-green-100 dark:bg-green-900/40 rounded-xl px-4 py-2 min-w-[80px]">
                <Timer className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mb-0.5" />
                <span className="text-xl font-bold tabular-nums text-green-700 dark:text-green-300 leading-none">
                  {elapsed}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">Clocked In</span>
                  {roleLabel && (
                    <Badge variant="outline" className="text-xs">{roleLabel}</Badge>
                  )}
                  {shift.warehouseId && (
                    <Badge variant="secondary" className="text-xs">{shift.warehouseId}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Since {new Date(shift.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {/* Clock Out button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setShowEndShift(true)}
            >
              <LogOut className="h-3.5 w-3.5" />
              Clock Out
            </Button>
          </div>

          {/* Task progress bar */}
          {tasks.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{done}/{tasks.length} tasks done</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                {inProgress > 0 && <span className="text-blue-500">{inProgress} in progress</span>}
                {pending > 0 && <span>{pending} pending</span>}
                {done > 0 && <span className="text-green-600">{done} done</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task list */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Tasks
            {tasks.length > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">{tasks.length}</span>
            )}
          </CardTitle>
          <Button size="sm" className="h-7 gap-1" onClick={() => setShowAddTask(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tasks yet — add one to get started</p>
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map((task) => (
                <TaskRow key={task.id} task={task as ShiftTask} shiftId={shift.id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add task dialog */}
      <Dialog open={showAddTask} onOpenChange={(o) => { if (!o) setShowAddTask(false); }}>
        {showAddTask && (
          <AddTaskDialog shiftSessionId={shift.id} onClose={() => setShowAddTask(false)} />
        )}
      </Dialog>

      {/* Clock Out / End shift dialog */}
      <Dialog open={showEndShift} onOpenChange={(o) => { if (!o) setShowEndShift(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-red-500" />
              Clock Out
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{elapsed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tasks completed</span>
                <span className="font-medium">{done}/{tasks.length}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Handoff Notes (optional)</label>
              <Textarea
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
                placeholder="Any notes for the next shift…"
                className="resize-none min-h-[80px] text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndShift(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={() => endShift.mutate({ id: shift.id, notes: endNotes.trim() || undefined })}
              disabled={endShift.isPending}
            >
              <LogOut className="h-3.5 w-3.5" />
              {endShift.isPending ? "Clocking out…" : "Confirm Clock Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── No Shift View ────────────────────────────────────────────────────────────
function NoShiftView() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [warehouse, setWarehouse] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [customWarehouse, setCustomWarehouse] = useState("");

  const { data: warehouses = [] } = trpc.myShift.warehouses.useQuery();
  const { data: recentShifts = [] } = trpc.myShift.recentShifts.useQuery();

  const startShift = trpc.myShift.startShift.useMutation({
    onSuccess: () => {
      utils.myShift.currentShift.invalidate();
      toast.success("Clocked in — shift started!");
    },
  });

  const effectiveWarehouse = warehouse === "__custom__" ? customWarehouse.trim() : warehouse;

  return (
    <div className="space-y-4">
      {/* Clock In card */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-1">Ready to start?</h2>
            <p className="text-sm text-muted-foreground">
              Select your warehouse and role, then clock in to begin tracking your shift.
            </p>
          </div>

          <div className="max-w-sm mx-auto space-y-3">
            {/* Warehouse selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Warehouse</label>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select warehouse…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh} value={wh}>{wh}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Other / Enter manually…</SelectItem>
                </SelectContent>
              </Select>
              {warehouse === "__custom__" && (
                <Input
                  className="mt-2 h-9 text-sm"
                  placeholder="Warehouse name"
                  value={customWarehouse}
                  onChange={(e) => setCustomWarehouse(e.target.value)}
                />
              )}
            </div>

            {/* Role selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select your role…" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Worker identity confirmation */}
            {user && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px]">
                  {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                </div>
                <span>Clocking in as <strong>{user.name ?? user.email}</strong></span>
              </div>
            )}

            {/* Clock In button */}
            <Button
              className="w-full h-11 gap-2 text-base"
              onClick={() =>
                startShift.mutate({
                  warehouseId: effectiveWarehouse || undefined,
                  role: role || undefined,
                })
              }
              disabled={startShift.isPending}
            >
              {startShift.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {startShift.isPending ? "Clocking in…" : "Clock In"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent shifts */}
      {recentShifts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Recent Shifts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentShifts.map((s) => {
                const roleLabel = SHIFT_ROLES.find((r) => r.value === s.role)?.label ?? s.role;
                return (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{new Date(s.startedAt).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} →{" "}
                        {s.endedAt
                          ? new Date(s.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "ongoing"}
                        {" · "}
                        {formatDuration(s.startedAt, s.endedAt)}
                      </p>
                    </div>
                    <div className="text-right space-y-0.5">
                      {s.warehouseId && <Badge variant="secondary" className="text-xs">{s.warehouseId}</Badge>}
                      {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MyShift() {
  const { data: shift, isLoading } = trpc.myShift.currentShift.useQuery(undefined, {
    refetchInterval: 60000,
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">My Shift</h1>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-40" />
          <p className="text-sm">Loading shift…</p>
        </div>
      ) : shift ? (
        <ActiveShiftView shift={shift as ShiftSession} />
      ) : (
        <NoShiftView />
      )}
    </div>
  );
}
