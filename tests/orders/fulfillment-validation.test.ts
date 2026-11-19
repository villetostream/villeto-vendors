import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateFulfillmentPayload,
  inferDefaultItemDeliveryMethod,
  validateFulfillmentDeliveryDetails,
} from "../../lib/utils/fulfillment";

describe("validateFulfillmentDeliveryDetails", () => {
  it("requires carrier, trackingNumber, and expectedDeliveryDate for carrier fulfillments", () => {
    assert.match(
      validateFulfillmentDeliveryDetails({
        fulfillmentMethod: "carrier",
        carrier: "",
        trackingNumber: "TRK-1",
        expectedDeliveryDate: "2026-11-20",
      }) ?? "",
      /carrier/i
    );

    assert.match(
      validateFulfillmentDeliveryDetails({
        fulfillmentMethod: "carrier",
        carrier: "DHL",
        trackingNumber: "   ",
        expectedDeliveryDate: "2026-11-20",
      }) ?? "",
      /tracking number/i
    );

    assert.match(
      validateFulfillmentDeliveryDetails({
        fulfillmentMethod: "carrier",
        carrier: "DHL",
        trackingNumber: "1Z999AA101",
        expectedDeliveryDate: "",
      }) ?? "",
      /arrival date/i
    );

    assert.equal(
      validateFulfillmentDeliveryDetails({
        fulfillmentMethod: "carrier",
        carrier: "DHL",
        trackingNumber: "1Z999AA101",
        expectedDeliveryDate: "2026-11-20",
      }),
      null
    );
  });

  it("requires expectedDeliveryDate for vendor_truck without requiring carrier or trackingNumber", () => {
    assert.match(
      validateFulfillmentDeliveryDetails({
        fulfillmentMethod: "vendor_truck",
        expectedDeliveryDate: "",
      }) ?? "",
      /arrival date/i
    );

    assert.equal(
      validateFulfillmentDeliveryDetails({
        fulfillmentMethod: "vendor_truck",
        expectedDeliveryDate: "2026-11-20",
      }),
      null
    );
  });

  it("allows digital and service fulfillments without physical shipping details", () => {
    assert.equal(
      validateFulfillmentDeliveryDetails({ fulfillmentMethod: "digital" }),
      null
    );
    assert.equal(
      validateFulfillmentDeliveryDetails({ fulfillmentMethod: "service" }),
      null
    );
  });

  it("validates per-line-item delivery methods independently when usePerItemMethod is true", () => {
    assert.match(
      validateFulfillmentDeliveryDetails({
        usePerItemMethod: true,
        lineItems: [
          {
            purchaseOrderLineItemId: "line-1",
            name: "Business Laptop",
            fulfillmentMethod: "carrier",
            carrier: "DHL",
            trackingNumber: "",
            expectedDeliveryDate: "2026-11-25",
          },
          {
            purchaseOrderLineItemId: "line-2",
            name: "Annual Antivirus License",
            fulfillmentMethod: "digital",
          },
        ],
      }) ?? "",
      /Business Laptop.*tracking number/i
    );

    assert.equal(
      validateFulfillmentDeliveryDetails({
        usePerItemMethod: true,
        lineItems: [
          {
            purchaseOrderLineItemId: "line-1",
            name: "Business Laptop",
            fulfillmentMethod: "carrier",
            carrier: "DHL",
            trackingNumber: "1Z999AA101",
            expectedDeliveryDate: "2026-11-25",
          },
          {
            purchaseOrderLineItemId: "line-2",
            name: "Annual Antivirus License",
            fulfillmentMethod: "digital",
          },
        ],
      }),
      null
    );
  });
});

describe("buildCreateFulfillmentPayload", () => {
  it("builds top-level fulfillmentMethod payload when using same delivery method for all items", () => {
    const payload = buildCreateFulfillmentPayload({
      fulfillmentReference: "FUL-2026-001",
      declaration: "full",
      readyAt: "2026-09-01T10:00:00.000Z",
      usePerItemMethod: false,
      fulfillmentMethod: "carrier",
      expectedDeliveryDate: "2026-09-05",
      carrier: "DHL",
      trackingNumber: "TRK-12345",
      packingSlipNumber: "PS-001",
      notes: "Deliver to receiving dock",
      lineItems: [
        {
          purchaseOrderLineItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          quantityReady: 2,
        },
      ],
    });

    assert.deepEqual(payload, {
      fulfillmentReference: "FUL-2026-001",
      declaration: "full",
      fulfillmentMethod: "carrier",
      readyAt: "2026-09-01T10:00:00.000Z",
      expectedDeliveryDate: "2026-09-05",
      carrier: "DHL",
      trackingNumber: "TRK-12345",
      packingSlipNumber: "PS-001",
      notes: "Deliver to receiving dock",
      lineItems: [
        {
          purchaseOrderLineItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          quantityReady: 2,
        },
      ],
    });
  });

  it("builds line-item level fulfillmentMethod payload when items use different delivery methods", () => {
    const payload = buildCreateFulfillmentPayload({
      fulfillmentReference: "FUL-2026-001",
      declaration: "partial",
      readyAt: "2026-09-01T10:00:00.000Z",
      usePerItemMethod: true,
      notes: "Mixed shipment",
      lineItems: [
        {
          purchaseOrderLineItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          quantityReady: 2,
          fulfillmentMethod: "carrier",
          expectedDeliveryDate: "2026-09-05",
          carrier: "DHL",
          trackingNumber: "1Z999AA101",
          packingSlipNumber: "PS-100",
          remainingDisposition: "backordered",
          expectedReadyDate: "2026-09-15",
          reason: "Delivering in batches",
        },
        {
          purchaseOrderLineItemId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          quantityReady: 5,
          fulfillmentMethod: "digital",
          carrier: "Ignored for digital",
          trackingNumber: "Ignored",
        },
      ],
    });

    assert.deepEqual(payload, {
      fulfillmentReference: "FUL-2026-001",
      declaration: "partial",
      readyAt: "2026-09-01T10:00:00.000Z",
      notes: "Mixed shipment",
      lineItems: [
        {
          purchaseOrderLineItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          quantityReady: 2,
          fulfillmentMethod: "carrier",
          expectedDeliveryDate: "2026-09-05",
          carrier: "DHL",
          trackingNumber: "1Z999AA101",
          packingSlipNumber: "PS-100",
          remainingDisposition: "backordered",
          expectedReadyDate: "2026-09-15",
          reason: "Delivering in batches",
        },
        {
          purchaseOrderLineItemId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          quantityReady: 5,
          fulfillmentMethod: "digital",
        },
      ],
    });
  });
});

describe("inferDefaultItemDeliveryMethod", () => {
  it("infers digital and service methods from unitOfMeasure, transportScope, or item name and falls back to carrier", () => {
    assert.equal(
      inferDefaultItemDeliveryMethod({
        name: "Business Laptop",
        unitOfMeasure: "unit",
      }),
      "carrier"
    );

    assert.equal(
      inferDefaultItemDeliveryMethod({
        name: "Software licenses",
        unitOfMeasure: "license",
      }),
      "digital"
    );

    assert.equal(
      inferDefaultItemDeliveryMethod({
        name: "Installation service",
        unitOfMeasure: "service",
      }),
      "service"
    );

    assert.equal(
      inferDefaultItemDeliveryMethod({
        name: "Custom Enterprise Module",
        fulfillmentTransportScope: "non_physical",
      }),
      "digital"
    );
  });
});
