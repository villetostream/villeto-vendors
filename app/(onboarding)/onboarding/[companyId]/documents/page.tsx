"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCompanyOnboardingStore } from "@/lib/stores/companyOnboardingStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { useMyCompany } from "@/lib/hooks/useVendorNetwork";
import { uploadV2Document, viewV2Document } from "@/lib/api/vendor-network";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { ArrowRight, UploadCloud, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { format, startOfDay, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

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
  const store = useCompanyOnboardingStore();
  const [mounted, setMounted] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [uploads, setUploads] = useState<Record<string, { status: "pending" | "uploading" | "done" | "error"; url?: string; progress?: number; filename?: string }>>(() => {
    const initial: Record<string, any> = {};
    if (store.uploadedDocuments) {
      store.uploadedDocuments.forEach(doc => {
        initial[doc.id] = { status: "done", filename: doc.name, url: doc.url };
      });
    }
    return initial;
  });

  interface DocDates {
    issueDate?: Date;
    expiryDate?: Date;
    notApplicable?: boolean;
  }
  const [docDates, setDocDates] = useState<Record<string, DocDates>>({});
  // Files chosen by the user but not yet sent (waiting for dates / Not applicable)
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});

  const { data: company } = useMyCompany(companyId);
  const authUser = useAuthStore((s) => s.user);
  const cookieApproval = typeof window !== "undefined" ? Cookies.get(AUTH_COOKIE_NAMES.approvalStatus) : undefined;
  const isApproved =
    company?.approvalStatus === "approved" ||
    authUser?.approvalStatus === "approved" ||
    cookieApproval === "approved" ||
    (company?.status ?? "").toLowerCase() === "active";

  useEffect(() => { setMounted(true); }, []);

  const docsRequired = store.onboardingStatus?.documentsRequired;

  useEffect(() => {
    if (mounted && docsRequired === false) {
      router.replace(`/onboarding/${companyId}/review`);
    }
  }, [mounted, docsRequired, companyId, router]);

  useEffect(() => {
    if (company?.documents && Array.isArray(company.documents)) {
      setUploads((prev) => {
        const next = { ...prev };
        let changed = false;
        company.documents?.forEach((d: any) => {
          const docUrl = d.fileUrl || (d.viewEndpoint ? `https://api.villeto.com${d.viewEndpoint}` : "");
          if (!next[d.documentType] || !next[d.documentType].url || next[d.documentType].url?.startsWith("blob:")) {
            next[d.documentType] = { status: "done", filename: d.originalName || `${d.documentType}.pdf`, url: docUrl };
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      setDocDates((prev) => {
        const next = { ...prev };
        let changed = false;
        company.documents?.forEach((d: any) => {
          if (!next[d.documentType]) {
            const rawIssue = d.issueDate || d.issuedAt;
            const rawExpiry = d.expiryDate || d.expiresAt;
            const parsedIssue = rawIssue ? new Date(rawIssue) : undefined;
            const parsedExpiry = rawExpiry ? new Date(rawExpiry) : undefined;
            if (parsedIssue || parsedExpiry || d.notApplicable !== undefined) {
              next[d.documentType] = {
                issueDate: parsedIssue && !isNaN(parsedIssue.getTime()) ? parsedIssue : undefined,
                expiryDate: parsedExpiry && !isNaN(parsedExpiry.getTime()) ? parsedExpiry : undefined,
                notApplicable: Boolean(d.notApplicable),
              };
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });
    }
  }, [company]);

  const isDocReady = (docId: string, dates?: DocDates) => {
    if (dates?.notApplicable) return true;
    const expiryOk = !!dates?.expiryDate && !isBefore(startOfDay(dates.expiryDate), startOfDay(new Date()));
    if (!expiryOk) return false;
    if (docId === "tax_certificate") {
      return !!dates?.issueDate && !isAfter(startOfDay(dates.issueDate), startOfDay(new Date()));
    }
    return true;
  };

  const onDrop = (acceptedFiles: File[], docId: string) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setPendingFiles((prev) => ({ ...prev, [docId]: file }));
    setUploads((prev) => ({ ...prev, [docId]: { status: "pending", filename: file.name } }));
  };

  // Send a pending file only once its dates (or Not applicable) are satisfied
  useEffect(() => {
    Object.entries(pendingFiles).forEach(([docId, file]) => {
      if (isDocReady(docId, docDates[docId])) {
        setPendingFiles((prev) => { const n = { ...prev }; delete n[docId]; return n; });
        void doUpload(file, docId, docDates[docId]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, docDates]);

  const doUpload = async (file: File, docId: string, dates?: DocDates) => {
    const localUrl = URL.createObjectURL(file);
    setUploads((prev) => ({ ...prev, [docId]: { status: "uploading", progress: 0, filename: file.name } }));

    try {
      const res = await uploadV2Document(
        companyId, docId, file,
        (pct) => { setUploads((prev) => ({ ...prev, [docId]: { ...prev[docId], progress: pct } })); },
        {
          issuedAt: dates?.issueDate ? format(dates.issueDate, "yyyy-MM-dd") : undefined,
          expiresAt: dates?.expiryDate && !dates.notApplicable ? format(dates.expiryDate, "yyyy-MM-dd") : undefined,
          notApplicable: dates?.notApplicable,
        }
      );
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
      setUploads((prev) => ({ ...prev, [docId]: { status: "done", url: viewUrl || res.url || localUrl, filename: res.file_name || file.name } }));
      toast.success("Document uploaded successfully");
    } catch (err: any) {
      setUploads((prev) => ({ ...prev, [docId]: { status: "error", filename: file.name } }));
      toast.error(err.message || "Failed to upload document");
    }
  };

  const handleNext = () => {
    for (const doc of REQUIRED_DOCS) {
      const dates = docDates[doc.id];
      if (doc.id === "tax_certificate" && dates?.issueDate) {
        if (isAfter(startOfDay(dates.issueDate), startOfDay(new Date()))) {
          toast.error("Issue date must be today or in the past.");
          return;
        }
      }
      if (!dates?.notApplicable && dates?.expiryDate) {
        if (isBefore(startOfDay(dates.expiryDate), startOfDay(new Date()))) {
          toast.error("Expiration date must be today or in the future.");
          return;
        }
      }
    }
    store.setUploadedDocumentsLocally(
      Object.entries(uploads)
        .filter(([_, state]) => state.status === "done" && state.filename)
        .map(([id, state]) => ({ id, name: state.filename!, url: state.url }))
    );
    setIsNavigating(true);
    router.push(`/onboarding/${companyId}/review`);
  };

  const allRequiredDone = REQUIRED_DOCS.filter(d => d.required).every(d => uploads[d.id]?.status === "done");
  const hasPendingFiles = Object.keys(pendingFiles).length > 0;
  const hasInvalidDates = Object.entries(docDates).some(([id, d]) => {
    if (id === "tax_certificate" && d.issueDate && isAfter(startOfDay(d.issueDate), startOfDay(new Date()))) return true;
    if (!d.notApplicable && d.expiryDate && isBefore(startOfDay(d.expiryDate), startOfDay(new Date()))) return true;
    return false;
  });

  if (!mounted || docsRequired === false) return null;

  return (
    <div className="w-full max-w-2xl flex flex-col h-full min-h-0 px-4 pt-2 pb-6 mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 mb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 p-8 pb-4 border-b border-border/30 bg-white relative z-10">
          <h2 className="text-2xl font-bold text-foreground mb-1">Upload Documents</h2>
          <p className="text-sm text-muted-foreground">
            Please provide the following documents to complete your verification.
          </p>
          {(company?.approvalStatus === "rejected" || company?.status === "rejected" || (company as any)?.onboardingStatus === "rejected") && (
            <div className="mt-4 flex gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-900">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-950">Application was not approved</p>
                <p className="text-xs text-rose-700 mt-0.5">
                  {company?.decisionNote || (company as any)?.rejectionReason || "Please review and re-upload any rejected documents, or provide updated files to meet requirements."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-6 space-y-6">
          {REQUIRED_DOCS.map((doc) => {
            const backendDoc = company?.documents?.find((d: any) => d.documentType === doc.id);
            const verificationStatus = backendDoc?.verificationStatus;
            return (
              <DocumentUploader
                key={doc.id}
                docId={doc.id}
                label={doc.label}
                uploadState={uploads[doc.id]}
                verificationStatus={verificationStatus}
                initialDates={docDates[doc.id]}
                readOnly={isApproved}
                onDatesChange={(updated: any) => {
                  setDocDates((prev) => ({ ...prev, [doc.id]: { ...prev[doc.id], ...updated } }));
                }}
                onDrop={(files: File[]) => onDrop(files, doc.id)}
                onRemove={() => {
                  setPendingFiles((prev) => { const n = { ...prev }; delete n[doc.id]; return n; });
                  setUploads((prev) => { const n = { ...prev }; delete n[doc.id]; return n; });
                }}
              />
            );
          })}

          <div className="flex gap-3 pt-6 border-t border-border/50">
            <Button type="button" variant="outline" size="lg" className="px-6" onClick={() => router.back()}>Back</Button>
            {isApproved ? (
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => router.push("/pending")}
              >
                Return to Overview
              </Button>
            ) : (
              <Button type="button" variant="primary" size="lg" className="flex-1" onClick={handleNext} loading={isNavigating} disabled={!allRequiredDone || hasInvalidDates || hasPendingFiles}>
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentUploader({ label, uploadState, onDrop, onRemove, docId, verificationStatus, initialDates, onDatesChange, readOnly }: any) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, maxFiles: 1, noClick: true, noKeyboard: true,
    disabled: readOnly,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] }
  });

  const [notApplicable, setNotApplicable] = useState(initialDates?.notApplicable ?? false);
  const [issueDate, setIssueDate] = useState<Date | undefined>(initialDates?.issueDate);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(initialDates?.expiryDate);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (initialDates?.issueDate !== undefined) setIssueDate(initialDates.issueDate);
    if (initialDates?.expiryDate !== undefined) setExpiryDate(initialDates.expiryDate);
    if (initialDates?.notApplicable !== undefined) setNotApplicable(initialDates.notApplicable);
  }, [initialDates]);

  const isIssueDateInvalid = Boolean(issueDate && isAfter(startOfDay(issueDate), startOfDay(new Date())));
  const isExpiryDateInvalid = Boolean(!notApplicable && expiryDate && isBefore(startOfDay(expiryDate), startOfDay(new Date())));

  // Files can be chosen at any time; they are only sent once dates are ready
  // ("Not applicable" bypasses ALL date requirements; expiry always required; issue date only for tax_certificate).
  const expiryReady = notApplicable || (!!expiryDate && !isExpiryDateInvalid);
  const issueReady = notApplicable || docId !== "tax_certificate" || (!!issueDate && !isIssueDateInvalid);
  const canUpload = true;
  const isPending = uploadState?.status === "pending";
  const pendingHint = !issueReady
    ? "Set the issue date or toggle \"Not applicable\" to upload"
    : !expiryReady
    ? "Set an expiry date or toggle \"Not applicable\" to upload"
    : "";

  const handleIssueDateSelect = (d?: Date) => {
    if (readOnly) return;
    if (d && isAfter(startOfDay(d), startOfDay(new Date()))) { toast.error("Issue date must be today or in the past"); return; }
    setIssueDate(d);
    onDatesChange?.({ issueDate: d });
  };

  const handleExpiryDateSelect = (d?: Date) => {
    if (readOnly) return;
    if (d && isBefore(startOfDay(d), startOfDay(new Date()))) { toast.error("Expiration date must be today or in the future"); return; }
    setExpiryDate(d);
    onDatesChange?.({ expiryDate: d });
  };

  const handleToggleNotApplicable = () => {
    if (readOnly) return;
    const nextVal = !notApplicable;
    setNotApplicable(nextVal);
    onDatesChange?.({ notApplicable: nextVal });
  };

  const isDone = uploadState?.status === "done";
  const isUploading = uploadState?.status === "uploading";
  const isDocRejected = verificationStatus === "rejected";

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-5 flex flex-col gap-4 transition-colors relative",
        readOnly ? "border-slate-200 bg-slate-50/40"
          : isDocRejected ? "border-rose-400 bg-rose-50/40"
          : isDragActive && canUpload ? "bg-primary/5 border-primary"
          : "border-primary/60 hover:bg-slate-50/50"
      )}
    >
      <input {...getInputProps()} />

      {/* Title + Upload button row */}
      <div className="flex justify-between items-start">
        <div className="flex gap-3 items-start">
          <div className="mt-0.5">
            {isDocRejected ? (
              <XCircle className="h-5 w-5 text-rose-500" />
            ) : isDone || readOnly ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center border border-border/50">
                <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{isDone || isPending ? uploadState.filename : label}</h4>
              {isDocRejected && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                  Rejected — Re-upload required
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{isDone || isPending ? label : "PDF, JPG or PNG (max. 10MB)"}</p>
            {isPending && (
              <p className="text-[11px] text-amber-600 font-medium mt-1">{pendingHint}</p>
            )}
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

        {/* Upload button or Verified badge */}
        {readOnly ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Verified &amp; Approved
          </span>
        ) : (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={open}
              disabled={isUploading}
              className={cn(
                "border rounded-lg px-4 py-1.5 text-xs font-semibold bg-white transition-colors",
                isUploading
                  ? "border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed"
                  : isDocRejected
                  ? "border-rose-500 text-rose-600 hover:bg-rose-500 hover:text-white"
                  : "border-primary text-primary hover:bg-primary hover:text-white"
              )}
            >
              {isUploading ? "Uploading…" : isDone || isPending ? "Change" : "Upload"}
            </button>
          </div>
        )}
      </div>

      {/* Date fields — original layout */}
      <div className="flex flex-wrap gap-4 mt-2 items-end">
        {docId === "tax_certificate" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Issue date</label>
            <div className="w-36">
              <DatePicker
                date={issueDate}
                onSelect={handleIssueDateSelect}
                disabled={(date) => isAfter(startOfDay(date), startOfDay(new Date()))}
                isDisabled={notApplicable || readOnly}
                placeholder="dd/mm/yyyy"
                error={isIssueDateInvalid}
              />
              {isIssueDateInvalid && <p className="text-[10px] text-rose-500 font-medium mt-1">Must be today or past</p>}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground font-medium">Expiry date</label>
          <div className="w-36">
            <DatePicker
              date={expiryDate}
              onSelect={handleExpiryDateSelect}
              disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
              isDisabled={notApplicable || readOnly}
              placeholder="dd/mm/yyyy"
              error={isExpiryDateInvalid}
            />
            {isExpiryDateInvalid && <p className="text-[10px] text-rose-500 font-medium mt-1">Must be today or future</p>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground font-medium">Not applicable</label>
          <div className="flex items-center h-9">
            <button
              type="button"
              role="switch"
              aria-checked={notApplicable}
              disabled={readOnly}
              onClick={(e) => { e.stopPropagation(); handleToggleNotApplicable(); }}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                readOnly ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                notApplicable ? "bg-primary" : "bg-slate-200"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white border border-slate-300/50 shadow-sm transition-transform",
                notApplicable ? "translate-x-4" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
