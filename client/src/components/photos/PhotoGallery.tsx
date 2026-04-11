import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Trash2, X, ZoomIn, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";

type PhotoCategory = "item_condition" | "packaging" | "damage" | "label" | "other";

const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  item_condition: "Item Condition",
  packaging: "Packaging",
  damage: "Damage",
  label: "Label",
  other: "Other",
};

const CATEGORY_COLORS: Record<PhotoCategory, string> = {
  item_condition: "bg-blue-500/20 text-blue-400",
  packaging: "bg-green-500/20 text-green-400",
  damage: "bg-red-500/20 text-red-400",
  label: "bg-yellow-500/20 text-yellow-400",
  other: "bg-gray-500/20 text-gray-400",
};

interface PhotoGalleryProps {
  entityType: string;
  entityId: string;
  title?: string;
  compact?: boolean;
}

export function PhotoGallery({
  entityType,
  entityId,
  title = "Photos",
  compact = false,
}: PhotoGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>("other");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ base64: string; mimeType: string; sizeBytes: number } | null>(null);

  const utils = trpc.useUtils();
  const { data: photos = [], isLoading } = trpc.photoCapture.list.useQuery({
    entityType,
    entityId,
  });

  const uploadMutation = trpc.photoCapture.upload.useMutation({
    onSuccess: () => {
      utils.photoCapture.list.invalidate({ entityType, entityId });
      setShowUploadForm(false);
      setPendingFile(null);
      setUploadNote("");
      setUploadCategory("other");
      toast.success("Photo uploaded successfully.");
    },
    onError: (e) => {
      toast.error(`Upload failed: ${e.message}`);
    },
  });

  const deleteMutation = trpc.photoCapture.delete.useMutation({
    onSuccess: () => {
      utils.photoCapture.list.invalidate({ entityType, entityId });
      toast.success("Photo deleted.");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10 MB per photo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setPendingFile({ base64, mimeType: file.type || "image/jpeg", sizeBytes: file.size });
      setShowUploadForm(true);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({
        entityType,
        entityId,
        category: uploadCategory,
        base64Data: pendingFile.base64,
        mimeType: pendingFile.mimeType,
        note: uploadNote || undefined,
        fileSizeBytes: pendingFile.sizeBytes,
      });
    } finally {
      setUploading(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Camera className="h-3.5 w-3.5" />
          <span>{photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? "s" : ""}` : "Add photo"}</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
        {showUploadForm && pendingFile && (
          <UploadDialog
            pendingFile={pendingFile}
            category={uploadCategory}
            note={uploadNote}
            uploading={uploading}
            onCategoryChange={setUploadCategory}
            onNoteChange={setUploadNote}
            onUpload={handleUpload}
            onCancel={() => { setShowUploadForm(false); setPendingFile(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          {photos.length > 0 && (
            <Badge variant="secondary" className="text-xs">{photos.length}</Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="h-7 text-xs gap-1"
        >
          <Upload className="h-3.5 w-3.5" />
          Add Photo
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading photos...</div>
      ) : photos.length === 0 ? (
        <div
          className="border border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Click to add photos</p>
          <p className="text-xs text-muted-foreground mt-1">Supports JPEG, PNG, WebP — max 10 MB</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {(photos as any[]).map((photo: any) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden bg-muted border border-border"
            >
              <img
                src={photo.file_url}
                alt={photo.note || "Photo"}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxUrl(photo.file_url)}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button
                  onClick={() => setLightboxUrl(photo.file_url)}
                  className="p-1 rounded bg-white/20 hover:bg-white/30 text-white"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ id: photo.id })}
                  className="p-1 rounded bg-red-500/60 hover:bg-red-500/80 text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-1">
                <span className={`text-[10px] px-1 py-0.5 rounded ${CATEGORY_COLORS[photo.category as PhotoCategory] ?? CATEGORY_COLORS.other}`}>
                  {CATEGORY_LABELS[photo.category as PhotoCategory] ?? photo.category}
                </span>
              </div>
            </div>
          ))}
          <div
            className="aspect-square rounded-lg border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Upload dialog */}
      {showUploadForm && pendingFile && (
        <UploadDialog
          pendingFile={pendingFile}
          category={uploadCategory}
          note={uploadNote}
          uploading={uploading}
          onCategoryChange={setUploadCategory}
          onNoteChange={setUploadNote}
          onUpload={handleUpload}
          onCancel={() => { setShowUploadForm(false); setPendingFile(null); }}
        />
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Photo"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ─── Upload Dialog ─────────────────────────────────────────────────────────────
interface UploadDialogProps {
  pendingFile: { base64: string; mimeType: string; sizeBytes: number };
  category: PhotoCategory;
  note: string;
  uploading: boolean;
  onCategoryChange: (c: PhotoCategory) => void;
  onNoteChange: (n: string) => void;
  onUpload: () => void;
  onCancel: () => void;
}

function UploadDialog({
  pendingFile,
  category,
  note,
  uploading,
  onCategoryChange,
  onNoteChange,
  onUpload,
  onCancel,
}: UploadDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <img
            src={pendingFile.base64}
            alt="Preview"
            className="w-full max-h-48 object-contain rounded-lg border border-border"
          />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Category</label>
            <Select value={category} onValueChange={(v) => onCategoryChange(v as PhotoCategory)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
            <Textarea
              placeholder="Describe what this photo shows..."
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              className="text-sm min-h-[60px] resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={uploading}>
              Cancel
            </Button>
            <Button size="sm" onClick={onUpload} disabled={uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
