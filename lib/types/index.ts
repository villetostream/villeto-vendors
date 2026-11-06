// ─────────────────────────────────────────────
// AUTH & VENDOR (multi-company model)
// ─────────────────────────────────────────────

/**
 * Real backend values observed so far: "Inactive", "active" — casing is
 * inconsistent across endpoints (flagged with backend, not yet fixed).
 * Always compare using `isStatusActive()` from lib/utils, never `=== "active"`
 * directly, until the backend confirms canonical casing.
 */
export type VendorStatus =
  | "active"
  | "inactive"
  | "deactivated"
  | "suspended"
  | "banned";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "submitted"
  | "under_review"
  | "pending_approval"
  | "profile_review"
  | "invited";

/**
 * "full_onboarding": vendor is new, goes through the wizard.
 * "review_and_submit": vendor already has a VendorProfile from another
 * tenant — they only confirm/submit, no re-upload.
 */
export type OnboardingMode = "full_onboarding" | "review_and_submit" | "profile_reuse_review";

export interface VendorDocument {
  vendorDocumentId: string;
  documentType: DocumentType;
  fileUrl: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  verificationStatus: "pending" | "verified" | "rejected";
}

export interface VendorDocumentsState {
  isComplete: boolean;
  uploaded: VendorDocument[];
  required: { documentType: DocumentType; uploaded: boolean; required: boolean }[];
  optional: { documentType: DocumentType; uploaded: boolean; required: boolean }[];
}

export interface VendorBusinessIdentity {
  businessName: string;
  email: string;
  registrationNumber: string;
  country: string;
  businessAddress: string;
  isComplete: boolean;
}

export interface VendorBankingDetails {
  bankName: string;
  accountNumber: string;
  accountName?: string;
  routingNumber?: string;
  isComplete: boolean;
}

/**
 * The full vendor context for the *currently selected* company —
 * returned by login and switch-company as `currentVendor` / `data`.
 */
export interface CurrentVendor {
  vendorId: string; // company-specific vendor row id
  vendorAccountId: string; // global login identity
  vendorProfileId: string; // reusable profile id
  companyId: string;
  companyName: string;
  email: string;
  legalName: string;
  displayName: string;
  onboardingStatus: OnboardingStatus;
  approvalStatus: ApprovalStatus | null;
  decisionNote: string | null;
  status: string; // raw, possibly inconsistently-cased — normalize before use
  isPaymentEnabled: boolean;
  onboardingMode: OnboardingMode;
  currentStep: string;
  nextAction?: string;
  businessIdentity: VendorBusinessIdentity;
  bankingDetails: VendorBankingDetails;
  documents: VendorDocumentsState;
}

/** One row from GET /vendors/me/companies — a tenant relationship. */
export interface CompanyRelationship {
  vendorId: string;
  companyId: string;
  companyName: string;
  status: string; // raw, possibly inconsistently-cased
  onboardingStatus: OnboardingStatus;
  approvalStatus: ApprovalStatus | null;
  isPaymentEnabled: boolean;
}

/** Simplified user shape kept for components that only need identity bits. */
export interface AuthUser {
  id: string; // = vendorId (company-scoped)
  vendorAccountId?: string;
  companyId?: string;
  companyName?: string;
  email: string;
  business_name: string;
  avatar_url?: string;
  status?: string;
  approvalStatus?: ApprovalStatus | null;
  onboardingStatus?: OnboardingStatus;
  decisionNote?: string | null;
  isPaymentEnabled?: boolean;
  currentStep?: string;
}

export interface InviteTokenPayload {
  token: string;
  email: string;
  business_name: string;
  invited_by_org: string;
  expires_at: string;
  already_onboarded: boolean;
}

/** POST /vendors/invitations/preview response */
export interface InvitePreviewResult {
  vendorId: string;
  vendorInvitationId: string;
  email: string;
  displayName: string;
  legalName: string;
  onboardingStatus: string;
  expiresAt: string;
  isExpired: boolean;
  isConsumed: boolean;
  inviteeType: "new_vendor" | "existing_vendor";
  nextAction: "set_password" | "verify_existing_password" | "login_to_accept";
  companyId: string;
  companyName: string;
  accountExists: boolean;
  requiresPasswordSetup: boolean;
  requiresExistingPassword: boolean;
  hasReusableProfile: boolean;
  hasActiveVendorRelationship: boolean;
}

// ─────────────────────────────────────────────
// PROFILE FIELD TIERS (Tier 1 locked / Tier 2 tenant-editable)
// Internal proposal — not yet a backend contract. See PROFILE_FIELD_TIERS.
// ─────────────────────────────────────────────

export type LockedIdentityField =
  | "legalName"
  | "registrationNumber"
  | "certificate_of_incorporation"
  | "tax_certificate"
  | "government_id";

export type TenantEditableField =
  | "displayName"
  | "phone"
  | "description"
  | "contactFirstName"
  | "contactLastName"
  | "address"
  | "country"
  | "bankName"
  | "accountNumber"
  | "routingNumber";

// ─────────────────────────────────────────────
// VENDOR PROFILE (GET/PATCH /vendor-portal/profile)
// ─────────────────────────────────────────────

export interface VendorProfile {
  vendorId: string;
  email: string;
  legalName: string;
  displayName: string;
  phone: string | null;
  description: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  address: string | null;
  country: string | null;
  status: string;
  onboardingStatus: OnboardingStatus;
  approvalStatus: ApprovalStatus;
  decisionNote: string | null;
  isPaymentEnabled: boolean;
}

export interface UpdateVendorProfilePayload {
  displayName?: string;
  phone?: string;
  description?: string;
  contactFirstName?: string;
  contactLastName?: string;
  address?: string;
  country?: string;
}

// ─────────────────────────────────────────────
// PURCHASE ORDERS (real vendor-portal contract)
// ─────────────────────────────────────────────

export type OrderStatus =
  | "draft"
  | "issued"
  | "acknowledged"
  | "ready_for_delivery"
  | "partially_delivered"
  | "partially_delivered_with_exceptions"
  | "delivered"
  | "delivered_with_exceptions"
  | "closed"
  | "cancelled";

export type OrderPriority = "low" | "medium" | "urgent";

export type FulfillmentDeclaration = "full" | "partial";

export type FulfillmentMethod = "carrier" | "vendor_truck" | "digital" | "service";

export type RemainingDisposition = "backordered" | "cannot_fulfill";

export type FulfillmentState =
  | "not_started"
  | "partially_ready"
  | "backordered"
  | "fully_ready"
  | "cannot_fulfill";

export type FulfillmentDispatchStatus = "ready" | "dispatched" | "not_applicable" | "unknown";

export type FulfillmentDeliveryState =
  | "not_started"
  | "ready"
  | "partially_dispatched"
  | "dispatched"
  | "partially_received"
  | "received";

export interface OrderVendorRef {
  vendorId: string;
  displayName: string;
  legalName: string;
  email: string;
}

export interface OrderPaymentTermRef {
  paymentTermId: string;
  code: string;
  name: string;
  days: number;
}

export interface OrderLineItem {
  purchaseOrderLineItemId: string;
  purchaseRequestLineItemId?: string;
  createdAt?: string;
  updatedAt?: string;
  name: string;
  description?: string;
  quantity: number;
  shortClosedQuantity?: number;
  shortCloseReason?: string | null;
  shortClosedAt?: string | null;
  quantityInvoiceable?: number;
  unitPrice: number;
  subtotal: number;
  taxAmount: number;
  lineTotal: number;
  sku?: string;
  unitOfMeasure?: string;
  categoryId?: string;
  categoryName?: string;
  departmentId?: string;
  accountingResolutionStatus?: string;
  deliveryDate?: string;

  // ── Fulfillment tracking (backend-confirmed) ──
  deliveredQuantity?: number;
  quantityShipped?: number;
  quantityReady?: number;
  quantityRemainingToReady?: number;
  quantityReceived?: number;
  quantityPhysicallyReceived?: number;
  quantityAccepted?: number;
  quantityForfeited?: number;
  invoiceableSubtotal?: number;
  quantityDispatched?: number;
  quantityAwaitingDispatch?: number;
  quantityAwaitingReceipt?: number;
  deliveryState?: FulfillmentDeliveryState;
  quantityOutstanding?: number;
  remainingDisposition?: RemainingDisposition | null;
  expectedReadyDate?: string | null;
  dispositionReason?: string;
  reason?: string;
  fulfillmentState?: FulfillmentState;
  fulfillmentTransportScope?: "physical" | "non_physical" | "mixed" | "unknown" | string;
}

// ── Delivery Notice / Fulfillment & Receipt Exception records ──

export type InspectionOutcome =
  | "awaiting_inspection"
  | "accepted"
  | "accepted_with_exceptions"
  | "rejected"
  | "confirmed"
  | "confirmed_with_exceptions";

export type ExceptionResolutionStatus =
  | "not_required"
  | "awaiting_vendor_response"
  | "acknowledged"
  | "disputed"
  | "corrective_action_pending"
  | "resolved"
  | "backordered"
  | "forfeited"
  | "under_company_review"
  | "resolved_after_dispute";

export type DeliveryOutcome =
  | "not_delivered"
  | "fully_delivered"
  | "full_delivery_with_exceptions"
  | "partially_delivered"
  | "partial_delivery_with_exceptions"
  | "partially_delivered_with_exceptions"
  | "delivered"
  | "delivered_with_exceptions";

export type FinalDecisionType =
  | "uphold_buyer_finding"
  | "accept_vendor_dispute"
  | "revise_buyer_finding";

export type VendorResolutionAction = "backorder" | "forfeit" | "dispute";

export interface ReceiptEvidenceItem {
  url: string;
  publicId: string;
  mimeType: string;
  originalName?: string;
  size?: number;
  purchaseOrderLineItemIds?: string[];
}

export interface DeliveryReceiptLineItem {
  deliveryReceiptLineItemId: string;
  purchaseOrderLineItemId: string;
  fulfillmentLineItemId?: string;
  name: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected: number;
  quantityMissing: number;
  exceptionReason?: string | null;
  finalQuantityAccepted?: number | null;
  finalQuantityRejected?: number | null;
  finalQuantityMissing?: number | null;
  resolutionStatus?: ExceptionResolutionStatus;
  vendorDisposition?: VendorResolutionAction | null;
  expectedRedeliveryDate?: string | null;
  vendorResponseReason?: string | null;
  notes?: string | null;
}

export interface FulfillmentExceptionListItem {
  deliveryReceiptId: string;
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  fulfillmentId?: string;
  fulfillmentReference: string;
  inspectionOutcome: string;
  resolutionStatus: ExceptionResolutionStatus;
  finalDecision?: FinalDecisionType | null;
  vendorActionRequired: boolean;
  companyActionRequired: boolean;
  receivedAt: string;
  resolvedAt?: string | null;
  updatedAt: string;
}

export interface FulfillmentExceptionDetail {
  deliveryReceiptId: string;
  receiptNumber: string;
  receiptReference?: string;
  status: string;
  confirmationOutcome: string;
  inspectionOutcome: string;
  resolutionStatus: ExceptionResolutionStatus;
  vendorResponse?: string | null;
  vendorResponseReason?: string | null;
  vendorRespondedAt?: string | null;
  vendorDisposition?: VendorResolutionAction | null;
  expectedRedeliveryDate?: string | null;
  finalDecision?: FinalDecisionType | null;
  decisionVersion?: number;
  decisionHistory?: Record<string, unknown>[];
  vendorActionRequired: boolean;
  companyActionRequired: boolean;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  evidence?: ReceiptEvidenceItem[];
  vendorEvidence?: ReceiptEvidenceItem[];
  purchaseOrderId: string;
  poNumber: string;
  confirmedByName?: string | null;
  confirmedById?: string | null;
  fulfillmentId: string;
  fulfillmentReference?: string | null;
  lineItems: DeliveryReceiptLineItem[];
}

export interface AcknowledgeReceiptLineItemPayload {
  deliveryReceiptLineItemId: string;
  disposition: "backorder" | "forfeit";
  expectedRedeliveryDate?: string;
  reason?: string;
}

export interface AcknowledgeReceiptPayload {
  disposition?: "backorder" | "forfeit";
  expectedRedeliveryDate?: string;
  reason?: string;
  lineItems?: AcknowledgeReceiptLineItemPayload[];
}

export interface DisputeReceiptLineItemPayload {
  deliveryReceiptLineItemId: string;
  quantityAccepted: number;
  quantityRejected: number;
  quantityMissing: number;
  reason?: string;
}

export interface DisputeReceiptPayload {
  reason: string;
  lineItems: DisputeReceiptLineItemPayload[];
  evidence?: ReceiptEvidenceItem[];
}

export interface FulfillmentExceptionFilters {
  page?: number;
  limit?: number;
  resolutionStatus?: ExceptionResolutionStatus | "all";
}

export interface LineItemResolution {
  purchaseOrderLineItemId: string;
  deliveryReceiptLineItemId?: string;
  vendorDeliveryNoticeLineItemId?: string;
  name: string;
  quantityRejected: number;
  quantityMissing?: number;
  quantityAccepted?: number;
  proposedQuantityAccepted?: number;
  proposedQuantityRejected?: number;
  proposedQuantityMissing?: number;
  buyerReason?: string;
  buyerCategory?: string;
  action: VendorResolutionAction;
  expectedReadyDate?: string;
  reason?: string;
  disputeReason?: string;
  attachmentName?: string;
  attachmentFile?: File;
}

export interface UnifiedResolutionPayload {
  fulfillmentId: string;
  deliveryReceiptId?: string;
  shipmentReference?: string;
  overallStatus: "acknowledged" | "disputed" | "mixed";
  resolutions: LineItemResolution[];
  globalAttachmentFile?: File;
  notes?: string;
}

export interface AcknowledgeResolutionPayload {
  fulfillmentId: string;
  shipmentReference?: string;
  resolutionType: "backorder" | "forfeit" | "mixed";
  expectedReadyDate?: string;
  resolutions: LineItemResolution[];
  notes?: string;
}

export interface DisputeResolutionPayload {
  fulfillmentId: string;
  shipmentReference?: string;
  disputeReason: string;
  attachmentName?: string;
  attachmentFile?: File;
  lineItemIds?: string[];
}

export interface FulfillmentLineItem {
  vendorDeliveryNoticeLineItemId: string;
  deliveryReceiptLineItemId?: string;
  fulfillmentLineItemId?: string;
  purchaseOrderLineItemId: string;
  name: string;
  quantityOrdered: number;
  quantityShipped: number;
  quantityReady?: number;
  remainingDisposition?: RemainingDisposition | null;
  expectedReadyDate?: string | null;
  dispositionReason?: string;
  reason?: string;
  quantityReceived?: number;
  quantityAwaitingReceipt?: number;

  // ── Line-level Inspection & Resolution ──
  quantityAccepted?: number;
  quantityRejected?: number;
  quantityMissing?: number;
  exceptionReason?: string | null;
  rejectionReason?: string;
  rejectionCategory?: string;
  finalQuantityAccepted?: number | null;
  finalQuantityRejected?: number | null;
  finalQuantityMissing?: number | null;
  inspectionOutcome?: InspectionOutcome;
  resolutionStatus?: ExceptionResolutionStatus;
  vendorDisposition?: VendorResolutionAction | null;
  expectedRedeliveryDate?: string | null;
  vendorResponseReason?: string | null;
  resolutionAction?: VendorResolutionAction;
}

export interface Fulfillment {
  vendorDeliveryNoticeId: string;
  fulfillmentId?: string;
  deliveryReceiptId?: string;
  receiptNumber?: string;
  shipmentReference: string;
  fulfillmentReference?: string | null;
  declaration?: FulfillmentDeclaration | null;
  fulfillmentMethod?: FulfillmentMethod | null;
  status: "submitted" | "cancelled";
  shippedAt: string;
  readyAt?: string | null;
  dispatchedAt?: string | null;
  dispatchReference?: string | null;
  dispatchStatus?: FulfillmentDispatchStatus;
  expectedDeliveryDate?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  packingSlipNumber?: string | null;
  notes?: string | null;
  isPartial: boolean;
  lineItems: FulfillmentLineItem[];

  // ── Inspection & Exception Resolution Fields ──
  confirmationOutcome?: string;
  inspectionOutcome?: InspectionOutcome;
  resolutionStatus?: ExceptionResolutionStatus;
  vendorActionRequired?: boolean;
  companyActionRequired?: boolean;
  vendorDisposition?: VendorResolutionAction | null;
  expectedRedeliveryDate?: string | null;
  vendorResponseReason?: string | null;
  finalDecision?: FinalDecisionType | null;
  decisionVersion?: number;
  decisionHistory?: Record<string, unknown>[];
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  evidence?: ReceiptEvidenceItem[];
  vendorEvidence?: ReceiptEvidenceItem[];
  totalDeliveredQuantity?: number;
  totalAcceptedQuantity?: number;
  totalRejectedQuantity?: number;
  totalMissingQuantity?: number;
  rejectionReason?: string;
  rejectionCategory?: string;
  buyerNotes?: string;
  buyerAttachmentName?: string;
  buyerAttachmentUrl?: string;
}

export interface OrderLegalEntityRef {
  legalEntityId: string;
  code: string;
  legalName: string;
  baseCurrency: string;
  readinessStatus?: "provisional" | string;
}

/** Row shape from the list endpoint — lighter than the detail shape. */
export interface OrderListItem {
  purchaseOrderId: string;
  poNumber: string;
  status: OrderStatus;
  deliveryState?: FulfillmentDeliveryState;
  deliveryOutcome?: DeliveryOutcome | string;
  resolutionStatus?: ExceptionResolutionStatus;
  openExceptionCount?: number;
  vendorResponseRequired?: boolean;
  vendorActionRequired?: boolean;
  companyActionRequired?: boolean;
  fulfillmentState?: FulfillmentState;
  fulfillmentTransportScope?: "physical" | "non_physical" | "mixed" | "unknown";
  quantityOrdered?: number;
  quantityReady?: number;
  quantityDispatched?: number;
  quantityReceived?: number;
  quantityPhysicallyReceived?: number;
  quantityAccepted?: number;
  quantityForfeited?: number;
  quantityOutstanding?: number;
  invoiceableSubtotal?: number;
  quantityAwaitingDispatch?: number;
  quantityAwaitingReceipt?: number;
  quantityRemainingToReady?: number;
  vendor: OrderVendorRef;
  lineItemCount: number;
  sourcePurchaseRequestLineItemIds: string[];
  currency: string;
  legalEntity?: OrderLegalEntityRef | null;
  totalAmount: number;
}

export interface TimelineEvent {
  action: string;
  timestamp: string;
  performedBy: {
    actorId?: string;
    actorType: "company_user" | "vendor" | "system" | Record<string, unknown> | string;
    firstName?: string;
    lastName?: string;
    roleName?: string;
    roleNames?: string[];
    vendorId?: string;
    email?: string;
    vendorName?: string;
    [key: string]: unknown;
  };
  notes?: string;
}

export interface Order {
  purchaseOrderId: string;
  createdAt?: string;
  updatedAt?: string;
  poNumber: string;
  status: OrderStatus;
  deliveryOutcome?: DeliveryOutcome | string;
  resolutionStatus?: ExceptionResolutionStatus;
  openExceptionCount?: number;
  vendorResponseRequired?: boolean;
  vendorActionRequired?: boolean;
  companyActionRequired?: boolean;
  deliveryState?: FulfillmentDeliveryState;
  fulfillmentState?: FulfillmentState;
  fulfillmentActionRequired?: boolean;
  canClose?: boolean;
  closeBlockers?: string[];
  finalBillingConfirmedAt?: string | null;
  finalBillingConfirmationReason?: string | null;
  quantityOrdered?: number;
  quantityReady?: number;
  quantityDispatched?: number;
  quantityReceived?: number;
  quantityPhysicallyReceived?: number;
  quantityAccepted?: number;
  quantityForfeited?: number;
  quantityOutstanding?: number;
  invoiceableSubtotal?: number;
  quantityAwaitingDispatch?: number;
  quantityAwaitingReceipt?: number;
  quantityRemainingToReady?: number;
  vendorReadinessStatus?: string;
  issueBlockers?: string[];
  vendorEntityRelationshipId?: string;
  vendorSiteId?: string;
  vendorRelationshipConfigurationVersion?: number;
  paymentTerms?: OrderPaymentTermRef | null;
  priority: OrderPriority;
  issueDate: string;
  issuedAt?: string;
  submittedForApprovalAt?: string;
  approvedAt?: string;
  approvalDate?: string;
  shipmentDate?: string;
  digitalDeliveryDate?: string;
  confirmationDate?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  acknowledgedAt?: string;
  readyForDeliveryAt?: string;
  deliveredAt?: string;
  closedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  deliveryDate?: string;
  currency: string;
  legalEntity?: OrderLegalEntityRef | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  policyJustification?: string;
  policyEvaluationResult?: Record<string, unknown> | null;
  requesterName?: string;
  departmentName?: string;
  vendor: OrderVendorRef;
  purchaseRequestId?: string;
  lineItems: OrderLineItem[];
  timeline?: TimelineEvent[];
  /** Historical fulfillment shipment records */
  deliveryNotices?: Fulfillment[];
  fulfillments?: Fulfillment[];
  /** Delivery receipt confirmations & exception records returned on GET /vendor-portal/orders/{id} */
  receiptConfirmations?: FulfillmentExceptionDetail[];
  receipts?: FulfillmentExceptionDetail[];
  deliveryReceipts?: FulfillmentExceptionDetail[];
}

export interface OrderFilters {
  status?: OrderStatus | "all";
  deliveryOutcome?: DeliveryOutcome | string;
  resolutionStatus?: ExceptionResolutionStatus | "all";
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Payload shape for acknowledging an order.
 * Vendor enters per-item delivery dates before acknowledging.
 */
export interface AcknowledgeOrderPayload {
  lineItems: { purchaseOrderLineItemId: string; deliveryDate: string }[];
}

export type DeliveryType = "full" | "partial";

export interface CreateFulfillmentLineItemPayload {
  purchaseOrderLineItemId: string;
  quantityReady: number;
  remainingDisposition?: RemainingDisposition;
  expectedReadyDate?: string;
  reason?: string;
  dispositionReason?: string;
}

export interface CreateFulfillmentPayload {
  fulfillmentReference?: string;
  declaration: FulfillmentDeclaration;
  fulfillmentMethod: FulfillmentMethod;
  readyAt?: string;
  expectedDeliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  notes?: string;
  lineItems: CreateFulfillmentLineItemPayload[];
}

export interface CreateFulfillmentResponse {
  purchaseOrderId: string;
  poNumber: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
}

export interface DispatchFulfillmentPayload {
  dispatchReference?: string;
  dispatchedAt?: string;
}

/**
 * Payload shape for declaring a fulfillment (readiness/shipment).
 * Matches the backend POST /vendor-portal/orders/:id/fulfillments contract.
 */
export interface FulfillmentPayload {
  declaration: DeliveryType;
  fulfillmentMethod: "carrier" | "vendor_truck" | "digital" | "service";
  expectedDeliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  notes?: string;
  lineItems: {
    purchaseOrderLineItemId: string;
    quantityReady: number;
    remainingDisposition?: "backordered" | "cannot_fulfill";
    expectedReadyDate?: string;
    reason?: string;
    dispositionReason?: string;
  }[];
}

/**
 * Payload shape for dispatching a fulfillment.
 */
export interface DispatchPayload {
  dispatchReference?: string;
  dispatchedAt?: string;
}

/**
 * @deprecated Use FulfillmentPayload instead. Kept for backwards compatibility
 * with existing hooks until migration is complete.
 */
export interface ConfirmDeliveryPayload {
  deliveryType: DeliveryType;
  fulfillmentMethod?: string;
  expectedDeliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  notes?: string;
  lineItems: {
    purchaseOrderLineItemId: string;
    quantityReady: number;
    remainingDisposition?: "backordered" | "cannot_fulfill";
    expectedReadyDate?: string;
    reason?: string;
    dispositionReason?: string;
    // Legacy compat
    deliveredQuantity?: number;
  }[];
}

/**
 * Display-only label override. Backend status stays "cancelled" in every
 * request/response — this only changes what the badge renders.
 */
export const ORDER_STATUS_DISPLAY_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  acknowledged: "Acknowledged",
  ready_for_delivery: "Ready for delivery",
  partially_delivered: "Partially delivered",
  partially_delivered_with_exceptions: "Partially delivered (Exceptions)",
  delivered: "Delivered",
  delivered_with_exceptions: "Delivered (Exceptions)",
  closed: "Closed",
  cancelled: "Withdrawn",
};

// ─────────────────────────────────────────────
// INVOICES (real vendor-portal contract)
// ─────────────────────────────────────────────

export type InvoiceStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "paid";

export type InvoicePaymentStatus = "pending" | "in_progress" | "paid" | "failed";

export interface InvoiceVendorRef {
  vendorId: string;
  displayName: string;
  legalName: string;
  email: string;
}

/**
 * Fields a vendor is allowed to submit. Deliberately excludes backend/buyer
 * internal fields present in the raw API schema (accountingAccountRef,
 * accountingItemRef, accountingClassRef, accountingLocationRef,
 * accountingProjectRef, accountingTaxCodeRef, accountingResolutionStatus,
 * vendorSelectionMode, catalogVendorId, lockedVendorId, preferredVendorId,
 * categoryId, departmentId) — those are buyer-side procurement/accounting
 * concerns the vendor never sees or fills in. Confirm with backend before
 * removing this restriction.
 */
export interface InvoiceLineItemInput {
  purchaseOrderLineItemId: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  taxAmount?: number;
  sku?: string;
  unitOfMeasure?: string;
}

export interface InvoiceLineItem {
  vendorInvoiceLineItemId: string;
  purchaseOrderLineItemId?: string | null;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxAmount: number;
  lineTotal: number;
  sku?: string;
  unitOfMeasure?: string;
}

export interface Invoice {
  vendorInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  deliveryDate?: string;
  status: InvoiceStatus;
  paymentStatus: InvoicePaymentStatus;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  accountingSyncStatus?: string;
  externalAccountingRef?: string;
  accountingSyncedAt?: string;
  accountingSyncError?: string;
  submittedAt?: string;
  underReviewAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  paidAt?: string;
  vendor: InvoiceVendorRef;
  purchaseOrderId: string;
  poNumber?: string;
  lineItems: InvoiceLineItem[];
}

export interface CreateInvoicePayload {
  purchaseOrderId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  deliveryDate?: string;
  currency: string;
  notes?: string;
  lineItems: InvoiceLineItemInput[];
}

export type UpdateInvoicePayload = Partial<CreateInvoicePayload>;

export interface InvoiceFilters {
  status?: InvoiceStatus | "all";
  paymentStatus?: InvoicePaymentStatus | "all";
  vendorId?: string;
  purchaseOrderId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────
// DASHBOARD SUMMARY (GET /vendor-portal/summary)
// ─────────────────────────────────────────────

export interface DashboardSummary {
  activePurchaseOrders: number;
  invoicesUnderReview: number;
  paymentsInProgress: number;
  totalPaid: number;
  recentOrders: OrderListItem[];
}

export interface SummaryFilters {
  startDate?: string;
  endDate?: string;
  currency?: string;
}

// ─────────────────────────────────────────────
// NOTIFICATIONS (GET /vendor-portal/notifications)
// ─────────────────────────────────────────────

export type NotificationType =
  | "purchase_order_issued"
  | "invoice_under_review"
  | "invoice_approved"
  | "invoice_rejected"
  | "invoice_paid"
  | "vendor_onboarding_approved"
  | "vendor_onboarding_rejected"
  | "vendor_account_activated"
  | "vendor_account_deactivated";

export interface VendorNotification {
  vendorNotificationId: string;
  vendorAccountId: string;
  vendorId: string;
  companyId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, string>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationFilters {
  isRead?: boolean;
  type?: NotificationType;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────

export type DocumentType =
  | "certificate_of_incorporation"
  | "tax_certificate"
  | "government_id"
  | "bank_document";

/**
 * Document types that carry an expiration date (ISO-8601).
 * When a document is one of these types, `expiresAt` should be included in the upload payload.
 */
export const DOCS_WITH_EXPIRY: ReadonlySet<DocumentType> = new Set([
  "government_id",
  "tax_certificate",
]);

/**
 * Document types that support an accompanying screenshot / secondary image
 * (e.g. back side of a government ID).
 */
export const DOCS_WITH_SCREENSHOT: ReadonlySet<DocumentType> = new Set([
  "government_id",
]);

export interface DocumentUpload {
  type: DocumentType;
  label: string;
  required: boolean;
  file?: File;
  file_name?: string;
  url?: string;
  uploaded?: boolean;
  /** ISO-8601 expiration date — only for applicable document types (see DOCS_WITH_EXPIRY). */
  expiresAt?: string;
  /** Secondary screenshot/image (e.g. back of ID) — only for applicable document types. */
  screenshot?: {
    file_name?: string;
    document_id?: string;
    url?: string;
  };
}

export interface VerificationStatus {
  identity_match: "pass" | "fail" | "pending";
  bank_match: "pass" | "flagged" | "pending";
  bank_match_score?: number;
  bank_resolved_name?: string;
  sanctions_clear?: boolean;
}

// ─────────────────────────────────────────────
// ONBOARDING WIZARD FORMS (unchanged — full_onboarding path only)
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
  routing_number?: string;
  account_name: string;
  flag_note?: string;
}

// ─────────────────────────────────────────────
// IN-APP MESSAGING (per-company, thread-tagged)
//
// No backend contract exists for this yet — see lib/api/messaging.ts and
// lib/stores/messagingStore.ts. Types here describe the intended shape so
// the frontend and a future backend endpoint can agree on it; until then
// the widget runs on local, in-memory state seeded from real order/invoice
// data where possible.
// ─────────────────────────────────────────────

export type ChatThreadTagType = "purchase_order" | "invoice" | "general";

export interface ChatThreadTag {
  id: string; // e.g. purchaseOrderId, vendorInvoiceId, or "general"
  type: ChatThreadTagType;
  label: string; // e.g. "PO-2024-001", "INV-001", "General"
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderType: "vendor" | "company";
  senderName: string;
  body: string;
  sentAt: string;
}

export interface ChatThread {
  id: string;
  companyId: string;
  companyName: string;
  tag: ChatThreadTag;
  messages: ChatMessage[];
  unreadCount: number;
  createdAt: string;
}

// ─────────────────────────────────────────────
// API RESPONSE WRAPPERS
// ─────────────────────────────────────────────

/** Generic { message, status, data } envelope used by every endpoint. */
export interface ApiEnvelope<T> {
  message: string;
  status: number;
  data: T;
}

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
}

export * from "./vendor-network";
