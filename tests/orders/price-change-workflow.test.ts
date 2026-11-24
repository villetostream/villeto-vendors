import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OrderStatus, PriceChangeRequestStatus } from "../../lib/types";

// Business logic invariants modeling both workflows:
// 1. Initial price negotiation before acknowledgement
// 2. Formal PO price amendment for outstanding quantities after acknowledgement

export function canAcknowledgeOrder(
  status: OrderStatus | string,
  activeProposalStatus?: PriceChangeRequestStatus | null
): boolean {
  if (status !== "issued") return false;
  if (!activeProposalStatus) return true;
  // Acknowledgement locked while a pre-ack proposal is under buyer review
  const pendingStatuses = ["pending_review", "returned_for_correction", "approved_pending_issue"];
  return !pendingStatuses.includes(activeProposalStatus);
}

export function canProposeInitialPrice(
  status: OrderStatus | string,
  isEligible: boolean,
  activeProposalStatus?: PriceChangeRequestStatus | null
): boolean {
  if (status !== "issued") return false;
  if (!isEligible) return false;
  const pendingStatuses = ["pending_review", "returned_for_correction", "approved_pending_issue"];
  if (activeProposalStatus && pendingStatuses.includes(activeProposalStatus)) return false;
  return true;
}

export function canRequestPriceAmendment(
  status: OrderStatus | string,
  isEligible: boolean,
  hasOutstandingQuantity: boolean,
  activeProposalStatus?: PriceChangeRequestStatus | null
): boolean {
  // Pre-acknowledgement POs use canProposeInitialPrice instead
  if (status === "issued") return false;
  // Terminal orders cannot be amended
  if (["closed", "cancelled"].includes(status)) return false;
  // Must be eligible and have outstanding/backordered quantity to reprice
  if (!isEligible || !hasOutstandingQuantity) return false;
  // Mutual exclusion: cannot initiate concurrent amendment while another is pending
  const pendingStatuses = ["pending_review", "returned_for_correction", "approved_pending_issue"];
  if (activeProposalStatus && pendingStatuses.includes(activeProposalStatus)) return false;
  return true;
}

export function shouldShowPriceChangeHistory(
  requestCount: number,
  revisionNumber?: number
): boolean {
  return requestCount > 0 || (revisionNumber ?? 1) > 1;
}

export function calculateProposalDifference(
  previousTotal: number,
  proposedTotal: number
): { difference: number; isIncrease: boolean } {
  const difference = proposedTotal - previousTotal;
  return {
    difference,
    isIncrease: difference > 0,
  };
}

describe("Vendor Price Change & PO Amendment Lifecycle Invariants", () => {
  describe("Workflow 1: Initial Price Negotiation (Pre-acknowledgement)", () => {
    it("blocks order acknowledgement when a price proposal is pending buyer review", () => {
      assert.equal(canAcknowledgeOrder("issued", "pending_review"), false);
      assert.equal(canAcknowledgeOrder("issued", "returned_for_correction"), false);
      assert.equal(canAcknowledgeOrder("issued", "approved_pending_issue"), false);
    });

    it("permits order acknowledgement on issued POs when no proposal is pending review", () => {
      assert.equal(canAcknowledgeOrder("issued", null), true);
      assert.equal(canAcknowledgeOrder("issued", undefined), true);
      assert.equal(canAcknowledgeOrder("issued", "withdrawn"), true);
      assert.equal(canAcknowledgeOrder("issued", "rejected"), true);
    });

    it("never permits order acknowledgement once an order is beyond issued state", () => {
      assert.equal(canAcknowledgeOrder("acknowledged", null), false);
      assert.equal(canAcknowledgeOrder("partially_delivered", null), false);
      assert.equal(canAcknowledgeOrder("delivered", null), false);
      assert.equal(canAcknowledgeOrder("cancelled", null), false);
    });

    it("permits initial price negotiation only on issued POs with backend eligibility", () => {
      assert.equal(canProposeInitialPrice("issued", true, null), true);
      assert.equal(canProposeInitialPrice("issued", false, null), false);
      assert.equal(canProposeInitialPrice("acknowledged", true, null), false);
    });
  });

  describe("Workflow 2: Formal PO Amendment (Post-acknowledgement)", () => {
    it("allows requesting a formal price amendment on acknowledged PO with outstanding quantity", () => {
      assert.equal(canRequestPriceAmendment("acknowledged", true, true, null), true);
    });

    it("allows requesting a price amendment on partially delivered PO with backordered quantity", () => {
      // e.g. 70 delivered (protected), 30 backordered (eligible)
      assert.equal(canRequestPriceAmendment("partially_delivered", true, true, null), true);
      assert.equal(canRequestPriceAmendment("partially_delivered_with_exceptions", true, true, null), true);
    });

    it("prohibits requesting a price amendment when outstanding quantity is zero", () => {
      // 100% fulfilled - no outstanding units to reprice
      assert.equal(canRequestPriceAmendment("acknowledged", true, false, null), false);
      assert.equal(canRequestPriceAmendment("delivered", true, false, null), false);
    });

    it("prohibits requesting a price amendment on closed or cancelled POs", () => {
      assert.equal(canRequestPriceAmendment("closed", true, true, null), false);
      assert.equal(canRequestPriceAmendment("cancelled", true, true, null), false);
    });

    it("prohibits initiating a new amendment while another amendment is already pending review", () => {
      assert.equal(canRequestPriceAmendment("partially_delivered", true, true, "pending_review"), false);
      assert.equal(canRequestPriceAmendment("partially_delivered", true, true, "returned_for_correction"), false);
      assert.equal(canRequestPriceAmendment("partially_delivered", true, true, "withdrawn"), true);
    });
  });

  describe("History & Financial Calculations", () => {
    it("hides price change history on standard POs with no proposals and revision 1", () => {
      assert.equal(shouldShowPriceChangeHistory(0, 1), false);
      assert.equal(shouldShowPriceChangeHistory(0, undefined), false);
    });

    it("surfaces price change history if past proposals exist or PO revision is greater than 1", () => {
      assert.equal(shouldShowPriceChangeHistory(1, 1), true);
      assert.equal(shouldShowPriceChangeHistory(0, 2), true);
      assert.equal(shouldShowPriceChangeHistory(3, 2), true);
    });

    it("correctly calculates commitment difference and financial direction", () => {
      const increase = calculateProposalDifference(5000000, 5300000);
      assert.equal(increase.difference, 300000);
      assert.equal(increase.isIncrease, true);

      const decrease = calculateProposalDifference(150000, 140000);
      assert.equal(decrease.difference, -10000);
      assert.equal(decrease.isIncrease, false);
    });
  });
});
