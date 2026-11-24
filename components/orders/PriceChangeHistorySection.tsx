"use client";

import React, { useState } from "react";
import {
  Scale,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  History,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Order, PriceChangeRequestSummary } from "@/lib/types";
import { usePriceChangeRequests } from "@/lib/hooks/usePriceChanges";

interface PriceChangeHistorySectionProps {
  order: Order;
  onOpenProposal: (requestId: string) => void;
}

function formatStatusBadge(status: string) {
  switch (status) {
    case "pending_review":
      return {
        label: "Pending Buyer Review",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
        icon: Clock,
      };
    case "returned_for_correction":
      return {
        label: "Returned for Correction",
        classes: "bg-blue-50 text-blue-800 border-blue-200",
        icon: RotateCcw,
      };
    case "approved_pending_issue":
      return {
        label: "Approved · Pending Reissue",
        classes: "bg-purple-50 text-purple-800 border-purple-200",
        icon: CheckCircle2,
      };
    case "approved":
    case "applied":
      return {
        label: "Approved & Applied",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
        icon: CheckCircle2,
      };
    case "rejected":
      return {
        label: "Rejected",
        classes: "bg-red-50 text-red-800 border-red-200",
        icon: AlertCircle,
      };
    case "withdrawn":
      return {
        label: "Withdrawn",
        classes: "bg-slate-50 text-slate-700 border-slate-200",
        icon: History,
      };
    default:
      return {
        label: status.replace(/_/g, " "),
        classes: "bg-muted text-muted-foreground border-border",
        icon: History,
      };
  }
}

export function PriceChangeHistorySection({
  order,
  onOpenProposal,
}: PriceChangeHistorySectionProps) {
  const [page, setPage] = useState(1);
  const { data: requestList, isLoading } = usePriceChangeRequests(
    order.purchaseOrderId,
    page
  );

  const hasRequests = (requestList?.data?.length ?? 0) > 0;
  const isRevisedOrder = (order.revisionNumber ?? 1) > 1;

  // Rule: Do not show this section on standard POs with zero requests and no revisions
  if (!isLoading && !hasRequests && !isRevisedOrder) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-white shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-dashboard-bg/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-foreground">
                Price Negotiations &amp; PO Amendments
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                Current PO Revision {order.revisionNumber ?? 1}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Historical record of price change proposals and formal PO amendments submitted for this order
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Loading price modification history...
          </div>
        ) : !hasRequests ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            This order was reissued at Revision {order.revisionNumber}, but no formal vendor
            proposal records are pending.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Commitment Impact</th>
                      <th className="px-4 py-3">Valid Until</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requestList?.data.map((req) => {
                      const badge = formatStatusBadge(req.status);
                      const Icon = badge.icon;
                      const diffNum = Number(req.difference);

                      return (
                        <tr
                          key={req.priceChangeRequestId}
                          className="hover:bg-muted/10 transition-colors"
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium border text-xs",
                                badge.classes
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-medium text-foreground">
                            <span
                              className={cn(
                                diffNum > 0
                                  ? "text-emerald-700 font-semibold"
                                  : diffNum < 0
                                  ? "text-amber-700 font-semibold"
                                  : "text-foreground"
                              )}
                            >
                              {diffNum > 0 ? "+" : ""}
                              {formatCurrency(diffNum, req.currency)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                            {formatDate(req.expiresAt)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenProposal(req.priceChangeRequestId)}
                            >
                              View Proposal <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination if multiple pages */}
            {requestList && requestList.meta && requestList.meta.totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span>
                  Page {page} of {requestList.meta.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= requestList.meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
