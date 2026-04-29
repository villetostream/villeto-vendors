"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Upload, FileText, X } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Button } from "@/components/ui/Button";
import { useOnboardingStore } from "@/lib/stores/onboardingStore";
import { uploadDocument } from "@/lib/api/onboarding";
import { DocumentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

  const setUploadState = (type: string, update: Partial<UploadState>) => {
    setUploadStates((prev) => ({
      ...prev,
      [type]: { uploading: false, progress: 0, ...prev[type], ...update },
    }));
  };

  const handleFileSelect = async (type: DocumentType, file: File) => {
    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

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
    } catch {
      setUploadState(type, { uploading: false, error: "Upload failed. Try again." });
      toast.error("Upload failed. Please try again.");
    }
  };

  const handleRemove = (type: DocumentType) => {
    store.updateDocument(type, { uploaded: false, file_name: undefined, document_id: undefined, url: undefined });
    setUploadState(type, { uploading: false, progress: 0, error: undefined });
  };

  const requiredDocs = store.documents.filter((d) => d.required);
  const allRequiredUploaded = requiredDocs.every((d) => d.uploaded);

  const handleContinue = () => {
    if (!allRequiredUploaded) {
      toast.error("Please upload all required documents.");
      return;
    }
    router.push("/onboarding/review");
  };

  return (
    <div className="w-full max-w-2xl">
      <OnboardingStepper currentStep="documents" />

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-8">
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Document Upload
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Upload documents to verify your business identity.
        </p>

        <div className="space-y-3">
          {store.documents.map((doc) => {
            const state = uploadStates[doc.type] ?? { uploading: false, progress: 0 };

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
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
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
                      {doc.uploaded ? doc.label : "PDF, JPG or PNG (max. 10MB)"}
                    </p>
                    {/* Upload progress */}
                    {state.uploading && (
                      <div className="mt-1.5 h-1 w-32 rounded-full bg-muted overflow-hidden">
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
                  {doc.uploaded && (
                    <button
                      onClick={() => handleRemove(doc.type)}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={state.uploading}
                    onClick={() => fileRefs.current[doc.type]?.click()}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      doc.uploaded
                        ? "border-border text-foreground hover:bg-muted"
                        : "border-primary/60 text-primary hover:bg-primary/5",
                      state.uploading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {state.uploading ? "Uploading..." : doc.uploaded ? "Change" : "upload"}
                  </button>
                  <input
                    ref={(el) => { fileRefs.current[doc.type] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
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
            disabled={!allRequiredUploaded}
            className="flex-1"
            onClick={handleContinue}
          >
            Continue
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
