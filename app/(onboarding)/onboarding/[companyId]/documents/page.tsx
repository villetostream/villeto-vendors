"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useV2OnboardingStore } from "@/lib/stores/v2OnboardingStore";
import { useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { uploadV2Document, viewV2Document } from "@/lib/api/vendor-network";
import { Button } from "@/components/ui/Button";
import { ArrowRight, UploadCloud, FileText, CheckCircle2, X, Eye } from "lucide-react";
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
    const allDone = REQUIRED_DOCS.filter(d => d.required).every(d => uploads[d.id]?.status === "done");
    if (!allDone) {
      toast.warning("Please upload all required documents");
      return;
    }
    const uploadedList = Object.entries(uploads)
      .filter(([_, state]) => state.status === "done" && state.filename)
      .map(([id, state]) => ({ id, name: state.filename!, url: state.url }));
      
    store.setUploadedDocumentsLocally(uploadedList);
    
    setIsNavigating(true);
    router.push(`/onboarding/${companyId}/review`);
  };

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
            <Button type="button" variant="primary" size="lg" className="flex-1" onClick={handleNext} loading={isNavigating}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentUploader({ label, uploadState, onDrop, onRemove }: any) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    }
  });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      
      {!uploadState || uploadState.status === "error" ? (
        <div 
          {...getRootProps()} 
          className={cn(
            "border-2 border-dashed rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-slate-50",
            uploadState?.status === "error" && "border-red-300 bg-red-50"
          )}
        >
          <input {...getInputProps()} />
          <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
            <UploadCloud className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-medium text-foreground">Click or drag file here</p>
            <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG or PNG up to 10MB</p>
          </div>
        </div>
      ) : (
        <div className="border rounded-xl p-4 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{uploadState.filename}</p>
              {uploadState.status === "uploading" ? (
                <div className="flex items-center gap-2 mt-1 w-32">
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadState.progress || 0}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{uploadState.progress || 0}%</span>
                </div>
              ) : (
                <p className="text-xs text-green-600 flex items-center mt-0.5">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Uploaded successfully
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {uploadState.status === "done" && (
              <a 
                href={uploadState.url || "#"}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "p-2 rounded-lg transition-colors shrink-0 z-10 relative",
                  uploadState.url 
                    ? "text-muted-foreground hover:text-primary hover:bg-primary/5" 
                    : "text-muted-foreground/40 cursor-not-allowed"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!uploadState.url || uploadState.url === "#") {
                    e.preventDefault();
                    toast.error("Document preview is not available for this file.");
                  }
                }}
                title="View Document"
              >
                <Eye className="h-4 w-4" />
              </a>
            )}
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors shrink-0 z-10 relative"
              title="Remove Document"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
