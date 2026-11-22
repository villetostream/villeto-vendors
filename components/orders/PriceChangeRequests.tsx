"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { toast } from "sonner";

type Pricing = {
  from: string;
  to: string;
  unitPrice: string;
  revision: number;
};
type EligibleLine = {
  purchaseOrderLineItemId: string;
  name: string;
  eligibleQuantity: string;
  protectedQuantity: string;
  orderedQuantity: string;
  currentPricing: Pricing[];
  activeRequestId: string | null;
};
type Proposal = {
  reason: string;
  lineItems: {
    purchaseOrderLineItemId: string;
    quantity: string;
    proposedUnitPrice: string;
  }[];
  supportingDocuments: { name: string; url: string }[];
};
type Comparison = {
  currency: string;
  previousTotal: string;
  totalAmount: string;
  difference: string;
  previousTaxAmount: string;
  taxAmount: string;
  lineItems: {
    purchaseOrderLineItemId: string;
    name: string;
    previousAmount: string;
    proposedAmount: string;
    quantity: string;
    proposedUnitPrice: string;
    pricing: Pricing[];
  }[];
};
type Detail = {
  priceChangeRequestId: string;
  status: string;
  version: number;
  basisRevision: number;
  expiresAt: string;
  proposal: Proposal;
  comparison: Comparison;
  history: {
    action: string;
    version: number;
    at: string;
    reason?: string;
    proposal?: Proposal;
    comparison?: Comparison;
  }[];
};
type Summary = {
  priceChangeRequestId: string;
  status: string;
  difference: string;
  currency: string;
  expiresAt: string;
};
const root = "/vendor-portal/po-change-requests";
const label = (text: string) => text === "approved_pending_issue" ? "awaiting final approval" : text.replaceAll("_", " ");
const money = (value: string, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    Number(value),
  );
const button =
  "rounded-xl border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40";
const errorMessage = (error: unknown) => {
  const normalized = error as { message?: string | string[]; response?: { data?: { message?: string | string[] } } };
  const message = normalized?.response?.data?.message ?? normalized?.message;
  return (Array.isArray(message) ? message.join(" ") : message) || "Could not complete this action. Refresh and try again.";
};

function ScopedPriceChangeRequests({
  purchaseOrderId,
  acknowledged,
  startRequest = 0,
}: {
  purchaseOrderId: string;
  acknowledged: boolean;
  startRequest?: number;
}) {
  const companyId = useCompanyStore((state) => state.activeCompanyId);
  const client = useQueryClient();
  const key = ["vendor-po-price-changes", companyId, purchaseOrderId];
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<
    Record<string, { selected: boolean; quantity: string; price: string }>
  >({});
  const [reason, setReason] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [documents, setDocuments] = useState<Proposal["supportingDocuments"]>(
    [],
  );
  const [preview, setPreview] = useState<Comparison | null>(null);
  const [previewPayload, setPreviewPayload] = useState("");
  const [page, setPage] = useState(1);
  const idempotencyKey = useRef<string | null>(null);
  const eligibility = useQuery({
    queryKey: [...key, "eligibility"],
    enabled: !!companyId,
    queryFn: async () =>
      (
        await apiClient.get<{
          data: {
            eligible: boolean;
            revision: number;
            currency: string;
            lineItems: EligibleLine[];
          };
        }>(`${root}/orders/${purchaseOrderId}/eligibility`)
      ).data.data,
  });
  const list = useQuery({
    queryKey: [...key, "list", page],
    enabled: !!companyId,
    queryFn: async () =>
      (
        await apiClient.get<{ data: Summary[]; meta: { totalPages: number } }>(
          root,
          { params: { purchaseOrderId, page, limit: 20 } },
        )
      ).data,
  });
  const detail = useQuery({
    queryKey: [...key, "detail", selected],
    enabled: !!companyId && !!selected,
    staleTime: 30_000,
    queryFn: async () =>
      (await apiClient.get<{ data: Detail }>(`${root}/${selected}`)).data.data,
  });
  const payload = (): Proposal & { idempotencyKey: string } => {
    idempotencyKey.current ??= crypto.randomUUID();
    return {
      idempotencyKey: idempotencyKey.current,
      reason: reason.trim(),
      supportingDocuments: documents,
      lineItems: Object.entries(draft)
        .filter(([, value]) => value.selected)
        .map(([purchaseOrderLineItemId, value]) => ({
          purchaseOrderLineItemId,
          quantity: value.quantity,
          proposedUnitPrice: value.price,
        })),
    };
  };
  const calculate = useMutation({
    mutationFn: async () => {
      const proposed = payload();
      if (!proposed.reason || !proposed.lineItems.length)
        throw new Error("Select at least one line and enter a reason.");
      const result = (
        await apiClient.post<{ data: Comparison }>(
          `${root}/orders/${purchaseOrderId}/preview`,
          proposed,
        )
      ).data.data;
      setPreview(result);
      setPreviewPayload(JSON.stringify(proposed));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const submit = useMutation({
    mutationFn: async () => {
      const proposed = payload();
      if (JSON.stringify(proposed) !== previewPayload)
        throw new Error("Recalculate the proposal before submitting.");
      if (selected && editing)
        return (
          await apiClient.post<{ data: Detail }>(
            `${root}/${selected}/resubmit`,
            { ...proposed, expectedVersion: detail.data!.version },
          )
        ).data.data;
      return (
        await apiClient.post<{ data: Detail }>(
          `${root}/orders/${purchaseOrderId}`,
          proposed,
        )
      ).data.data;
    },
    onSuccess: async (result) => {
      setSelected(result.priceChangeRequestId);
      setEditing(false);
      setPreview(null);
      idempotencyKey.current = null;
      client.setQueryData([...key, "detail", result.priceChangeRequestId], result);
      await Promise.all([
        client.invalidateQueries({ queryKey: [...key, "list"] }),
        client.invalidateQueries({ queryKey: [...key, "eligibility"] }),
      ]);
      toast.success("Price proposal submitted for company review.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const withdraw = useMutation({
    mutationFn: async () => {
      if (!detail.data) return;
      return (await apiClient.post<{ data: Detail }>(
        `${root}/${detail.data.priceChangeRequestId}/withdraw`,
        { expectedVersion: detail.data.version },
      )).data.data;
    },
    onSuccess: async (result) => {
      if (result) client.setQueryData([...key, "detail", result.priceChangeRequestId], result);
      await Promise.all([
        client.invalidateQueries({ queryKey: [...key, "list"] }),
        client.invalidateQueries({ queryKey: [...key, "eligibility"] }),
      ]);
      toast.success("Price proposal withdrawn.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const editLine = (
    id: string,
    change: Partial<{ selected: boolean; quantity: string; price: string }>,
  ) => {
    setDraft((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? { selected: false, quantity: "", price: "" }),
        ...change,
      },
    }));
    setPreview(null);
  };
  const start = useCallback((correct?: Detail) => {
    setEditing(true);
    setPreview(null);
    setPreviewPayload("");
    idempotencyKey.current = null;
    setReason(correct?.proposal.reason ?? "");
    setDocuments(correct?.proposal.supportingDocuments ?? []);
    setSelected(correct?.priceChangeRequestId ?? null);
    const next: typeof draft = {};
    for (const line of eligibility.data?.lineItems ?? []) {
      const existing = correct?.proposal.lineItems.find(
        (value) =>
          value.purchaseOrderLineItemId === line.purchaseOrderLineItemId,
      );
      const pricing = line.currentPricing.find(
        (range) => Number(range.to) > Number(line.protectedQuantity),
      );
      next[line.purchaseOrderLineItemId] = {
        selected: !!existing,
        quantity: existing?.quantity ?? line.eligibleQuantity,
        price: existing?.proposedUnitPrice ?? pricing?.unitPrice ?? "",
      };
    }
    setDraft(next);
  }, [eligibility.data]);
  const lastStartRequest = useRef(0);
  useEffect(() => {
    if (startRequest > 0 && startRequest !== lastStartRequest.current && eligibility.data) {
      lastStartRequest.current = startRequest;
      start();
    }
  }, [startRequest, eligibility.data, start]);
  const current = detail.data;
  return (
    <section className="space-y-4 rounded-2xl border border-dashboard-border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Price changes</h2>
          <p className="text-sm text-gray-600">
            Propose a change → buyer review → approved and issued. Final approval applies the revised prices automatically.
          </p>
        </div>
        <button
          className={button}
          disabled={!eligibility.data?.eligible || !eligibility.data.lineItems.some((line) => Number(line.eligibleQuantity) > 0 && !line.activeRequestId) || editing}
          onClick={() => start()}
        >
          Propose a price change
        </button>
      </div>
      {!acknowledged && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">You can request a price change before acknowledging. A proposal does not acknowledge the order or pause fulfillment. Return to Order &amp; delivery when you are ready to confirm delivery dates.</p>}
      {list.data?.data.length === 0 && !editing && <p className="text-sm text-gray-500">No price changes requested. Use this only when the issued prices need to change.</p>}
      {(eligibility.isError || list.isError) && (
        <p role="alert" className="text-red-700">
          Unable to load price modifications.{" "}
          <button
            className="underline"
            onClick={() => {
              void eligibility.refetch();
              void list.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {eligibility.data && (
        <details>
          <summary className="cursor-pointer text-sm">
            Issued pricing · revision {eligibility.data.revision}
          </summary>
          {eligibility.data.lineItems.map((line) => (
            <div
              key={line.purchaseOrderLineItemId}
              className="mt-2 rounded border p-3 text-sm"
            >
              <strong>{line.name}</strong>
              <p>
                {line.eligibleQuantity} eligible; {line.protectedQuantity}{" "}
                protected.
              </p>
              {line.currentPricing.map((range, i) => (
                <p key={i}>
                  {Number(range.to) - Number(range.from)} units:{" "}
                  {money(range.unitPrice, eligibility.data!.currency)} each ·
                  revision {range.revision}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      {list.data?.data.map((request) => (
        <div
          key={request.priceChangeRequestId}
          className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
        >
          <span>
            {label(request.status)} ·{" "}
            {money(request.difference, request.currency)} · valid until{" "}
            {new Date(request.expiresAt).toLocaleString()}
          </span>
          <button
            className="underline"
            onClick={() => {
              setSelected(request.priceChangeRequestId);
              setEditing(false);
            }}
          >
            View request
          </button>
        </div>
      ))}
      {list.data && list.data.meta.totalPages > 1 && (
        <div className="flex gap-3">
          <button
            className={button}
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className={button}
            disabled={page >= list.data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      {detail.isError && (
        <p role="alert" className="text-red-700">
          {errorMessage(detail.error)}
        </p>
      )}
      {current && !editing && (
        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">
            Version {current.version} · {label(current.status)}
          </h3>
          <p className="whitespace-pre-wrap">{current.proposal.reason}</p>
          <p>
            Commitment:{" "}
            {money(
              current.comparison.previousTotal,
              current.comparison.currency,
            )}{" "}
            →{" "}
            {money(current.comparison.totalAmount, current.comparison.currency)}{" "}
            · difference{" "}
            {money(current.comparison.difference, current.comparison.currency)}
          </p>
          {current.comparison.lineItems.map((line) => (
            <p key={line.purchaseOrderLineItemId}>
              {line.name}: {line.quantity} units · affected value{" "}
              {money(line.previousAmount, current.comparison.currency)} →{" "}
              {money(line.proposedAmount, current.comparison.currency)} at{" "}
              {money(line.proposedUnitPrice, current.comparison.currency)} each.
            </p>
          ))}
          <div className="flex gap-2">
            {current.status === "returned_for_correction" && (
              <button className={button} onClick={() => start(current)}>
                Correct and resubmit
              </button>
            )}
            {["pending_review", "returned_for_correction"].includes(
              current.status,
            ) && (
              <button
                className={button}
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate()}
              >
                Withdraw request
              </button>
            )}
            <button className={button} onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <details>
            <summary>Submission and decision history</summary>
            {current.history.map((entry, i) => (
              <div key={i} className="my-2 border-t pt-2 text-sm">
                <p>
                  Version {entry.version} · {label(entry.action)} ·{" "}
                  {new Date(entry.at).toLocaleString()}
                </p>
                {entry.reason && <p>{entry.reason}</p>}
                {entry.comparison && (
                  <p>
                    Proposed commitment{" "}
                    {money(
                      entry.comparison.totalAmount,
                      entry.comparison.currency,
                    )}{" "}
                    · difference{" "}
                    {money(
                      entry.comparison.difference,
                      entry.comparison.currency,
                    )}
                  </p>
                )}
              </div>
            ))}
          </details>
        </div>
      )}
      {editing && eligibility.data && (
        <form
          className="space-y-4 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <h3 className="font-semibold">
            {selected
              ? "Correct request and resubmit"
              : "New price modification"}
          </h3>
          <p className="text-sm text-gray-600">
            The revised price applies to the next eligible units supplied after
            revised-order issue. Goods marked ready remain eligible until
            dispatched.
          </p>
          {eligibility.data.lineItems.map((line) => {
            const value = draft[line.purchaseOrderLineItemId];
            const blocked =
              Number(line.eligibleQuantity) <= 0 ||
              (!!line.activeRequestId && line.activeRequestId !== selected);
            return (
              <fieldset
                key={line.purchaseOrderLineItemId}
                className="rounded-lg border p-3"
                disabled={blocked}
              >
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={value?.selected ?? false}
                    onChange={(e) =>
                      editLine(line.purchaseOrderLineItemId, {
                        selected: e.target.checked,
                      })
                    }
                  />
                  {line.name} · {line.eligibleQuantity} eligible
                  {blocked && " · unavailable or another request active"}
                </label>
                {value?.selected && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Quantity affected
                      <input
                        className="mt-1 w-full rounded border p-2"
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={line.eligibleQuantity}
                        value={value.quantity}
                        onChange={(e) =>
                          editLine(line.purchaseOrderLineItemId, {
                            quantity: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Proposed unit price ({eligibility.data!.currency})
                      <input
                        className="mt-1 w-full rounded border p-2"
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={value.price}
                        onChange={(e) =>
                          editLine(line.purchaseOrderLineItemId, {
                            price: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </fieldset>
            );
          })}
          <label className="block text-sm">
            Reason
            <textarea
              className="mt-1 w-full rounded border p-2"
              required
              maxLength={4000}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <fieldset className="space-y-2 rounded border p-3">
            <legend className="text-sm">Optional supporting documents</legend>
            {documents.map((doc, index) => (
              <div key={index} className="flex justify-between text-sm">
                <a
                  className="underline"
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {doc.name}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDocuments((d) => d.filter((_, i) => i !== index));
                    setPreview(null);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <label className="block text-sm">
              Document name
              <input
                className="ml-2 rounded border p-2"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              HTTPS document link
              <input
                className="ml-2 rounded border p-2"
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
              />
            </label>
            <button
              className={button}
              type="button"
              disabled={
                !documentName.trim() ||
                !documentUrl.startsWith("https://") ||
                documents.length >= 10
              }
              onClick={() => {
                setDocuments((d) => [
                  ...d,
                  { name: documentName.trim(), url: documentUrl.trim() },
                ]);
                setDocumentName("");
                setDocumentUrl("");
                setPreview(null);
              }}
            >
              Add document
            </button>
          </fieldset>
          {preview && (
            <div className="rounded-lg bg-emerald-50 p-3">
              <p>
                Current commitment:{" "}
                {money(preview.previousTotal, preview.currency)}
              </p>
              <p>
                Proposed commitment:{" "}
                {money(preview.totalAmount, preview.currency)}
              </p>
              <p>
                Financial difference:{" "}
                {money(preview.difference, preview.currency)}
              </p>
              <p className="text-sm">
                Tax recalculated from{" "}
                {money(preview.previousTaxAmount, preview.currency)} to{" "}
                {money(preview.taxAmount, preview.currency)}.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              className={button}
              type="button"
              disabled={calculate.isPending || submit.isPending}
              onClick={() => calculate.mutate()}
            >
              Calculate proposal
            </button>
            <button
              className={button}
              type="submit"
              disabled={!preview || submit.isPending}
            >
              Submit for review
            </button>
            <button
              className={button}
              type="button"
              onClick={() => {
                setEditing(false);
                setPreview(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function PriceChangeRequests({
  purchaseOrderId,
  acknowledged,
  startRequest = 0,
}: {
  purchaseOrderId: string;
  acknowledged: boolean;
  startRequest?: number;
}) {
  const companyId = useCompanyStore((state) => state.activeCompanyId);
  return (
    <ScopedPriceChangeRequests
      key={`${companyId}:${purchaseOrderId}`}
      purchaseOrderId={purchaseOrderId}
      acknowledged={acknowledged}
      startRequest={startRequest}
    />
  );
}
