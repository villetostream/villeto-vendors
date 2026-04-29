"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOrder } from "@/lib/api/orders";
import { queryKeys, useOrgStore } from "@/lib/stores/orgStore";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { PageSpinner } from "@/components/ui/Spinner";
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

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const orgId = useOrgStore((s) => s.activeOrgId) ?? "";

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<
    "none" | "selecting" | "partial"
  >("none");

  const { data: order, isLoading } = useQuery({
    queryKey: queryKeys.order(orgId, id),
    queryFn: () => getOrder(id),
    enabled: !!orgId,
    // Use mock for development
    placeholderData: MOCK_ORDER,
  });

  const acknowledge = useAcknowledgeOrder();
  const readyForDelivery = useMarkReadyForDelivery();
  const { fullMutation, partialMutation } = useMarkDelivered();
  const fulfill = useFulfillDelivery();

  if (isLoading) return <PageSpinner />;
  if (!order) return null;

  const currentStepIdx = WORKFLOW_STEPS.indexOf(order.status);

  // Compute CTA button based on status
  const renderCTA = () => {
    switch (order.status) {
      case "assigned":
        return (
          <Button
            variant="primary"
            loading={acknowledge.isPending}
            onClick={() => {
              // For assigned → acknowledged, collect delivery dates first
              // In production this would open a date picker per item
              acknowledge.mutate({
                id: order.id,
                items: order.items.map((i) => ({
                  id: i.id,
                  delivery_date: new Date().toISOString().slice(0, 10),
                })),
              });
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
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
            <CheckCircle2 className="h-4 w-4" />
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
            <CheckCircle2 className="h-4 w-4" />
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
                <CheckCircle2 className="h-4 w-4" />
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
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
              Enter the delivery date for item below
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
            <div className="grid grid-cols-3 gap-6 pt-2 border-t border-border">
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Description</th>
                    {order.delivery_type === "partial" ? (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Delivered</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Remaining</th>
                      </>
                    ) : (
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Delivery date</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <OrderItemRow
                      key={item.id}
                      item={item}
                      isAssigned={order.status === "assigned"}
                      showPartial={order.delivery_type === "partial"}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: workflow progress */}
        <div className="bg-white rounded-2xl border border-dashboard-border p-5 h-fit">
          <h3 className="text-sm font-semibold mb-4">Workflow Progress</h3>
          <div className="space-y-0">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isCompleted = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;
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
}: {
  item: OrderItem;
  isAssigned: boolean;
  showPartial: boolean;
}) {
  const [date, setDate] = useState(item.delivery_date ?? "");

  return (
    <tr className="border-b border-border/60">
      <td className="px-6 py-3.5 text-sm font-medium">{item.name}</td>
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="dd/mm/yyy"
              className="text-sm text-muted-foreground border-0 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {formatDate(item.delivery_date ?? "")}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Mock order ───────────────────────────────
const MOCK_ORDER = {
  id: "1",
  po_number: "PO-2024-001",
  org_id: "org1",
  organization: "ABC Enterprise",
  issue_date: "2024-03-15",
  deadline: "2024-04-15",
  priority: "medium" as const,
  status: "ready_for_delivery" as const,
  delivery_status: "pending" as const,
  delivery_type: undefined,
  items: [
    { id: "i1", name: "Heavy Duty Pallets", description: "Brief description on the item", quantity: 12, delivery_date: "2024-04-15" },
    { id: "i2", name: "Heavy Duty Pallets", description: "Brief description on the item", quantity: 12, delivery_date: "2024-04-15" },
    { id: "i3", name: "Heavy Duty Pallets", description: "Brief description on the item", quantity: 12, delivery_date: "2024-04-15" },
    { id: "i4", name: "Heavy Duty Pallets", description: "Brief description on the item", quantity: 12, delivery_date: "2024-04-15" },
    { id: "i5", name: "Heavy Duty Pallets", description: "Brief description on the item", quantity: 12, delivery_date: "2024-04-15" },
  ],
  workflow: [
    { status: "assigned" as const, label: "Assigned", completed: true, timestamp: "2025-09-10T19:07:00Z" },
    { status: "acknowledged" as const, label: "Acknowledged", completed: true, timestamp: "2025-09-10T19:07:00Z" },
    { status: "ready_for_delivery" as const, label: "Ready for Delivery", completed: true, timestamp: "2025-09-10T19:07:00Z" },
    { status: "delivered" as const, label: "Delivered", completed: false },
    { status: "invoiced" as const, label: "Invoiced", completed: false },
  ],
};
