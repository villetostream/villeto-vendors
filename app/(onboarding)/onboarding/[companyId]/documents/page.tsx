"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useV2OnboardingStore } from "@/lib/stores/v2OnboardingStore";
import { useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { uploadV2Document, viewV2Document } from "@/lib/api/vendor-network";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { ArrowRight, UploadCloud, CheckCircle2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REQUIRED_DOCS = [
  { id: "certificate_of_incorporation", label: "Certificate of Incorporation / Registration", required: true },
  { id: "tax_certificate", label: "Tax Clearance Certificate", required: true },
  { id: "government_id", label: "Government ID", required: true },
  { id: "bank_document", label: "Bank Document (Optional)", required: false },
];

export default function V2DocumentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;
  const router = useRouter();
  const store = useV2OnboardingStore();
  const [mounted, setMounted] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [uploads, setUploads] = useState<Record<string, { status: "uploading" | "done" | "error"; url?: string; progress?: number; filename?: string }>>(() => {
    const initial: Record<string, any> = {};
    if (store.uploadedDocuments) {
      store.uploadedDocuments.forEach(doc => {
        initial[doc.id] = { status: "done", filename: doc.name, url: doc.url };
      });
    }
    return initial;
  });

  const { data: company } = useMyCompany(companyId);

  useEffect(() => { setMounted(true); }, []);

  const docsRequired = store.onboardingStatus?.documentsRequired;

  useEffect(() => {
    if (mounted && docsRequired === false) {
      router.replace(`/onboarding/${companyId}/review`);
    }
  }, [mounted, docsRequired, companyId, router]);

  // Sync documents from the backend to ensure valid URLs (especially after a reload)
  useEffect(() => {
    if (company?.documents && Array.isArray(company.documents)) {
      setUploads((prev) => {
        const next = { ...prev };
        let changed = false;
        company.documents?.forEach((d: any) => {
          const docUrl = d.fileUrl || (d.viewEndpoint ? `https://api.villeto.com${d.viewEndpoint}` : "");
          // Only update if it doesn't already have a valid non-blob URL, 
          // or if the current one is missing/blob
          if (
            !next[d.documentType] || 
            !next[d.documentType].url || 
            next[d.documentType].url?.startsWith("blob:")
          ) {
            next[d.documentType] = {
              status: "done",
              filename: d.originalName || `${d.documentType}.pdf`,
              url: docUrl,
            };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [company]);

  const onDrop = async (acceptedFiles: File[], docId: string) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);

    setUploads((prev) => ({
      ...prev,
      [docId]: { status: "uploading", progress: 0, filename: file.name },
    }));

    try {
      const res = await uploadV2Document(companyId, docId, file, (pct) => {
        setUploads((prev) => ({ ...prev, [docId]: { ...prev[docId], progress: pct } }));
      });
      let viewUrl = "";
      try {
        const documentId = res.document_id;
        if (documentId) {
          const viewRes = await viewV2Document(companyId, documentId);
          viewUrl = viewRes.url;
        }
      } catch (e) {
        console.warn("Could not get document view URL", e);
      }
      setUploads((prev) => ({
        ...prev,
        [docId]: { 
          status: "done", 
          url: viewUrl || res.url || localUrl, 
          filename: res.file_name || file.name 
        },
      }));
      toast.success("Document uploaded successfully");
    } catch (err: any) {
      setUploads((prev) => ({ ...prev, [docId]: { status: "error", filename: file.name } }));
      toast.error(err.message || "Failed to upload document");
    }
  };

  const handleNext = () => {
    store.setUploadedDocumentsLocally(
      Object.entries(uploads)
        .filter(([_, state]) => state.status === "done" && state.filename)
        .map(([id, state]) => ({ id, name: state.filename!, url: state.url }))
    );
    setIsNavigating(true);
    router.push(`/onboarding/${companyId}/review`);
  };

  const allRequiredDone = REQUIRED_DOCS.filter(d => d.required).every(d => uploads[d.id]?.status === "done");

  if (!mounted || docsRequired === false) return null;

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">Upload Documents</h2>
          <p className="text-sm text-muted-foreground">
            Please provide the following documents to complete your verification.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-6">
          {REQUIRED_DOCS.map((doc) => (
            <DocumentUploader
              key={doc.id}
              docId={doc.id}
              label={doc.label}
              uploadState={uploads[doc.id]}
              onDrop={(files: File[]) => onDrop(files, doc.id)}
              onRemove={() => {
                setUploads(prev => {
                  const newUploads = { ...prev };
                  delete newUploads[doc.id];
                  return newUploads;
                });
              }}
            />
          ))}

          <div className="flex gap-3 pt-6 border-t border-border/50">
            <Button type="button" variant="outline" size="lg" className="px-8" onClick={() => router.back()}>Back</Button>
            <Button type="button" variant="primary" size="lg" className="flex-1" onClick={handleNext} loading={isNavigating} disabled={!allRequiredDone}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentUploader({ label, uploadState, onDrop, onRemove, docId }: any) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    }
  });

  const [notApplicable, setNotApplicable] = useState(false);
  const [issueDate, setIssueDate] = useState<Date | undefined>(undefined);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);

  const isDone = uploadState?.status === "done";
  const isUploading = uploadState?.status === "uploading";

  return (
    <div 
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-5 flex flex-col gap-4 transition-colors relative",
        isDragActive ? "bg-primary/5 border-primary" : "border-primary/60 hover:bg-slate-50/50"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex justify-between items-start">
        <div className="flex gap-3 items-start">
          <div className="mt-0.5">
            {isDone ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center border border-border/50">
                <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {isDone ? uploadState.filename : label}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isDone ? label : "PDF, JPG or PNG (max. 10MB)"}
            </p>
            {isUploading && (
              <div className="flex items-center gap-2 mt-2 w-32">
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadState.progress || 0}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{uploadState.progress || 0}%</span>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={open}
          className="border border-primary text-primary rounded-lg px-4 py-1.5 text-xs font-semibold bg-white hover:bg-primary hover:text-white transition-colors"
        >
          {isDone ? "Change" : "upload"}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mt-2 items-end">
        {docId === "tax_certificate" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Issue date</label>
            <div className="w-36">
              <DatePicker
                date={issueDate}
                onSelect={setIssueDate}
                isDisabled={notApplicable}
                placeholder="dd/mm/yyyy"
              />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground font-medium">Expiry date</label>
          <div className="w-36">
            <DatePicker
              date={expiryDate}
              onSelect={setExpiryDate}
              isDisabled={notApplicable}
              placeholder="dd/mm/yyyy"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground font-medium">Not applicable</label>
          <div className="flex items-center h-9">
            <button
              type="button"
              role="switch"
              aria-checked={notApplicable}
              onClick={(e) => { e.stopPropagation(); setNotApplicable(!notApplicable); }}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                notApplicable ? "bg-primary" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white border border-slate-300/50 shadow-sm transition-transform",
                  notApplicable ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
