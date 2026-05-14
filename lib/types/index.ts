// ─────────────────────────────────────────────
// AUTH & VENDOR
// ─────────────────────────────────────────────

export type VendorStatus =
  | "draft"
  | "invited"
  | "pending_approval"
  | "verified"
  | "active"
  | "flagged"
  | "rejected";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "submitted"
  | "under_review"
  | "pending_approval";

export interface AuthUser {
  id: string;
  email: string;
  business_name: string;
  avatar_url?: string;
  status: VendorStatus;
  approvalStatus?: ApprovalStatus;
  onboardingStatus?: OnboardingStatus;
}

export interface InviteTokenPayload {
  token: string;
  email: string;
  business_name: string;
  invited_by_org: string;
  expires_at: string; // ISO string
  already_onboarded: boolean;
}

// ─────────────────────────────────────────────
// ORGANISATION
// ─────────────────────────────────────────────

export type OrgRole = "admin" | "viewer" | "contributor";

export interface Organization {
  id: string;
  name: string;
  vendor_id: string; // This vendor's ID within the org
  role: OrgRole;
  status: VendorStatus; // Status specific to this org relationship
  logo_url?: string;
}

// ─────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────

export interface BusinessIdentityForm {
  business_name: string;
  business_email: string;
  registration_number: string;
  country: string;
  business_address: string;
}

export interface BankingDetailsForm {
  bank_name: string;
  account_number: string;
  account_name?: string; // resolved from API
  flag_note?: string; // if name mismatch, vendor can add note
}

export type DocumentType =
  | "certificate_of_incorporation"
  | "tax_certificate"
  | "government_id"
  | "bank_document";

export interface DocumentUpload {
  type: DocumentType;
  label: string;
  required: boolean;
  file?: File;
  file_name?: string;
  url?: string;
  uploaded?: boolean;
}

export interface VerificationStatus {
  identity_match: "pass" | "fail" | "pending";
  bank_match: "pass" | "flagged" | "pending";
  bank_match_score?: number; // 0–100
  bank_resolved_name?: string;
  sanctions_clear?: boolean;
}

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────

export type OrderStatus =
  | "assigned"
  | "acknowledged"
  | "ready_for_delivery"
  | "delivered"
  | "invoiced";

export type OrderPriority = "low" | "medium" | "urgent";

export type DeliveryType = "full" | "partial";

export interface OrderItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  delivered_quantity?: number;
  remaining_quantity?: number;
  delivery_date?: string; // ISO
  unit_price?: number;
}

export interface Order {
  id: string;
  po_number: string;
  org_id: string;
  organization: string;
  issue_date: string; // ISO
  deadline: string; // ISO
  priority: OrderPriority;
  status: OrderStatus;
  delivery_status: "pending" | "delivered" | "partial";
  delivery_type?: DeliveryType;
  items: OrderItem[];
  workflow: WorkflowStep[];
}

export interface WorkflowStep {
  status: OrderStatus;
  label: string;
  completed: boolean;
  timestamp?: string; // ISO
}

// ─────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────

export type InvoiceStatus =
  | "draft"
  | "pending"
  | "under_review"
  | "flagged"
  | "approved"
  | "paid";

export type InvoicePaymentStatus = "pending" | "in_progress" | "paid";

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  org_id: string;
  organization: string;
  related_po?: string;
  status: InvoiceStatus;
  payment_status: InvoicePaymentStatus;
  submission_date?: string; // ISO
  amount: number;
  tax_rate: number;
  subtotal: number;
  total_amount: number;
  delivery_date?: string;
  items: InvoiceItem[];
  workflow: InvoiceWorkflowStep[];
}

export interface InvoiceWorkflowStep {
  status: string;
  label: string;
  completed: boolean;
  timestamp?: string;
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

export interface DashboardStats {
  active_pos: number;
  invoices_under_review: number;
  payments_in_progress: number;
  total_paid: number;
  currency: string;
}

// ─────────────────────────────────────────────
// API RESPONSE WRAPPERS
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
}

// ─────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────

export interface OrderFilters {
  status?: OrderStatus | "all";
  search?: string;
  page?: number;
  per_page?: number;
}

export interface InvoiceFilters {
  status?: InvoiceStatus | "all";
  search?: string;
  page?: number;
  per_page?: number;
}
