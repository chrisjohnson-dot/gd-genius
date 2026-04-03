import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  Search,
  Tag,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

type LabelType = "ucc128" | "fba" | "other";

const LABEL_TYPE_LABELS: Record<LabelType, string> = {
  ucc128: "UCC-128",
  fba: "FBA",
  other: "Other",
};

const LABEL_TYPE_COLORS: Record<LabelType, string> = {
  ucc128: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  fba: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function LabelFiles() {
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [uploadBarcode, setUploadBarcode] = useState("");
  const [uploadBatch, setUploadBatch] = useState("");
  const [uploadClient, setUploadClient] = useState("");
  const [uploadType, setUploadType] = useState<LabelType>("ucc128");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading, refetch } = trpc.labelScan.listLabelFiles.useQuery({
    batchName: batchFilter || undefined,
  });

  const deleteMutation = trpc.labelScan.deleteLabelFile.useMutation({
    onSuccess: () => {
      toast.success("Label file deleted");
      refetch();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const uploadMutation = trpc.labelScan.uploadLabelFile.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
  });

  // Get unique batch names for filter
  const batchNames = Array.from(new Set(files.map((f) => f.batchName).filter(Boolean))) as string[];

  // Filter by search
  const filtered = files.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.barcode.toLowerCase().includes(q) ||
      f.filename.toLowerCase().includes(q) ||
      (f.clientName ?? "").toLowerCase().includes(q) ||
      (f.batchName ?? "").toLowerCase().includes(q)
    );
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (!selectedFiles.length) return;

    setIsUploading(true);
    setUploadedCount(0);
    let successCount = 0;

    for (const file of selectedFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        const b64 = btoa(binary);

        // Derive barcode from filename (strip extension)
        const barcodeFromFile = file.name.replace(/\.[^.]+$/, "");
        const barcode = selectedFiles.length === 1 && uploadBarcode.trim()
          ? uploadBarcode.trim()
          : barcodeFromFile;

        await uploadMutation.mutateAsync({
          barcode,
          filename: file.name,
          fileBase64: b64,
          batchName: uploadBatch.trim() || undefined,
          clientName: uploadClient.trim() || undefined,
          labelType: uploadType,
        });
        successCount++;
        setUploadedCount(successCount);
      } catch {
        // individual error already toasted by mutation
      }
    }

    setIsUploading(false);
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} label file${successCount > 1 ? "s" : ""}`);
      setUploadBarcode("");
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
    refetch();
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" />
          Label Files
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage ZPL label files used by the QC Scan &amp; Label module. Files are matched to cartons by barcode.
        </p>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Label Files
          </CardTitle>
          <CardDescription>
            Upload one or more .zpl files. Each file's name (without extension) is used as the matching barcode unless you specify one below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Batch Name</Label>
              <Input
                placeholder="e.g. Walmart-PO-4821"
                value={uploadBatch}
                onChange={(e) => setUploadBatch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Name</Label>
              <Input
                placeholder="e.g. Walmart"
                value={uploadClient}
                onChange={(e) => setUploadClient(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Label Type</Label>
              <Select value={uploadType} onValueChange={(v) => setUploadType(v as LabelType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ucc128">UCC-128</SelectItem>
                  <SelectItem value="fba">FBA</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Barcode Override (single file only)</Label>
              <Input
                placeholder="Leave blank to use filename"
                value={uploadBarcode}
                onChange={(e) => setUploadBarcode(e.target.value)}
              />
            </div>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading {uploadedCount} files…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select .zpl files</p>
                <p className="text-xs text-muted-foreground">Multiple files supported — each filename becomes the barcode</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zpl,.txt"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Uploaded Files
              <Badge variant="secondary">{files.length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by barcode, filename, client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {batchNames.length > 0 && (
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All batches</SelectItem>
                  {batchNames.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <Tag className="h-8 w-8 opacity-30" />
              <p className="text-sm">{files.length === 0 ? "No label files uploaded yet" : "No files match your search"}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((file) => (
                <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{file.barcode}</span>
                      <Badge
                        className={`text-xs px-1.5 py-0 ${LABEL_TYPE_COLORS[file.labelType as LabelType] ?? LABEL_TYPE_COLORS.other}`}
                        variant="secondary"
                      >
                        {LABEL_TYPE_LABELS[file.labelType as LabelType] ?? file.labelType}
                      </Badge>
                      {file.batchName && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {file.batchName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {file.filename}
                      {file.clientName ? ` — ${file.clientName}` : ""}
                      {file.uploadedBy ? ` — uploaded by ${file.uploadedBy}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      onClick={() => {
                        if (confirm(`Delete label for barcode "${file.barcode}"?`)) {
                          deleteMutation.mutate({ id: file.id });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
