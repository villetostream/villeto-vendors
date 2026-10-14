"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, X, ArrowRight, Camera } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { uploadDocument } from "@/lib/api/onboarding";
import { DocumentType, DOCS_WITH_EXPIRY, DOCS_WITH_SCREENSHOT } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Modal";
import Image from "next/image";

interface UploadState {
  uploading: boolean;
  progress: number;
  error?: string;
}

/**
 * Pending upload — may include an expiration date and/or screenshot file
 * for document types that support them.
 */
interface PendingUpload {
  type: DocumentType;
  file: File;
  previewUrl: string;
  /** Collected before confirmation for types in DOCS_WITH_EXPIRY */
  expiresAt?: string;
  /** Collected before confirmation for types in DOCS_WITH_SCREENSHOT */
  screenshotFile?: File;
}

export default function DocumentsPage() {
  const router = useRouter();
  const store = useOnboardingStore();
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const screenshotRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const setUploadState = (type: string, update: Partial<UploadState>) => {
    setUploadStates((prev) => {
      const current = prev[type] || { uploading: false, progress: 0 };
      return { ...prev, [type]: { ...current, ...update } };
    });
  };

  const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
  const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const validateFile = (file: File): boolean => {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    const isAllowedType =
      ALLOWED_MIME_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(extension);
    if (!isAllowedType) {
      toast.error("Only PDF, DOC, JPG, or PNG files are allowed.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return false;
    }
    return true;
  };

  const handleFileSelect = (type: DocumentType, file: File) => {
    if (!validateFile(file)) return;
    const previewUrl = URL.createObjectURL(file);
    const isPdf = file.type === "application/pdf";
    const finalUrl = isPdf ? `${previewUrl}#toolbar=0&navpanes=0&scrollbar=0` : previewUrl;
    setPendingUpload({ type, file, previewUrl: finalUrl });
  };

  const confirmUpload = async () => {
    if (!pendingUpload) return;
    const { type, file, expiresAt, screenshotFile } = pendingUpload;
    setPendingUpload(null);
    setUploadState(type, { uploading: true, progress: 0, error: undefined });

    try {
      const result = await uploadDocument(
        type,
        file,
        (pct) => setUploadState(type, { progress: pct }),
        {
          ...(DOCS_WITH_EXPIRY.has(type) && expiresAt ? { expiresAt } : {}),
          ...(DOCS_WITH_SCREENSHOT.has(type) && screenshotFile ? { screenshotFile } : {}),
        }
      );
      store.updateDocument(type, {
        uploaded: true,
        file_name: result.file_name,
        document_id: result.document_id,
        url: result.url,
        ...(DOCS_WITH_EXPIRY.has(type) && expiresAt ? { expiresAt } : {}),
      });
      setUploadState(type, { uploading: false, progress: 100 });
      toast.success(`${file.name} uploaded`);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Upload failed. Try again.";
      console.error("[Documents] upload error:", err);
      setUploadState(type, { uploading: false, error: msg });
      toast.error(msg);
    }
  };

  const handleRemove = (type: DocumentType) => {
    store.updateDocument(type, {
      uploaded: false,
      file_name: undefined,
      document_id: undefined,
      url: undefined,
      expiresAt: undefined,
      screenshot: undefined,
    });
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
      {/* Form card */}
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Fixed header inside the card */}
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">Document Upload</h2>
          <p className="text-sm text-muted-foreground">
            Upload documents to verify your business identity.
          </p>
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 overflow-y-auto p-8 pt-6">
          <div className="space-y-4">
            {store.documents.map((doc) => {
              const state = uploadStates[doc.type] ?? { uploading: false, progress: 0 };
              const isProfileReuse = store.onboardingMode === "profile_reuse_review";
              const isVerifiedAndLocked = isProfileReuse && doc.uploaded && doc.required;
              const supportsExpiry = DOCS_WITH_EXPIRY.has(doc.type);
              const supportsScreenshot = DOCS_WITH_SCREENSHOT.has(doc.type);
              const hasSubRows = supportsExpiry || supportsScreenshot;

              return (
                <div
                  key={doc.type}
                  className={cn(
                    "rounded-xl border overflow-hidden",
                    doc.uploaded ? "border-primary/30" : "border-dashed border-border"
                  )}
                >
                  {/* Main document row */}
                  <div
                    className={cn(
                      "flex items-center justify-between px-4 py-3.5 transition-all",
                      doc.uploaded ? "bg-primary/5" : "hover:border-primary/40",
                      hasSubRows && (doc.uploaded || supportsExpiry || supportsScreenshot)
                        ? "border-b border-border/20"
                        : ""
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

                  {/* ── Expiration date sub-row (applicable types only) ── */}
                  {supportsExpiry && (
                    <div className={cn(
                      "flex items-center gap-3 px-4 py-2.5 bg-muted/20",
                      supportsScreenshot ? "border-b border-border/20" : ""
                    )}>
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted shrink-0">
                        <span className="text-[9px] font-bold text-muted-foreground leading-none">EXP</span>
                      </div>
                      <label
                        htmlFor={`exp-date-${doc.type}`}
                        className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                      >
                        Expiration date
                        <span className="ml-1 text-[10px] font-normal opacity-60">(optional)</span>
                      </label>
                      <input
                        id={`exp-date-${doc.type}`}
                        type="date"
                        aria-label={`Expiration date for ${doc.label}`}
                        value={doc.expiresAt ?? ""}
                        onChange={(e) =>
                          store.updateDocument(doc.type, {
                            expiresAt: e.target.value || undefined,
                          })
                        }
                        className="ml-auto text-xs rounded-lg border border-border bg-white px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                      />
                    </div>
                  )}

                  {/* ── Screenshot sub-row (applicable types only) ── */}
                  {supportsScreenshot && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/20">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted shrink-0">
                        <Camera className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-muted-foreground leading-none">
                          Back / screenshot
                          <span className="ml-1 text-[10px] font-normal opacity-60">(optional)</span>
                        </p>
                        {doc.screenshot?.file_name && (
                          <p className="text-[11px] text-foreground truncate mt-0.5">
                            {doc.screenshot.file_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.screenshot?.url && (
                          <a
                            href={doc.screenshot.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            View
                          </a>
                        )}
                        {doc.screenshot?.file_name && (
                          <button
                            type="button"
                            onClick={() => store.updateDocument(doc.type, { screenshot: undefined })}
                            aria-label="Remove screenshot"
                            className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => screenshotRefs.current[doc.type]?.click()}
                          className="px-3 py-1 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          {doc.screenshot?.file_name ? "Change" : "Upload"}
                        </button>
                        <label htmlFor={`screenshot-upload-${doc.type}`} className="sr-only">
                          Upload screenshot for {doc.label}
                        </label>
                        <input
                          id={`screenshot-upload-${doc.type}`}
                          ref={(el) => { screenshotRefs.current[doc.type] = el; }}
                          type="file"
                          accept=".jpg,.jpeg,.png,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || !validateFile(file)) return;
                            // Optimistically record the filename; the actual file
                            // will be sent in the payload when the main document
                            // is uploaded (or re-uploaded). If the main doc is
                            // already uploaded, stash on pending so user re-confirms.
                            store.updateDocument(doc.type, {
                              screenshot: { file_name: file.name },
                            });
                            // If main doc already uploaded, prompt re-upload to include screenshot
                            if (doc.uploaded) {
                              toast.info(
                                "Screenshot saved. It will be sent when you re-upload the main document.",
                                { duration: 4000 }
                              );
                            }
                            e.target.value = "";
                          }}
                        />
                      </div>
                    </div>
                  )}
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

      {/* Confirmation dialog */}
      <Dialog open={!!pendingUpload} onOpenChange={(open) => !open && setPendingUpload(null)}>
        <DialogContent size="lg">
          <DialogTitle>Confirm Document</DialogTitle>
          <DialogDescription>
            Please confirm the document preview before uploading.
          </DialogDescription>

          <div className="mt-4 flex flex-col items-center gap-4">
            {pendingUpload?.previewUrl ? (
              <div className="relative w-full h-[55vh] rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
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
              <div className="w-full h-[55vh] rounded-lg border border-border bg-muted flex flex-col items-center justify-center text-muted-foreground">
                <FileText className="h-12 w-12 mb-2" />
                <span className="text-sm font-medium px-4 text-center break-all">{pendingUpload?.file.name}</span>
                <span className="text-xs mt-1">Preview not available</span>
              </div>
            )}

            {/* Expiration date — shown in confirmation dialog for applicable types */}
            {pendingUpload && DOCS_WITH_EXPIRY.has(pendingUpload.type) && (
              <div className="w-full flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <label
                  htmlFor="dialog-exp-date"
                  className="text-sm font-medium text-foreground whitespace-nowrap"
                >
                  Expiration date
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="dialog-exp-date"
                  type="date"
                  value={pendingUpload.expiresAt ?? ""}
                  onChange={(e) =>
                    setPendingUpload((prev) =>
                      prev ? { ...prev, expiresAt: e.target.value || undefined } : prev
                    )
                  }
                  className="ml-auto text-sm rounded-lg border border-border bg-white px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                />
              </div>
            )}

            <div className="flex gap-3 w-full mt-2">
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
