"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useOrder } from "@/lib/hooks/useOrders";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState, EmptyState } from "@/components/ui/Spinner";
import {
  DeliveryModal, PartialDeliveryPanel,
} from "@/components/orders/DeliveryModal";
import {
  useAcknowledgeOrder,
  useMarkReadyForDelivery,
  useMarkDelivered,
  useFulfillDelivery,
} from "@/lib/hooks/useOrders";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { OrderItem, OrderStatus } from "@/lib/types";
import { toast } from "sonner";


const WORKFLOW_LABELS: Record<OrderStatus, string> = {
  assigned: "Assigned",
  acknowledged: "Acknowledged",
  ready_for_delivery: "Ready for Delivery",
  delivered: "Delivered",
  invoiced: "Invoiced",
};

const WORKFLOW_STEPS: OrderStatus[] = [
  "assigned", "acknowledged", "ready_for_delivery", "delivered", "invoiced",
];

function OrderDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="bg-white rounded-2xl border border-dashboard-border p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-dashboard-border p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<
    "none" | "selecting" | "partial"
  >("none");
  // Per-item delivery dates entered by the vendor while the order is in
  // "assigned" state. Previously these inputs were purely decorative —
  // the Acknowledge button always submitted today's date for every item
  // regardless of what was typed here. Lifting state up fixes that.
  const [itemDeliveryDates, setItemDeliveryDates] = useState<Record<string, string>>({});

  const { data: order, isLoading, isError, refetch } = useOrder(id);

  const acknowledge = useAcknowledgeOrder();
  const readyForDelivery = useMarkReadyForDelivery();
  const { fullMutation, partialMutation } = useMarkDelivered();
  const fulfill = useFulfillDelivery();

  const allDatesEntered = useMemo(() => {
    if (!order) return false;
    return order.items.every((item) => !!itemDeliveryDates[item.id]);
  }, [order, itemDeliveryDates]);

  if (isLoading) return <OrderDetailSkeleton />;

  if (isError) {
    return (
      <ErrorState
        message="Couldn't load this order. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!order) {
    return (
      <EmptyState
        title="Order not found"
        description="This order may have been removed, or you may not have access to it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">Back to orders</Link>
          </Button>
        }
      />
    );
  }

  const currentStepIdx = WORKFLOW_STEPS.indexOf(order.status);

  const handleAcknowledge = () => {
    if (!allDatesEntered) {
      toast.error("Please enter a delivery date for every item before acknowledging.");
      return;
    }
    acknowledge.mutate({
      id: order.id,
      items: order.items.map((i) => ({
        id: i.id,
        delivery_date: itemDeliveryDates[i.id],
      })),
    });
  };

  // Compute CTA button based on status
  const renderCTA = () => {
    switch (order.status) {
      case "assigned":
        return (
          <Button
            variant="primary"
            loading={acknowledge.isPending}
            disabled={!allDatesEntered}
            onClick={handleAcknowledge}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Acknowledge Order
          </Button>
        );
      case "acknowledged":
        return (
          <Button
            variant="primary"
            loading={readyForDelivery.isPending}
            onClick={() => readyForDelivery.mutate(order.id)}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Set as Ready for delivery
          </Button>
        );
      case "ready_for_delivery":
        return (
          <Button
            variant="primary"
            onClick={() => {
              setDeliveryMode("selecting");
              setShowDeliveryModal(true);
            }}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Set as Delivered
          </Button>
        );
      case "delivered":
        return (
          <div className="flex gap-2">
            {order.delivery_type === "partial" && (
              <Button
                variant="outline"
                onClick={() => setDeliveryMode("partial")}
              >
                Fulfill Delivery
              </Button>
            )}
            <Button asChild variant="primary">
              <Link href={`/invoices/create?order_id=${order.id}`}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Create an Invoice
              </Link>
            </Button>
          </div>
        );
      case "invoiced":
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="p-1.5 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold">{order.po_number}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Issued on {formatDate(order.issue_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">{renderCTA()}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Left column */}
        <div className="space-y-4">
          {/* Validation hint for assigned state */}
          {order.status === "assigned" && (
            <div className="text-xs text-red-500 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Enter the delivery date for every item below before acknowledging
            </div>
          )}

          {/* Partial delivery in-progress hint */}
          {deliveryMode === "partial" && (
            <div className="text-xs text-red-500 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Enter the quantity you delivered below
            </div>
          )}

          {/* Order Details card */}
          <div className="bg-white rounded-2xl border border-dashboard-border p-6 space-y-4">
            <h2 className="text-base font-semibold">Order Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="text-sm font-semibold mt-0.5">{order.organization}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deadline</p>
                <p className="text-sm font-semibold mt-0.5">{formatDate(order.deadline)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delivery Status</p>
                <p className="text-sm font-semibold mt-0.5 capitalize">
                  {order.delivery_status === "partial"
                    ? "Partial"
                    : order.delivery_status === "delivered"
                    ? "Delivered"
                    : "Pending"}
                </p>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white rounded-2xl border border-dashboard-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">
                Items <span className="text-muted-foreground font-normal ml-1">{order.items.length}</span>
              </h2>
            </div>

            {/* Partial delivery mode — editable quantities */}
            {deliveryMode === "partial" ? (
              <div className="p-6">
                <PartialDeliveryPanel
                  items={order.items}
                  isPending={partialMutation.isPending || fulfill.isPending}
                  onCancel={() => setDeliveryMode("none")}
                  onConfirm={(items) => {
                    if (order.delivery_type === "partial") {
                      fulfill.mutate({ id: order.id, items });
                    } else {
                      partialMutation.mutate({ id: order.id, items });
                    }
                    setDeliveryMode("none");
                  }}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Description</th>
                      {order.delivery_type === "partial" ? (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivered</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Remaining</th>
                        </>
                      ) : (
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Quantity</th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <OrderItemRow
                        key={item.id}
                        item={item}
                        isAssigned={order.status === "assigned"}
                        showPartial={order.delivery_type === "partial"}
                        date={itemDeliveryDates[item.id] ?? item.delivery_date ?? ""}
                        onDateChange={(date) =>
                          setItemDeliveryDates((prev) => ({ ...prev, [item.id]: date }))
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: workflow progress */}
        <div className="bg-white rounded-2xl border border-dashboard-border p-5 h-fit">
          <h3 className="text-sm font-semibold mb-4">Workflow Progress</h3>
          <div className="space-y-0">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isCompleted = idx <= currentStepIdx;

              const isLast = idx === WORKFLOW_STEPS.length - 1;

              // Get timestamp from order workflow
              const workflowStep = order.workflow?.find((w) => w.status === step);

              // Special label for delivered step
              let label = WORKFLOW_LABELS[step];
              if (step === "delivered" && order.delivery_type) {
                label = `Delivered (${order.delivery_type === "full" ? "Full" : "Partial"})`;
              }

              return (
                <div key={step} className="flex gap-3">
                  {/* Dot + line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                        isCompleted
                          ? "border-primary bg-primary"
                          : "border-border bg-white"
                      )}
                    >
                      {isCompleted && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={cn(
                          "w-0.5 flex-1 my-1",
                          isCompleted ? "bg-primary" : "bg-border"
                        )}
                        style={{ minHeight: 24 }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-4 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isCompleted ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </p>
                    {workflowStep?.timestamp && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(workflowStep.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Delivery type selection modal */}
      <DeliveryModal
        open={showDeliveryModal}
        onClose={() => {
          setShowDeliveryModal(false);
          setDeliveryMode("none");
        }}
        onConfirmFull={() => {
          fullMutation.mutate(order.id);
          setShowDeliveryModal(false);
          setDeliveryMode("none");
        }}
        onConfirmPartial={() => {
          setShowDeliveryModal(false);
          setDeliveryMode("partial");
        }}
        isPending={fullMutation.isPending}
      />
    </div>
  );
}

// ─── Row component ────────────────────────────
function OrderItemRow({
  item,
  isAssigned,
  showPartial,
  date,
  onDateChange,
}: {
  item: OrderItem;
  isAssigned: boolean;
  showPartial: boolean;
  date: string;
  onDateChange: (date: string) => void;
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-6 py-3.5 text-sm font-medium whitespace-nowrap">{item.name}</td>
      <td className="px-6 py-3.5 text-sm text-muted-foreground">{item.description}</td>
      {showPartial ? (
        <>
          <td className="px-6 py-3.5 text-sm">{item.delivered_quantity ?? 0}</td>
          <td className="px-6 py-3.5 text-sm text-amber-600">{item.remaining_quantity ?? item.quantity}</td>
        </>
      ) : (
        <td className="px-6 py-3.5 text-sm">{item.quantity}</td>
      )}
      <td className="px-6 py-3.5">
        {isAssigned ? (
          <div className="relative">
            <label htmlFor={`delivery-date-${item.id}`} className="sr-only">
              Delivery date for {item.name}
            </label>
            <input
              id={`delivery-date-${item.id}`}
              type="date"
              required
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className={cn(
                "text-sm border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                date ? "border-border text-foreground" : "border-red-200 text-muted-foreground"
              )}
            />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {item.delivery_date ? formatDate(item.delivery_date) : "—"}
          </span>
        )}
      </td>
    </tr>
  );
}
