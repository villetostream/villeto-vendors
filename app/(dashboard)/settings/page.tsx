"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Edit2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Calendar,
  Info,
  X,
  ExternalLink,
  History,
  Truck,
  CalendarClock,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useCompanyStore, queryKeys } from "@/lib/stores/companyStore";
import {
  useMyCompanies,
  useMyCompany,
  useVendorPaymentTerms,
  useCompanyPaymentTermOptions,
  useSaveCompanyPaymentTerm,
} from "@/lib/hooks/useVendorNetwork";
import {
  saveV2BankingDetails,
  uploadV2Document,
  viewV2Document,
  saveV2BusinessIdentity,
} from "@/lib/api/vendor-network";
import { getVendorProfile, updateVendorProfile } from "@/lib/api/vendor";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Modal";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { cn, formatDate, formatDateTime, parseLocalDate } from "@/lib/utils";
import { format, startOfDay, isBefore, isAfter } from "date-fns";
import type {
  V2CompanyRelationship,
  CompanyPaymentTermOption,
  SaveCompanyPaymentTermPayload,
  VendorPaymentTermSubmission,
  DocumentType,
} from "@/lib/types";

type SettingsTab = "payment-terms" | "banking" | "documents" | "profile";

const DOC_CONFIGS = [
  {
    id: "certificate_of_incorporation" as DocumentType,
    label: "Certificate of Incorporation",
    issueLabel: "Date of Incorporation",
    isIssueMandatory: true,
    isExpiryMandatory: false,
    hasNotApplicable: false,
  },
  {
    id: "tax_certificate" as DocumentType,
    label: "Tax Clearance Certificate (TCC)",
    issueLabel: "Issue date",
    isIssueMandatory: true,
    isExpiryMandatory: true,
    hasNotApplicable: false,
  },
  {
    id: "government_id" as DocumentType,
    label: "Government ID",
    issueLabel: "Issue date",
    isIssueMandatory: false,
    isExpiryMandatory: true,
    hasNotApplicable: true,
  },
  {
    id: "bank_document" as DocumentType,
    label: "Bank Verification Document",
    issueLabel: "Issue date",
    isIssueMandatory: false,
    isExpiryMandatory: false,
    hasNotApplicable: false,
  },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const activeCompanyId = useCompanyStore((s) => s.activeCompanyId);

  const { data: companiesData, isLoading: isLoadingCompanies } = useMyCompanies({});
  const companies: V2CompanyRelationship[] = Array.isArray(companiesData?.data)
    ? (companiesData.data as any)
    : [];

  const selectedCompany = companies.find((c) => c.companyId === activeCompanyId) || companies[0];
  const companyId = selectedCompany?.companyId || activeCompanyId || "";

  // Full company details (includes embedded paymentTerms, bankingDetails, documents)
  const { data: companyDetail, isLoading: isLoadingCompanyDetail } = useMyCompany(companyId);

  const [activeTab, setActiveTab] = useState<SettingsTab>("payment-terms");

  // ─────────────────────────────────────────────
  // TAB 1: Payment Terms (Live endpoints: GET /vendor-network/me/payment-terms)
  // ─────────────────────────────────────────────
  const {
    data: paymentTermsData,
    isLoading: isLoadingPaymentTerms,
    refetch: refetchPaymentTerms,
  } = useVendorPaymentTerms();

  const allTerms: VendorPaymentTermSubmission[] = Array.isArray(paymentTermsData?.data)
    ? paymentTermsData.data
    : [];

  // Match by companyId OR companyName (case-insensitive)
  const matchingTerms = allTerms.filter(
    (t) =>
      (companyId && t.companyId === companyId) ||
      (selectedCompany?.companyName &&
        t.companyName?.trim().toLowerCase() === selectedCompany.companyName.trim().toLowerCase())
  );

  const companyPaymentTerms = matchingTerms.length > 0 ? matchingTerms : allTerms;

  const currentSubmission =
    companyPaymentTerms.find((t) => t.isCurrent) ||
    companyPaymentTerms[0] ||
    null;

  // Active term resolves from:
  // 1. Authoritative submission from /vendor-network/me/payment-terms
  // 2. Embedded payment terms from GET /vendor-network/me/companies/:id (useMyCompany)
  // 3. Embedded payment terms from selectedCompany (useMyCompanies)
  const activeTerm =
    currentSubmission ||
    companyDetail?.paymentTerms ||
    selectedCompany?.paymentTerms ||
    null;

  const activeStatus =
    currentSubmission?.status ||
    companyDetail?.paymentTerms?.status ||
    selectedCompany?.paymentTerms?.status ||
    "approved";

  const {
    data: paymentOptions = [],
    isLoading: isLoadingPaymentOptions,
  } = useCompanyPaymentTermOptions(companyId);

  // Dynamic Net options (days > 0, active) from organization
  const netOptions = useMemo(() => {
    return (paymentOptions || [])
      .filter((o) => typeof o.days === "number" && o.days > 0 && o.isActive !== false)
      .sort((a, b) => a.days - b.days);
  }, [paymentOptions]);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [arrangementType, setArrangementType] = useState<"specified_days" | "upon_delivery" | "per_invoice">("specified_days");
  const [selectedPeriodName, setSelectedPeriodName] = useState<string>("");
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [customDaysValue, setCustomDaysValue] = useState<number>(30);
  const [customNameValue, setCustomNameValue] = useState<string>("Net 30 days");
  const [termNotes, setTermNotes] = useState<string>("");
  const [isReuseMode, setIsReuseMode] = useState(false);
  const [selectedReuseTermId, setSelectedReuseTermId] = useState<string>("");

  const openPaymentModal = () => {
    if (activeTerm) {
      const lowerName = (activeTerm.name || "").toLowerCase();
      if (
        lowerName.includes("invoice") ||
        lowerName.includes("vendor selects") ||
        lowerName.includes("specify terms")
      ) {
        setArrangementType("per_invoice");
      } else if (
        activeTerm.days === 0 ||
        lowerName.includes("receipt") ||
        lowerName.includes("delivery")
      ) {
        setArrangementType("upon_delivery");
      } else {
        setArrangementType("specified_days");
        const match = netOptions.find(
          (o) => o.days === activeTerm.days || o.name.toLowerCase() === activeTerm.name.toLowerCase()
        );
        if (match) {
          setSelectedPeriodName(match.name);
          setIsCustomDays(false);
        } else {
          setIsCustomDays(true);
          setCustomDaysValue(activeTerm.days || 30);
          setCustomNameValue(activeTerm.name || `Net ${activeTerm.days || 30} days`);
        }
      }
    } else {
      setArrangementType("specified_days");
      setSelectedPeriodName(netOptions[0]?.name || "Net 30");
      setIsCustomDays(false);
    }
    setTermNotes(currentSubmission?.details || "");
    setIsReuseMode(false);
    setSelectedReuseTermId(allTerms[0]?.paymentTermId || "");
    setIsPaymentModalOpen(true);
  };

  const savePaymentTermMutation = useSaveCompanyPaymentTerm();

  const handleSavePaymentTerm = () => {
    // 1. Reuse mode
    if (isReuseMode && selectedReuseTermId) {
      savePaymentTermMutation.mutate(
        {
          companyId,
          payload: {
            reusePaymentTermId: selectedReuseTermId,
            details: termNotes.trim() || undefined,
          },
        },
        {
          onSuccess: () => {
            toast.success(`Payment terms submitted for ${selectedCompany?.companyName || "organization"} review.`);
            setIsPaymentModalOpen(false);
            refetchPaymentTerms();
          },
          onError: (err: any) => {
            toast.error(err?.message || "Failed to submit payment terms request.");
          },
        }
      );
      return;
    }

    // 2. Upon Delivery -> maps to DUE_ON_RECEIPT option or days 0
    if (arrangementType === "upon_delivery") {
      const dueOpt =
        paymentOptions.find((o) => o.code === "DUE_ON_RECEIPT") ||
        paymentOptions.find((o) => o.name?.toLowerCase().includes("receipt") || o.name?.toLowerCase().includes("delivery"));

      const payload: SaveCompanyPaymentTermPayload = dueOpt
        ? { optionId: dueOpt.vendorPaymentTermOptionId, details: termNotes.trim() || undefined }
        : { name: "Due on receipt", days: 0, details: termNotes.trim() || undefined };

      savePaymentTermMutation.mutate(
        { companyId, payload },
        {
          onSuccess: () => {
            toast.success(`Payment upon delivery requested for ${selectedCompany?.companyName || "organization"} review.`);
            setIsPaymentModalOpen(false);
            refetchPaymentTerms();
          },
          onError: (err: any) => {
            toast.error(err?.message || "Failed to submit payment terms request.");
          },
        }
      );
      return;
    }

    // 3. Per Invoice -> maps to VENDOR_SELECTS_DUE_DATE or dynamic
    if (arrangementType === "per_invoice") {
      const perInvoiceOpt =
        paymentOptions.find((o) => o.code === "VENDOR_SELECTS_DUE_DATE") ||
        paymentOptions.find((o) => o.allowsInvoiceDueDate) ||
        paymentOptions.find((o) => o.name?.toLowerCase().includes("invoice"));

      const payload: SaveCompanyPaymentTermPayload = perInvoiceOpt
        ? { optionId: perInvoiceOpt.vendorPaymentTermOptionId, details: termNotes.trim() || undefined }
        : { name: "Specify terms per invoice", days: 0, details: termNotes.trim() || undefined };

      savePaymentTermMutation.mutate(
        { companyId, payload },
        {
          onSuccess: () => {
            toast.success(`Per-invoice payment terms requested for ${selectedCompany?.companyName || "organization"} review.`);
            setIsPaymentModalOpen(false);
            refetchPaymentTerms();
          },
          onError: (err: any) => {
            toast.error(err?.message || "Failed to submit payment terms request.");
          },
        }
      );
      return;
    }

    // 4. Specified days (Custom)
    if (isCustomDays) {
      if (customDaysValue < 0) {
        toast.error("Payment days must be 0 or more.");
        return;
      }
      const customName = customNameValue.trim() || `Net ${customDaysValue} days`;
      savePaymentTermMutation.mutate(
        {
          companyId,
          payload: {
            name: customName,
            days: Number(customDaysValue),
            details: termNotes.trim() || undefined,
          },
        },
        {
          onSuccess: () => {
            toast.success(`Custom terms (${customName}) submitted for review.`);
            setIsPaymentModalOpen(false);
            refetchPaymentTerms();
          },
          onError: (err: any) => {
            toast.error(err?.message || "Failed to submit payment terms request.");
          },
        }
      );
      return;
    }

    // 5. Specified days (Preset)
    const matchingOpt =
      netOptions.find((o) => o.name === selectedPeriodName) ||
      netOptions[0];

    if (!matchingOpt) {
      toast.error("Please select a valid payment period option.");
      return;
    }
    savePaymentTermMutation.mutate(
      {
        companyId,
        payload: {
          optionId: matchingOpt.vendorPaymentTermOptionId,
          details: termNotes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${matchingOpt.name} submitted for ${selectedCompany?.companyName || "organization"} review.`);
          setIsPaymentModalOpen(false);
          refetchPaymentTerms();
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to submit payment terms request.");
        },
      }
    );
  };

  // ─────────────────────────────────────────────
  // TAB 2: Banking Details
  // ─────────────────────────────────────────────
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const effectiveBanking = companyDetail?.bankingDetails || selectedCompany?.bankingDetails;

  useEffect(() => {
    if (effectiveBanking) {
      setBankName(effectiveBanking.bankName || "");
      setBankCode(effectiveBanking.bankCode || "");
      setAccountName(effectiveBanking.accountName || "");
      setAccountNumber(effectiveBanking.maskedAccountNumber || "");
    }
  }, [effectiveBanking]);

  const saveBankMutation = useMutation({
    mutationFn: (payload: { bankName: string; bankCode: string; accountNumber: string; accountName: string }) =>
      saveV2BankingDetails(companyId, payload),
    onSuccess: () => {
      toast.success(`Bank details updated for ${selectedCompany?.companyName || "company"}. Under review.`);
      setIsBankModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["my-companies"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Company(companyId) });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to update banking details.");
    },
  });

  const handleSaveBank = () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      toast.error("Please fill in all required bank fields.");
      return;
    }
    saveBankMutation.mutate({
      bankName: bankName.trim(),
      bankCode: bankCode.trim() || "000",
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim(),
    });
  };

  // ─────────────────────────────────────────────
  // TAB 3: Compliance Documents
  // ─────────────────────────────────────────────
  const [uploadingDocType, setUploadingDocType] = useState<DocumentType | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docIssueDate, setDocIssueDate] = useState<string | undefined>(undefined);
  const [docExpiryDate, setDocExpiryDate] = useState<string | undefined>(undefined);
  const [docNoExpiry, setDocNoExpiry] = useState<boolean>(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const openDocUploadModal = (docType: DocumentType) => {
    setUploadingDocType(docType);
    setUploadFile(null);
    setDocIssueDate(undefined);
    setDocExpiryDate(undefined);
    setDocNoExpiry(false);
  };

  const handleDocumentUpload = async () => {
    if (!uploadingDocType || !uploadFile) {
      toast.error("Please select a file to upload.");
      return;
    }

    const cfg = DOC_CONFIGS.find((c) => c.id === uploadingDocType);
    if (!cfg) return;

    if (cfg.isIssueMandatory) {
      if (!docIssueDate) {
        toast.error(`Please select the ${cfg.issueLabel}.`);
        return;
      }
      if (isAfter(startOfDay(new Date(docIssueDate)), startOfDay(new Date()))) {
        toast.error(`${cfg.issueLabel} must be today or in the past.`);
        return;
      }
    }

    if (cfg.isExpiryMandatory && !docNoExpiry) {
      if (!docExpiryDate) {
        toast.error("Please select the Expiration date.");
        return;
      }
      if (isBefore(startOfDay(new Date(docExpiryDate)), startOfDay(new Date()))) {
        toast.error("Expiration date must be today or in the future.");
        return;
      }
      if (docIssueDate && isBefore(startOfDay(new Date(docExpiryDate)), startOfDay(new Date(docIssueDate)))) {
        toast.error("Expiration date cannot be earlier than issue date.");
        return;
      }
    }

    setIsUploadingDoc(true);
    try {
      await uploadV2Document(
        companyId,
        uploadingDocType,
        uploadFile,
        undefined,
        {
          issuedAt: docIssueDate,
          expiresAt: docNoExpiry ? undefined : docExpiryDate,
          notApplicable: docNoExpiry,
        }
      );
      toast.success(`${cfg.label} uploaded successfully and submitted for review.`);
      setUploadingDocType(null);
      queryClient.invalidateQueries({ queryKey: ["my-companies"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.v2Company(companyId) });
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload document.");
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // ─────────────────────────────────────────────
  // TAB 4: Business Profile (Tenant-Scoped)
  // ─────────────────────────────────────────────
  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: queryKeys.profile(companyId),
    queryFn: getVendorProfile,
    enabled: !!companyId,
  });

  const [displayName, setDisplayName] = useState("");
  const [contactFirst, setContactFirst] = useState("");
  const [contactLast, setContactLast] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setContactFirst(profile.contactFirstName || "");
      setContactLast(profile.contactLastName || "");
      setPhone(profile.phone || "");
      setAddress(profile.address || "");
      setCountry(profile.country || "");
      setDescription(profile.description || "");
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (payload: any) => updateVendorProfile(payload),
    onSuccess: () => {
      toast.success(`Contact details updated for ${selectedCompany?.companyName || "company"}.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(companyId) });
    },
    onError: () => {
      toast.error("Could not update contact profile.");
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      displayName: displayName.trim(),
      contactFirstName: contactFirst.trim(),
      contactLastName: contactLast.trim(),
      phone: phone.trim(),
      address: address.trim(),
      country: country.trim(),
      description: description.trim(),
    });
  };

  if (isLoadingCompanies) {
    return <PageSpinner message="Loading settings..." />;
  }

  const effectiveDocuments = companyDetail?.documents || selectedCompany?.documents || [];

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* ── Page Header (Switching is handled via the top-left switcher) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organization Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage company-specific payment terms, banking details, compliance documents, and contact details.
          </p>
        </div>
      </div>

      {/* ── Active Scope Banner ── */}
      {selectedCompany && (
        <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex items-start gap-3 shadow-xs">
          <Building2 className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
          <div className="text-xs text-teal-900 leading-relaxed min-w-0">
            <div className="flex items-center gap-2 flex-wrap font-semibold text-teal-950">
              <span>Active Organization: {selectedCompany.companyName}</span>
              {selectedCompany.status && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                  {selectedCompany.status}
                </span>
              )}
            </div>
            <p className="mt-0.5">
              Settings, payment terms, and documents configured here are strictly scoped to your relationship with{" "}
              <strong>{selectedCompany.companyName}</strong>. To manage settings for another company, switch organizations using the switcher at the top left of the screen.
            </p>
          </div>
        </div>
      )}

      {/* ── Settings Tabs ── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab("payment-terms")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "payment-terms"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <CreditCard className="h-4 w-4" />
          Payment Terms
          {activeTerm && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.2 rounded-full font-medium border",
                activeStatus === "pending_review"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : activeStatus === "rejected"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}
            >
              {activeStatus === "pending_review"
                ? "Under Review"
                : activeStatus === "rejected"
                ? "Rejected"
                : "Active"}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("banking")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "banking"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="h-4 w-4" />
          Banking Details
        </button>

        <button
          onClick={() => setActiveTab("documents")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "documents"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-4 w-4" />
          Compliance Documents
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "profile"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Edit2 className="h-4 w-4" />
          Company Contact Profile
        </button>
      </div>

      {/* ── TAB 1 CONTENT: PAYMENT TERMS ── */}
      {activeTab === "payment-terms" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-border p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Current Payment Terms</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Terms negotiated and applied to orders &amp; invoices issued to {selectedCompany?.companyName}.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={openPaymentModal}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Change / Update Payment Terms
              </Button>
            </div>

            {/* Current Term Card */}
            {isLoadingPaymentTerms && isLoadingCompanyDetail ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Spinner className="h-5 w-5" />
                <span className="text-xs">Loading payment terms...</span>
              </div>
            ) : activeTerm ? (
              <div className="p-5 rounded-xl border border-border/80 bg-muted/20 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                      Term Name
                    </span>
                    <p className="text-lg font-bold text-foreground mt-0.5">{activeTerm.name}</p>
                  </div>
                  <div>
                    {activeStatus === "pending_review" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="h-3.5 w-3.5" /> Pending Organization Review
                      </span>
                    ) : activeStatus === "rejected" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle className="h-3.5 w-3.5" /> Rejected by Organization
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approved &amp; Active
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-3 border-t border-border/50">
                  <div>
                    <span className="text-xs text-muted-foreground">Due Period</span>
                    <p className="text-sm font-semibold text-foreground mt-0.5">
                      {activeTerm.days === 0 ? "Due upon receipt" : `${activeTerm.days} days`}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Revision</span>
                    <p className="text-sm font-semibold text-foreground mt-0.5">
                      v{activeTerm.revision || 1}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Submitted At</span>
                    <p className="text-sm text-foreground mt-0.5">
                      {currentSubmission?.submittedAt ? formatDate(currentSubmission.submittedAt) : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Status Note</span>
                    <p className="text-sm text-foreground mt-0.5">
                      {activeStatus === "pending_review"
                        ? "Under review by buyer"
                        : activeStatus === "approved"
                        ? "Active on orders & invoices"
                        : activeTerm.rejectionReason || "No note provided"}
                    </p>
                  </div>
                </div>

                {currentSubmission?.details && (
                  <div className="p-3 rounded-lg bg-white/80 border border-border/60 text-xs text-muted-foreground">
                    <strong className="text-foreground">Vendor Note:</strong> {currentSubmission.details}
                  </div>
                )}

                {activeTerm.rejectionReason && (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-rose-950">
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      Feedback from {selectedCompany?.companyName}:
                    </p>
                    <p className="pl-5.5">{activeTerm.rejectionReason}</p>
                    <p className="pl-5.5 text-[11px] text-rose-700 mt-1">
                      You can propose an adjusted payment term using the &quot;Change / Update Payment Terms&quot; button above.
                    </p>
                  </div>
                )}

                {activeStatus === "pending_review" && (
                  <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                    <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <p>
                      This payment term proposal was submitted for {selectedCompany?.companyName}&apos;s procurement and finance review.
                      Once approved, new purchase orders and invoices will automatically adopt these terms.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center rounded-xl border border-dashed border-border/80 space-y-2">
                <CreditCard className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-semibold text-foreground">No specific terms configured yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Click the button above to request or negotiate payment terms with {selectedCompany?.companyName}.
                </p>
              </div>
            )}

            {/* Revision / Submission History */}
            {companyPaymentTerms.length > 1 && (
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Submission History &amp; Revisions ({companyPaymentTerms.length})
                  </h4>
                </div>

                <div className="divide-y divide-border/60 rounded-xl border border-border/80 overflow-hidden bg-white">
                  {companyPaymentTerms.map((term) => (
                    <div
                      key={term.paymentTermId}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground">{term.name}</span>
                          <span className="text-muted-foreground font-mono">
                            ({term.days === 0 ? "Immediate" : `${term.days} days`})
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            v{term.revision}
                          </span>
                          {term.isCurrent && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              Current
                            </span>
                          )}
                        </div>
                        {term.details && (
                          <p className="text-muted-foreground line-clamp-1 italic">
                            &ldquo;{term.details}&rdquo;
                          </p>
                        )}
                        {term.rejectionReason && (
                          <p className="text-rose-600 font-medium">
                            Feedback: {term.rejectionReason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <span className="text-muted-foreground text-[11px]">
                          {formatDate(term.submittedAt)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                            term.status === "approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : term.status === "pending_review"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : term.status === "rejected"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {term.status === "approved"
                            ? "Approved"
                            : term.status === "pending_review"
                            ? "Pending Review"
                            : term.status === "rejected"
                            ? "Rejected"
                            : term.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2 CONTENT: BANKING DETAILS ── */}
      {activeTab === "banking" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-border p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Payout Bank Account</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Account where {selectedCompany?.companyName} deposits payments for approved invoices.
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={() => setIsBankModalOpen(true)}>
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                Update Bank Account
              </Button>
            </div>

            {effectiveBanking?.bankName ? (
              <div className="p-5 rounded-xl border border-border/80 bg-muted/20 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Bank Name</span>
                    <p className="text-sm font-bold text-foreground mt-0.5">
                      {effectiveBanking.bankName}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Account Number</span>
                    <p className="text-sm font-mono font-bold text-foreground mt-0.5">
                      {effectiveBanking.maskedAccountNumber || "••••••••••"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Account Name</span>
                    <p className="text-sm font-semibold text-foreground mt-0.5">
                      {effectiveBanking.accountName || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Verification Status</span>
                    <p className="text-sm font-semibold text-emerald-700 mt-0.5 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Active for disbursements
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-xl border border-dashed border-border/80 space-y-2">
                <Building2 className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-semibold text-foreground">No bank account linked for this company</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Provide your payout details so {selectedCompany?.companyName} can disburse funds to you.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3 CONTENT: COMPLIANCE DOCUMENTS ── */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-border p-6 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-foreground">Documents on File</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Certificates and verification files shared with {selectedCompany?.companyName}.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {DOC_CONFIGS.map((cfg) => {
                const uploaded = effectiveDocuments.find(
                  (d: any) => d.documentType === cfg.id
                );
                const hasFile = Boolean(uploaded);

                return (
                  <div
                    key={cfg.id}
                    className="p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5 shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-foreground truncate">{cfg.label}</p>
                          {cfg.isIssueMandatory && (
                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-100 text-slate-700">
                              Mandatory
                            </span>
                          )}
                        </div>
                        {hasFile ? (
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{uploaded?.originalName}</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded &amp; Verified
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Not uploaded for this organization yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {uploaded?.fileUrl && (
                        <a
                          href={uploaded.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="h-3 w-3" /> View
                        </a>
                      )}
                      <Button
                        variant={hasFile ? "outline" : "primary"}
                        size="sm"
                        onClick={() => openDocUploadModal(cfg.id)}
                      >
                        <UploadCloud className="h-3.5 w-3.5 mr-1.5" />
                        {hasFile ? "Upload New Version" : "Upload Document"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4 CONTENT: COMPANY CONTACT PROFILE ── */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-border p-6 shadow-xs">
            <h3 className="text-base font-bold text-foreground mb-1">Company Contact Profile</h3>
            <p className="text-xs text-muted-foreground mb-6">
              Contact information visible to {selectedCompany?.companyName} on purchase orders, receipt
              inspections, and invoice reviews.
            </p>

            <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g. Dell supplies"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="+234 801 234 5678"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Contact First Name</label>
                  <input
                    type="text"
                    value={contactFirst}
                    onChange={(e) => setContactFirst(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Contact Last Name</label>
                  <input
                    type="text"
                    value={contactLast}
                    onChange={(e) => setContactLast(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Business Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Short Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Optional brief description of your supply specialty"
                />
              </div>

              <div className="pt-2">
                <Button type="submit" variant="primary" loading={updateProfileMutation.isPending}>
                  Save Changes for {selectedCompany?.companyName}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 1: CHANGE / PROPOSE PAYMENT TERMS ── */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent size="lg">
          <DialogTitle>Update Payment Terms with {selectedCompany?.companyName}</DialogTitle>
          <DialogDescription>
            Choose your preferred payment arrangement or propose custom terms. All submissions undergo review
            by {selectedCompany?.companyName}&apos;s finance team.
          </DialogDescription>

          <div className="space-y-5 mt-4">
            {/* Optional Reuse Banner (if vendor has terms from other companies) */}
            {allTerms.length > 0 && (
              <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/50">
                <button
                  type="button"
                  onClick={() => setIsReuseMode(false)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                    !isReuseMode
                      ? "bg-white text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Configure Terms
                </button>
                <button
                  type="button"
                  onClick={() => setIsReuseMode(true)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                    isReuseMode
                      ? "bg-white text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Reuse Previous ({allTerms.length})
                </button>
              </div>
            )}

            {isReuseMode && allTerms.length > 0 ? (
              /* Reuse Mode List */
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select a previously agreed payment term
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {allTerms.map((term) => {
                    const isSelected = selectedReuseTermId === term.paymentTermId;
                    return (
                      <div
                        key={term.paymentTermId}
                        onClick={() => setSelectedReuseTermId(term.paymentTermId)}
                        className={cn(
                          "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                            : "border-border/70 hover:border-border hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                              isSelected ? "border-primary bg-white" : "border-slate-300 bg-white"
                            )}
                          >
                            {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground truncate">{term.name}</span>
                              <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-foreground font-mono font-medium">
                                {term.days === 0 ? "Due on receipt" : `${term.days} days`}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              Configured with {term.companyName}
                            </p>
                          </div>
                        </div>

                        <span
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0",
                            term.status === "approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {term.status === "approved" ? "Approved" : term.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Configure Terms Mode: The 3 Canonical Arrangements */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Preferred payment arrangement
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* 1. Specified Days */}
                    <button
                      type="button"
                      onClick={() => setArrangementType("specified_days")}
                      className={cn(
                        "flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                        arrangementType === "specified_days"
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                          : "border-border hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-lg mb-2",
                          arrangementType === "specified_days" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-foreground">Specified Days</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">Fixed due period (Net days)</span>
                    </button>

                    {/* 2. Upon Delivery */}
                    <button
                      type="button"
                      onClick={() => setArrangementType("upon_delivery")}
                      className={cn(
                        "flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                        arrangementType === "upon_delivery"
                          ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600 shadow-xs"
                          : "border-border hover:border-emerald-500/40 hover:bg-muted/30"
                      )}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-lg mb-2",
                          arrangementType === "upon_delivery" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Truck className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-foreground">Upon Delivery</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">Due on receipt (0 days)</span>
                    </button>

                    {/* 3. Per Invoice */}
                    <button
                      type="button"
                      onClick={() => setArrangementType("per_invoice")}
                      className={cn(
                        "flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                        arrangementType === "per_invoice"
                          ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600 shadow-xs"
                          : "border-border hover:border-teal-500/40 hover:bg-muted/30"
                      )}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-lg mb-2",
                          arrangementType === "per_invoice" ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-foreground">Per Invoice</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">Set terms per bill</span>
                    </button>
                  </div>
                </div>

                {/* Sub-form 1: Specified Days */}
                {arrangementType === "specified_days" && (
                  <div className="space-y-3 pt-1">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Select payment period
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {netOptions.map((opt) => {
                        const isSelected = !isCustomDays && selectedPeriodName === opt.name;
                        return (
                          <button
                            key={opt.vendorPaymentTermOptionId}
                            type="button"
                            onClick={() => {
                              setSelectedPeriodName(opt.name);
                              setIsCustomDays(false);
                            }}
                            className={cn(
                              "p-2.5 rounded-xl border text-center transition-all cursor-pointer",
                              isSelected
                                ? "border-primary bg-primary text-white font-bold shadow-xs"
                                : "border-border hover:border-primary/50 text-foreground bg-white"
                            )}
                          >
                            <div className="text-xs font-bold">{opt.name}</div>
                            <div className={cn("text-[10px]", isSelected ? "text-white/80" : "text-muted-foreground")}>
                              {opt.days} days
                            </div>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setIsCustomDays(true)}
                        className={cn(
                          "p-2.5 rounded-xl border text-center transition-all cursor-pointer",
                          isCustomDays
                            ? "border-primary bg-primary text-white font-bold shadow-xs"
                            : "border-border hover:border-primary/50 text-foreground bg-white"
                        )}
                      >
                        <div className="text-xs font-bold">Custom</div>
                        <div className={cn("text-[10px]", isCustomDays ? "text-white/80" : "text-muted-foreground")}>
                          Propose days
                        </div>
                      </button>
                    </div>

                    {isCustomDays && (
                      <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3 mt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">
                              Payment Days *
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={customDaysValue}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setCustomDaysValue(val);
                                setCustomNameValue(`Net ${val} days`);
                              }}
                              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">
                              Term Name *
                            </label>
                            <input
                              type="text"
                              value={customNameValue}
                              onChange={(e) => setCustomNameValue(e.target.value)}
                              placeholder="e.g. Net 45 days"
                              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-form 2: Upon Delivery */}
                {arrangementType === "upon_delivery" && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 flex items-start gap-3">
                    <Truck className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-950 leading-relaxed">
                      <p className="font-bold text-sm text-emerald-900">Payment Upon Delivery</p>
                      <p className="mt-0.5 text-emerald-800">
                        Invoices become due immediately upon confirmed physical receipt / delivery of items (0 days / Due on receipt).
                      </p>
                    </div>
                  </div>
                )}

                {/* Sub-form 3: Per Invoice */}
                {arrangementType === "per_invoice" && (
                  <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/70 flex items-start gap-3">
                    <CalendarClock className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-teal-950 leading-relaxed">
                      <p className="font-bold text-sm text-teal-900">Specify Terms Per Invoice</p>
                      <p className="mt-0.5 text-teal-800">
                        Instead of a fixed schedule, you will declare the specific due date on each invoice when billing {selectedCompany?.companyName}.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Additional terms or notes (optional) */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Additional notes or justification (optional)
              </label>
              <textarea
                value={termNotes}
                onChange={(e) => setTermNotes(e.target.value)}
                placeholder="E.g. Standard terms for supply agreements, milestone disbursements, or supply category"
                rows={2}
                className="w-full rounded-xl border border-border p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsPaymentModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                loading={savePaymentTermMutation.isPending}
                onClick={handleSavePaymentTerm}
              >
                Submit for Review
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 2: UPDATE BANKING DETAILS ── */}
      <Dialog open={isBankModalOpen} onOpenChange={setIsBankModalOpen}>
        <DialogContent size="md">
          <DialogTitle>Update Payout Account for {selectedCompany?.companyName}</DialogTitle>
          <DialogDescription>
            Specify the bank account to receive disbursements from {selectedCompany?.companyName}.
          </DialogDescription>

          <div className="space-y-3 mt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Bank Name *</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Zenith Bank, Access Bank"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Account Number *</label>
              <input
                type="text"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="10-digit account number"
                className="w-full text-sm font-mono border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Account Name *</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Exact name on bank account"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <strong>Notice:</strong> Account changes will be verified by {selectedCompany?.companyName} before
              future disbursements are routed to the new account.
            </div>

            <div className="flex gap-3 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsBankModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                loading={saveBankMutation.isPending}
                onClick={handleSaveBank}
              >
                Save &amp; Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 3: UPLOAD / REPLACE DOCUMENT ── */}
      <Dialog open={!!uploadingDocType} onOpenChange={(open) => !open && setUploadingDocType(null)}>
        <DialogContent size="md">
          {(() => {
            const cfg = DOC_CONFIGS.find((c) => c.id === uploadingDocType);
            if (!cfg) return null;

            return (
              <>
                <DialogTitle>Upload {cfg.label}</DialogTitle>
                <DialogDescription>
                  Upload your updated compliance document for {selectedCompany?.companyName}.
                </DialogDescription>

                <div className="space-y-4 mt-4">
                  {/* File input */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Document File (PDF, JPG, PNG) *
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-sm border border-border rounded-lg p-2 focus:outline-none"
                    />
                    {uploadFile && (
                      <p className="text-xs text-primary font-medium mt-1 truncate">
                        Selected: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                  </div>

                  {/* Issue Date */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/20 border border-border">
                    <span className="text-xs font-medium text-foreground whitespace-nowrap">
                      {cfg.issueLabel}
                      {cfg.isIssueMandatory ? (
                        <span className="text-red-500 font-bold ml-1">*</span>
                      ) : (
                        <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                      )}
                    </span>
                    <div className="w-36">
                      <DatePicker
                        date={parseLocalDate(docIssueDate)}
                        onSelect={(d) => {
                          if (d && isAfter(startOfDay(d), startOfDay(new Date()))) {
                            toast.error(`${cfg.issueLabel} must be today or in the past`);
                            return;
                          }
                          setDocIssueDate(d ? format(d, "yyyy-MM-dd") : undefined);
                        }}
                        disabled={(d) => isAfter(startOfDay(d), startOfDay(new Date()))}
                        placeholder="dd/mm/yyyy"
                      />
                    </div>
                  </div>

                  {/* Expiration Date */}
                  <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/20 border border-border">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground whitespace-nowrap">
                          Expiration date
                          {cfg.isExpiryMandatory && !docNoExpiry ? (
                            <span className="text-red-500 font-bold ml-1">*</span>
                          ) : (
                            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                          )}
                        </span>
                        {cfg.hasNotApplicable && (
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-2">
                            <input
                              type="checkbox"
                              checked={docNoExpiry}
                              onChange={(e) => {
                                setDocNoExpiry(e.target.checked);
                                if (e.target.checked) setDocExpiryDate(undefined);
                              }}
                              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                            />
                            <span>Does not expire</span>
                          </label>
                        )}
                      </div>
                      <div className="w-36">
                        <DatePicker
                          date={parseLocalDate(docExpiryDate)}
                          isDisabled={docNoExpiry}
                          onSelect={(d) => {
                            if (d && isBefore(startOfDay(d), startOfDay(new Date()))) {
                              toast.error("Expiration date must be today or in the future");
                              return;
                            }
                            setDocExpiryDate(d ? format(d, "yyyy-MM-dd") : undefined);
                          }}
                          disabled={(d) => isBefore(startOfDay(d), startOfDay(new Date()))}
                          placeholder={docNoExpiry ? "No expiry" : "dd/mm/yyyy"}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-3 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setUploadingDocType(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      className="flex-1"
                      loading={isUploadingDoc}
                      onClick={handleDocumentUpload}
                    >
                      Upload &amp; Submit
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

