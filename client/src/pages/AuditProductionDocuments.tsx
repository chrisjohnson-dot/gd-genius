import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSearch,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTransactionIds(raw: string): number[] {
  return raw
    .split(/[\s,;|\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

type DocType = "extensiv" | "genius";

interface DocTypeOption {
  id: DocType;
  label: string;
  description: string;
  endpoint: string;
  filename: string;
}

const DOC_TYPE_OPTIONS: DocTypeOption[] = [
  {
    id: "extensiv",
    label: "Extensiv Pick Tickets",
    description:
      "Reproduces the Extensiv (3PL Central) pick ticket layout — customer header, transaction #, barcode, ship-to block, lot/location detail rows, and signature block.",
    endpoint: "/api/pdf/extensiv-pick-tickets",
    filename: "extensiv-pick-tickets-audit",
  },
  {
    id: "genius",
    label: "Genius Pick Tickets",
    description:
      "Generates pick tickets in the GD Genius format — branded header, structured metadata grid, and colour-coded item table.",
    endpoint: "/api/pdf/audit-pick-tickets",
    filename: "genius-pick-tickets-audit",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditProductionDocuments() {
  const [rawInput, setRawInput]       = useState("");
  const [parsedIds, setParsedIds]     = useState<number[]>([]);
  const [docType, setDocType]         = useState<DocType>("extensiv");
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<Array<{ transactionId: number; error: string }>>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  function handleInputChange(value: string) {
    setRawInput(value);
    setParsedIds(parseTransactionIds(value));
    setDownloadUrl(null);
    setGenError(null);
    setGenWarnings([]);
  }

  function removeId(id: number) {
    const remaining = parsedIds.filter((x) => x !== id);
    setParsedIds(remaining);
    setRawInput(remaining.join("\n"));
    setDownloadUrl(null);
  }

  async function handleGenerate() {
    if (parsedIds.length === 0) return;
    setGenerating(true);
    setGenError(null);
    setGenWarnings([]);
    setDownloadUrl(null);

    const option = DOC_TYPE_OPTIONS.find((o) => o.id === docType)!;

    try {
      const resp = await fetch(option.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ transactionIds: parsedIds.slice(0, 50) }),
      });

      if (!resp.ok) {
        let msg = `Server error ${resp.status}`;
        try {
          const json = await resp.json() as { error?: string };
          msg = json.error ?? msg;
        } catch { /* ignore */ }
        setGenError(msg);
        return;
      }

      const warningsHeader = resp.headers.get("X-Audit-Errors");
      if (warningsHeader) {
        try {
          setGenWarnings(JSON.parse(warningsHeader) as Array<{ transactionId: number; error: string }>);
        } catch { /* ignore */ }
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${option.filename}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = parsedIds.length > 0 && !generating;
  const selectedOption = DOC_TYPE_OPTIONS.find((o) => o.id === docType)!;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Production Documents</h1>
          <p className="text-sm text-muted-foreground">
            Reproduce pick tickets with an <span className="font-semibold text-red-600">AUDIT</span> watermark
          </p>
        </div>
      </div>

      <Separator />

      {/* Step 1 — Choose document type */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            Select Document Type
          </CardTitle>
          <CardDescription>
            Choose which pick ticket format to reproduce.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DOC_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { setDocType(opt.id); setDownloadUrl(null); setGenError(null); }}
                className={cn(
                  "text-left rounded-lg border-2 px-4 py-3 transition-all",
                  docType === opt.id
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                    : "border-border hover:border-blue-400 hover:bg-muted/40"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded-full border-2 flex-shrink-0",
                      docType === opt.id
                        ? "border-blue-600 bg-blue-600"
                        : "border-muted-foreground"
                    )}
                  />
                  <span className={cn(
                    "text-sm font-semibold",
                    docType === opt.id ? "text-blue-700 dark:text-blue-400" : "text-foreground"
                  )}>
                    {opt.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                  {opt.description}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Enter Transaction IDs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            Enter Transaction IDs
          </CardTitle>
          <CardDescription>
            Paste one or more Transaction IDs — separated by commas, spaces, or new lines. Maximum 50 per PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className={cn(
              "w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            )}
            placeholder={"12345\n67890\n11223, 44556"}
            value={rawInput}
            onChange={(e) => handleInputChange(e.target.value)}
          />

          {parsedIds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                {parsedIds.length} transaction ID{parsedIds.length !== 1 ? "s" : ""} detected
                {parsedIds.length > 50 && (
                  <span className="ml-2 text-orange-500 font-semibold">
                    (only the first 50 will be included)
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {parsedIds.slice(0, 50).map((id) => (
                  <Badge key={id} variant="secondary" className="gap-1 pr-1 font-mono text-xs">
                    {id}
                    <button
                      onClick={() => removeId(id)}
                      className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {rawInput && (
            <button
              onClick={() => handleInputChange("")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </CardContent>
      </Card>

      {/* Step 3 — Generate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
            Generate Audit PDF
          </CardTitle>
          <CardDescription>
            Fetches each order from Extensiv and renders a{" "}
            <span className="font-medium text-foreground">{selectedOption.label}</span> PDF with an AUDIT watermark on every page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <FileSearch className="h-4 w-4" />
                Generate {selectedOption.label} PDF
              </>
            )}
          </Button>

          {genError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{genError}</span>
            </div>
          )}

          {genWarnings.length > 0 && (
            <div className="rounded-lg border border-orange-300/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {genWarnings.length} transaction ID{genWarnings.length !== 1 ? "s" : ""} could not be retrieved
              </p>
              <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-0.5 ml-5 list-disc">
                {genWarnings.map((w) => (
                  <li key={w.transactionId}>
                    <span className="font-mono font-semibold">{w.transactionId}</span>: {w.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {downloadUrl && !genError && (
            <div className="flex items-center gap-3 rounded-lg border border-green-300/40 bg-green-50 dark:bg-green-950/20 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  PDF generated successfully
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  Your download should have started automatically.
                </p>
              </div>
              <a
                ref={downloadLinkRef}
                href={downloadUrl}
                download={`${selectedOption.filename}-${Date.now()}.pdf`}
                className="shrink-0"
              >
                <Button variant="outline" size="sm" className="gap-1.5 border-green-400 text-green-700 hover:bg-green-100">
                  <Download className="h-3.5 w-3.5" />
                  Re-download
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
