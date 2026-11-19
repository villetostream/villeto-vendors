import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPastCalendarDate,
  resolveAcknowledgePromiseDate,
  toIsoDateString,
} from "../../lib/utils/dates";

describe("Order acknowledge promise date pre-fill logic", () => {
  const refToday = new Date(2026, 10, 16, 12, 30, 0); // 2026-11-16 local noon

  it("does not pre-fill when item expected delivery date is in the past", () => {
    assert.equal(
      resolveAcknowledgePromiseDate("2026-11-15", "2026-11-25", refToday),
      ""
    );
    assert.equal(
      resolveAcknowledgePromiseDate("2026-11-10T00:00:00.000Z", null, refToday),
      ""
    );
  });

  it("does not pre-fill when PO-level expected due date is in the past", () => {
    assert.equal(
      resolveAcknowledgePromiseDate(null, "2026-11-15", refToday),
      ""
    );
    assert.equal(
      resolveAcknowledgePromiseDate(undefined, "2026-10-30T10:00:00Z", refToday),
      ""
    );
  });

  it("pre-fills when expected due date is today or in the future", () => {
    assert.equal(
      resolveAcknowledgePromiseDate(null, "2026-11-16", refToday),
      "2026-11-16"
    );
    assert.equal(
      resolveAcknowledgePromiseDate(null, "2026-11-25", refToday),
      "2026-11-25"
    );
    assert.equal(
      resolveAcknowledgePromiseDate("2026-11-20T09:00:00.000Z", "2026-11-25", refToday),
      "2026-11-20"
    );
  });

  it("falls back to today when neither item nor order has an expected due date", () => {
    assert.equal(resolveAcknowledgePromiseDate(null, null, refToday), "2026-11-16");
  });

  it("correctly evaluates isPastCalendarDate and toIsoDateString", () => {
    assert.equal(isPastCalendarDate("2026-11-15", refToday), true);
    assert.equal(isPastCalendarDate("2026-11-16", refToday), false);
    assert.equal(isPastCalendarDate("2026-11-17", refToday), false);
    assert.equal(isPastCalendarDate("", refToday), false);
    assert.equal(toIsoDateString("2026-11-25T14:00:00Z"), "2026-11-25");
  });

  it("builds the expected acknowledge payload structure with purchaseOrderLineItemId and promisedDeliveryDate", () => {
    const lineItems = [
      {
        purchaseOrderLineItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        deliveryDate: "2026-11-20",
      },
      {
        purchaseOrderLineItemId: "e4d9b234-5555-4abc-9123-112233445566",
        promisedDeliveryDate: "2026-11-22",
      },
    ];

    const draftDates: Record<string, string> = {
      "3fa85f64-5717-4562-b3fc-2c963f66afa6": "2026-11-20",
      "e4d9b234-5555-4abc-9123-112233445566": "2026-11-22",
    };

    const payload = {
      lineItems: lineItems.map((item) => ({
        purchaseOrderLineItemId: item.purchaseOrderLineItemId,
        promisedDeliveryDate: draftDates[item.purchaseOrderLineItemId],
      })),
    };

    assert.deepEqual(payload, {
      lineItems: [
        {
          purchaseOrderLineItemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          promisedDeliveryDate: "2026-11-20",
        },
        {
          purchaseOrderLineItemId: "e4d9b234-5555-4abc-9123-112233445566",
          promisedDeliveryDate: "2026-11-22",
        },
      ],
    });
  });
});
