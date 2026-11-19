import type {
  CreateFulfillmentLineItemPayload,
  CreateFulfillmentPayload,
  FulfillmentDeclaration,
  FulfillmentMethod,
  OrderLineItem,
  RemainingDisposition,
} from "@/lib/types";

const SERVICE_UOMS = new Set([
  "service",
  "services",
  "hour",
  "hours",
  "hr",
  "hrs",
  "day",
  "days",
  "milestone",
  "milestones",
  "session",
  "sessions",
  "visit",
  "visits",
  "job",
  "jobs",
]);

const DIGITAL_UOMS = new Set([
  "license",
  "licenses",
  "licence",
  "licences",
  "seat",
  "seats",
  "subscription",
  "subscriptions",
  "user",
  "users",
  "download",
  "downloads",
  "key",
  "keys",
  "token",
  "tokens",
]);

const SERVICE_KEYWORDS =
  /\b(service|services|installation|maintenance|consulting|consultation|training|repair|setup|support|implementation|deployment|onboarding|labor|labour|audit|retainer)\b/i;

const DIGITAL_KEYWORDS =
  /\b(license|licenses|licence|licences|software|subscription|saas|digital|cloud|ebook|voucher|activation\s+key|api\s+key|antivirus)\b/i;

/**
 * Provides a smart initial delivery method suggestion for a line item based on
 * backend transport scope, unit of measure, category, or item name.
 * The vendor can always override any item with 1 click in the UI.
 */
export function inferDefaultItemDeliveryMethod(
  item: Pick<
    OrderLineItem,
    "name" | "description" | "unitOfMeasure" | "categoryName" | "fulfillmentTransportScope"
  >
): FulfillmentMethod {
  const uom = (item.unitOfMeasure || "").trim().toLowerCase();
  const text = `${item.name || ""} ${item.categoryName || ""} ${item.description || ""}`.trim();

  if (SERVICE_UOMS.has(uom)) return "service";
  if (DIGITAL_UOMS.has(uom)) return "digital";

  if (item.fulfillmentTransportScope === "non_physical") {
    return SERVICE_KEYWORDS.test(text) ? "service" : "digital";
  }

  if (item.fulfillmentTransportScope === "physical") {
    return "carrier";
  }

  if (SERVICE_KEYWORDS.test(text)) return "service";
  if (DIGITAL_KEYWORDS.test(text)) return "digital";

  return "carrier";
}

export interface FulfillmentLineItemDeliveryInput {
  purchaseOrderLineItemId: string;
  name?: string;
  quantityReady: number;
  fulfillmentMethod?: string;
  carrier?: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
  packingSlipNumber?: string;
  remainingDisposition?: string;
  expectedReadyDate?: string;
  reason?: string;
  dispositionReason?: string;
}

export interface FulfillmentDeliveryValidationInput {
  fulfillmentMethod?: string;
  carrier?: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
  isDuplicateReference?: boolean;
  trimmedRef?: string;
  /** When true, each line item in `lineItems` provides its own `fulfillmentMethod` and delivery details */
  usePerItemMethod?: boolean;
  lineItems?: Array<
    Pick<
      FulfillmentLineItemDeliveryInput,
      | "purchaseOrderLineItemId"
      | "name"
      | "fulfillmentMethod"
      | "carrier"
      | "trackingNumber"
      | "expectedDeliveryDate"
    >
  >;
}

function validateMethodFields(
  method: string | undefined,
  fields: {
    carrier?: string;
    trackingNumber?: string;
    expectedDeliveryDate?: string;
  },
  itemName?: string
): string | null {
  const prefix = itemName ? `For "${itemName}": ` : "";

  if (!method) {
    return itemName
      ? `${prefix}Please choose how this item is being delivered.`
      : "Please choose how this delivery is being sent.";
  }

  if (method === "carrier") {
    if (!fields.carrier?.trim()) {
      return `${prefix}Please enter the courier or carrier name (e.g., DHL, FedEx, GIG).`;
    }
    if (!fields.trackingNumber?.trim()) {
      return `${prefix}Please enter the carrier tracking number.`;
    }
    if (!fields.expectedDeliveryDate?.trim()) {
      return `${prefix}Please select the expected arrival date.`;
    }
  }

  if (method === "vendor_truck") {
    if (!fields.expectedDeliveryDate?.trim()) {
      return `${prefix}Please select the expected arrival date.`;
    }
  }

  return null;
}

/**
 * Validates Step 2 delivery details before submitting a fulfillment.
 * Supports both a shared top-level `fulfillmentMethod` for all items and
 * per-line-item `fulfillmentMethod` when items use different delivery methods.
 */
export function validateFulfillmentDeliveryDetails(
  input: FulfillmentDeliveryValidationInput
): string | null {
  const isPerItem =
    input.usePerItemMethod ||
    (!input.fulfillmentMethod && !!input.lineItems && input.lineItems.length > 0);

  if (isPerItem) {
    if (!input.lineItems || input.lineItems.length === 0) {
      return "Please select at least one item to fulfill.";
    }
    for (const item of input.lineItems) {
      const err = validateMethodFields(
        item.fulfillmentMethod,
        {
          carrier: item.carrier,
          trackingNumber: item.trackingNumber,
          expectedDeliveryDate: item.expectedDeliveryDate,
        },
        item.name
      );
      if (err) return err;
    }
  } else {
    const err = validateMethodFields(input.fulfillmentMethod, {
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      expectedDeliveryDate: input.expectedDeliveryDate,
    });
    if (err) return err;
  }

  if (input.isDuplicateReference && input.trimmedRef) {
    return `The reference number "${input.trimmedRef}" was already used on an earlier shipment for this order. Each delivery needs its own unique Waybill / Reference # (or leave it blank to auto-generate).`;
  }

  return null;
}

export function sanitizeDeliveryFieldsForMethod(
  method?: string,
  fields?: {
    expectedDeliveryDate?: string;
    carrier?: string;
    trackingNumber?: string;
    packingSlipNumber?: string;
  }
): {
  fulfillmentMethod?: FulfillmentMethod;
  expectedDeliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
} {
  if (!method) return {};
  const normalizedMethod = method as FulfillmentMethod;

  if (normalizedMethod === "carrier") {
    return {
      fulfillmentMethod: normalizedMethod,
      ...(fields?.expectedDeliveryDate?.trim()
        ? { expectedDeliveryDate: fields.expectedDeliveryDate.trim() }
        : {}),
      ...(fields?.carrier?.trim() ? { carrier: fields.carrier.trim() } : {}),
      ...(fields?.trackingNumber?.trim()
        ? { trackingNumber: fields.trackingNumber.trim() }
        : {}),
      ...(fields?.packingSlipNumber?.trim()
        ? { packingSlipNumber: fields.packingSlipNumber.trim() }
        : {}),
    };
  }

  if (normalizedMethod === "vendor_truck") {
    return {
      fulfillmentMethod: normalizedMethod,
      ...(fields?.expectedDeliveryDate?.trim()
        ? { expectedDeliveryDate: fields.expectedDeliveryDate.trim() }
        : {}),
      ...(fields?.packingSlipNumber?.trim()
        ? { packingSlipNumber: fields.packingSlipNumber.trim() }
        : {}),
    };
  }

  // digital or service
  return {
    fulfillmentMethod: normalizedMethod,
  };
}

export interface BuildCreateFulfillmentPayloadInput {
  fulfillmentReference?: string;
  declaration: FulfillmentDeclaration;
  readyAt?: string;
  notes?: string;
  usePerItemMethod?: boolean;
  fulfillmentMethod?: string;
  expectedDeliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  lineItems: FulfillmentLineItemDeliveryInput[];
}

/**
 * Builds the `POST /vendor-portal/orders/:id/fulfillments` payload.
 * - When `usePerItemMethod` is false (same delivery method for all items), places `fulfillmentMethod`
 *   and delivery details at the top level.
 * - When `usePerItemMethod` is true (different delivery method per line item), places `fulfillmentMethod`
 *   and delivery details on each entry in `lineItems`.
 */
export function buildCreateFulfillmentPayload(
  input: BuildCreateFulfillmentPayloadInput
): CreateFulfillmentPayload {
  const isPerItem =
    input.usePerItemMethod ||
    (!input.fulfillmentMethod &&
      input.lineItems.some((li) => !!li.fulfillmentMethod));

  const topLevelDelivery = !isPerItem
    ? sanitizeDeliveryFieldsForMethod(input.fulfillmentMethod, {
        expectedDeliveryDate: input.expectedDeliveryDate,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        packingSlipNumber: input.packingSlipNumber,
      })
    : {};

  const lineItems: CreateFulfillmentLineItemPayload[] = input.lineItems.map(
    (li) => {
      const reason = (li.reason || li.dispositionReason)?.trim();
      const lineDelivery = isPerItem
        ? sanitizeDeliveryFieldsForMethod(li.fulfillmentMethod, {
            expectedDeliveryDate: li.expectedDeliveryDate,
            carrier: li.carrier,
            trackingNumber: li.trackingNumber,
            packingSlipNumber: li.packingSlipNumber,
          })
        : {};

      return {
        purchaseOrderLineItemId: li.purchaseOrderLineItemId,
        quantityReady: li.quantityReady,
        ...lineDelivery,
        ...(li.remainingDisposition
          ? {
              remainingDisposition:
                li.remainingDisposition as RemainingDisposition,
            }
          : {}),
        ...(li.expectedReadyDate
          ? { expectedReadyDate: li.expectedReadyDate }
          : {}),
        ...(reason ? { reason } : {}),
      };
    }
  );

  return {
    ...(input.fulfillmentReference?.trim()
      ? { fulfillmentReference: input.fulfillmentReference.trim() }
      : {}),
    declaration: input.declaration,
    ...topLevelDelivery,
    ...(input.readyAt ? { readyAt: input.readyAt } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    lineItems,
  };
}
