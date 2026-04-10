import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  Search,
  Tag,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Building2,
  Hash,
  MapPin,
  Package,
} from "lucide-react";
import { toast } from "sonner";

type LabelType = "ucc128" | "fba" | "other";

const LABEL_TYPE_LABELS: Record<LabelType, string> = {
  ucc128: "UCC-128",
  fba: "FBA",
  other: "Other",
};

const LABEL_TYPE_COLORS: Record<LabelType, string> = {
  ucc128: "bg-blue-100 text-blue-700",
  fba: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-700",
};

type OrderInfo = {
  transactionId: string;
  orderRef: string;
  clientName: string;
  expectedCartons?: number;
  poNum?: string;
  shipToName: string;
};

export default function LabelFiles() {
  const [search, setSearch] = useState("");
  const [uploadBarcode, setUploadBarcode] = useState("");
  const [uploadType, setUploadType] = useState<LabelType>("ucc128");
  const [uploadTransactionId, setUploadTransactionId] = useState("");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading, refetch } = trpc.labelScan.listLabelFiles.useQuery({});

  const deleteMutation = trpc.labelScan.deleteLabelFile.useMutation({
    onSuccess: () => {
      toast.success("Label file deleted");
      refetch();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const uploadMutation = trpc.labelScan.uploadLabelFile.useMutation({
    onSuccess: () => { refetch(); },
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
  });

  const lookupMutation = trpc.labelScan.lookupOrderByTransactionId.useMutation({
    onSuccess: (data) => {
      setOrderInfo(data);
      setLookupError(null);
    },
    onError: (err) => {
      setOrderInfo(null);
      setLookupError(err.message);
    },
  });

  // Trigger lookup when user presses Enter in the transaction ID field
  function handleTransactionIdKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && uploadTransactionId.trim()) {
      handleLookup();
    }
  }

  function handleLookup() {
    const id = uploadTransactionId.trim();
    if (!id) return;
    setOrderInfo(null);
    setLookupError(null);
    lookupMutation.mutate({ transactionId: id });
  }

  function handleTransactionIdChange(val: string) {
    setUploadTransactionId(val);
    // Clear order info if user edits the ID
    if (orderInfo && val.trim() !== orderInfo.transactionId) {
      setOrderInfo(null);
      setLookupError(null);
    }
  }

  // Filter by search
  const filtered = files.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.barcode.toLowerCase().includes(q) ||
      f.filename.toLowerCase().includes(q) ||
      (f.clientName ?? "").toLowerCase().includes(q) ||
      (f.extensivTransactionId ?? "").toLowerCase().includes(q) ||
      (f.orderRef ?? "").toLowerCase().includes(q)
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

        const barcodeFromFile = file.name.replace(/\.[^.]+$/, "");
        const barcode = selectedFiles.length === 1 && uploadBarcode.trim()
          ? uploadBarcode.trim()
          : barcodeFromFile;

        await uploadMutation.mutateAsync({
          barcode,
          filename: file.name,
          fileBase64: b64,
          labelType: uploadType,
          extensivTransactionId: uploadTransactionId.trim() || undefined,
          clientName: orderInfo?.clientName || undefined,
          orderRef: orderInfo?.orderRef || undefined,
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
            Enter the Extensiv Transaction ID to auto-fill order details, then upload one or more .zpl files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Extensiv Transaction ID with lookup */}
          <div className="space-y-1.5">
            <Label>Extensiv Transaction ID</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 12345678 — press Enter to look up order"
                value={uploadTransactionId}
                onChange={(e) => handleTransactionIdChange(e.target.value)}
                onKeyDown={handleTransactionIdKeyDown}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleLookup}
                disabled={!uploadTransactionId.trim() || lookupMutation.isPending}
                className="shrink-0 gap-1.5 bg-white"
              >
                {lookupMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
                Look Up
              </Button>
            </div>
          </div>

          {/* Order info chips — shown after successful lookup */}
          {orderInfo && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Order found
              </div>
              <div className="flex flex-wrap gap-3">
                {orderInfo.clientName && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Building2 className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-medium">{orderInfo.clientName}</span>
                  </div>
                )}
                {orderInfo.orderRef && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Hash className="h-3.5 w-3.5 text-gray-400" />
                    <span>Ref: <span className="font-mono font-medium">{orderInfo.orderRef}</span></span>
                  </div>
                )}
                {orderInfo.poNum && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Package className="h-3.5 w-3.5 text-gray-400" />
                    <span>PO: <span className="font-mono font-medium">{orderInfo.poNum}</span></span>
                  </div>
                )}
                {orderInfo.shipToName && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    <span>{orderInfo.shipToName}</span>
                  </div>
                )}
                {orderInfo.expectedCartons != null && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Tag className="h-3.5 w-3.5 text-gray-400" />
                    <span>{orderInfo.expectedCartons} carton{orderInfo.expectedCartons !== 1 ? "s" : ""} expected</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lookup error */}
          {lookupError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}

          {/* Label Type + Barcode Override */}
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
              <Label>Barcode Override <span className="text-muted-foreground font-normal">(single file only)</span></Label>
              <Input
                placeholder="Leave blank to use filename"
                value={uploadBarcode}
                onChange={(e) => setUploadBarcode(e.target.value)}
              />
            </div>
          </div>

          {/* Drop zone */}
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

          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by barcode, filename, client, transaction ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
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
                      {file.extensivTransactionId && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                          TX#{file.extensivTransactionId}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {file.filename}
                      {file.clientName ? ` — ${file.clientName}` : ""}
                      {file.orderRef ? ` — ${file.orderRef}` : ""}
                      {file.uploadedBy ? ` — ${file.uploadedBy}` : ""}
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
