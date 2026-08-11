"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { uploadDocument } from "@/lib/api/onboarding";
import { DocumentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Modal";
import Image from "next/image";
interface UploadState {
  uploading: boolean;
  progress: number;
  error?: string;
}

export default function DocumentsPage() {
  const router = useRouter();
  const store = useOnboardingStore();
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingUpload, setPendingUpload] = useState<{ type: DocumentType, file: File, previewUrl: string } | null>(null);

  const setUploadState = (type: string, update: Partial<UploadState>) => {
    setUploadStates((prev) => {
      const current = prev[type] || { uploading: false, progress: 0 };
      return {
        ...prev,
        [type]: { ...current, ...update },
      };
    });
  };

  const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
  const ALLOWED_MIME_TYPES = [
    "application/pdf", 
    "image/jpeg", 
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  const handleFileSelect = (type: DocumentType, file: File) => {
    // The <input accept> attribute only hints the OS file picker — it
    // doesn't actually block a user from selecting "All files" and
    // choosing something else, so validate type explicitly here too.
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    const isAllowedType =
      ALLOWED_MIME_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(extension);
    if (!isAllowedType) {
      toast.error("Only PDF, DOC, JPG, or PNG files are allowed.");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const isPdf = file.type === "application/pdf";
    const finalUrl = isPdf ? `${previewUrl}#toolbar=0&navpanes=0&scrollbar=0` : previewUrl;
    setPendingUpload({ type, file, previewUrl: finalUrl });
  };

  const confirmUpload = async () => {
    if (!pendingUpload) return;
    const { type, file } = pendingUpload;
    setPendingUpload(null);
    setUploadState(type, { uploading: true, progress: 0, error: undefined });

    try {
      const result = await uploadDocument(type, file, (pct) => {
        setUploadState(type, { progress: pct });
      });
      store.updateDocument(type, {
        uploaded: true,
        file_name: result.file_name,
        document_id: result.document_id,
        url: result.url,
      });
      setUploadState(type, { uploading: false, progress: 100 });
      toast.success(`${file.name} uploaded`);
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ?? "Upload failed. Try again.";
      console.error("[Documents] upload error:", err);
      setUploadState(type, { uploading: false, error: msg });
      toast.error(msg);
    }
  };

  const handleRemove = (type: DocumentType) => {
    store.updateDocument(type, { uploaded: false, file_name: undefined, document_id: undefined, url: undefined });
    setUploadState(type, { uploading: false, progress: 0, error: undefined });
  };

  const requiredDocs = store.documents.filter((d) => d.required);
  const allRequiredUploaded = requiredDocs.every((d) => d.uploaded);

  const [isNavigating, setIsNavigating] = useState(false);

  const handleContinue = () => {
    if (!allRequiredUploaded) {
      toast.error("Please upload all required documents.");
      return;
    }
    setIsNavigating(true);
    router.push("/onboarding/review");
  };

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      {/* Form card — flex-1 min-h-0 allows it to shrink to fit the screen, overflow-hidden clips corners */}
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        
        {/* Fixed header inside the card */}
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Document Upload
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload documents to verify your business identity.
          </p>
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <div className="space-y-3">
          {store.documents.map((doc) => {
            const state = uploadStates[doc.type] ?? { uploading: false, progress: 0 };
            const isProfileReuse = store.onboardingMode === "profile_reuse_review";
            const isVerifiedAndLocked = isProfileReuse && doc.uploaded && doc.required;

            return (
              <div
                key={doc.type}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3.5 transition-all",
                  doc.uploaded
                    ? "border-primary/30 bg-primary/5"
                    : "border-dashed border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {doc.uploaded ? (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      doc.uploaded ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {doc.uploaded ? doc.file_name : doc.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isVerifiedAndLocked ? (
                        <span className="text-green-600 font-medium flex items-center gap-1">
                           Already verified ✓
                        </span>
                      ) : doc.uploaded ? (
                        doc.label
                      ) : (
                        "PDF, JPG, PNG or DOC (max. 10MB)"
                      )}
                    </p>
                    {/* Upload progress */}
                    {state.uploading && (
                      <div
                        className="mt-1.5 h-1 w-32 rounded-full bg-muted overflow-hidden"
                        role="progressbar"
                        aria-label={`Uploading ${doc.label}`}
                        aria-valuenow={state.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${state.progress}%` }}
                        />
                      </div>
                    )}
                    {state.error && (
                      <p className="text-xs text-red-500 mt-0.5">{state.error}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {doc.uploaded && !isVerifiedAndLocked && (
                    <button
                      onClick={() => handleRemove(doc.type)}
                      aria-label={`Remove ${doc.label}`}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      View
                    </a>
                  )}
                  {!isVerifiedAndLocked && (
                    <button
                      type="button"
                      disabled={state.uploading}
                      onClick={() => fileRefs.current[doc.type]?.click()}
                      aria-label={doc.uploaded ? `Change ${doc.label}` : `Upload ${doc.label}`}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer",
                        doc.uploaded
                          ? "border-border text-foreground hover:bg-muted"
                          : "border-primary/60 text-primary hover:bg-primary/5",
                        state.uploading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {state.uploading ? "Uploading..." : doc.uploaded ? "Change" : "Upload"}
                    </button>
                  )}
                  <label htmlFor={`doc-upload-${doc.type}`} className="sr-only">
                    Upload {doc.label}
                  </label>
                  <input
                    id={`doc-upload-${doc.type}`}
                    ref={(el) => { fileRefs.current[doc.type] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(doc.type, file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="px-8"
            onClick={() => router.back()}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={!allRequiredUploaded || isNavigating}
            loading={isNavigating}
            className="flex-1"
            onClick={handleContinue}
          >
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          </div>
        </div>
      </div>
      
      <Dialog open={!!pendingUpload} onOpenChange={(open) => !open && setPendingUpload(null)}>
        <DialogContent size="lg">
          <DialogTitle>Confirm Document</DialogTitle>
          <DialogDescription>
            Please confirm the document preview before uploading.
          </DialogDescription>
          
          <div className="mt-4 flex flex-col items-center gap-4">
            {pendingUpload?.previewUrl ? (
              <div className="relative w-full h-[60vh] rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                {pendingUpload.file.type.startsWith("image/") ? (
                  <Image
                    src={pendingUpload.previewUrl}
                    alt="Document Preview"
                    fill
                    className="object-contain"
                  />
                ) : (
                  <iframe
                    src={pendingUpload.previewUrl}
                    title="Document Preview"
                    className="w-full h-full"
                  />
                )}
              </div>
            ) : (
              <div className="w-full h-[60vh] rounded-lg border border-border bg-muted flex flex-col items-center justify-center text-muted-foreground">
                <FileText className="h-12 w-12 mb-2" />
                <span className="text-sm font-medium px-4 text-center break-all">{pendingUpload?.file.name}</span>
                <span className="text-xs mt-1">Preview not available</span>
              </div>
            )}
            
            <div className="flex gap-3 w-full mt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setPendingUpload(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                onClick={confirmUpload}
              >
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
