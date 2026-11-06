"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Expand,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { ReceiptEvidenceItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LightboxImageItem {
  url: string;
  label: string;
  source?: "buyer" | "vendor";
  mimeType?: string;
}

interface EvidenceGalleryProps {
  buyerEvidence?: ReceiptEvidenceItem[];
  vendorEvidence?: ReceiptEvidenceItem[];
  /** Compact mode for banners */
  compact?: boolean;
  /** Pill mode: renders a small inline "N photos attached" trigger instead of 56x56 thumbnails */
  variant?: "thumbnails" | "pill";
  className?: string;
}

export function EvidenceGallery({
  buyerEvidence = [],
  vendorEvidence = [],
  compact = false,
  variant = "thumbnails",
  className,
}: EvidenceGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const allItems: LightboxImageItem[] = [
    ...buyerEvidence.map((ev, idx) => ({
      url: ev.url,
      label: ev.originalName || `Buyer Photo #${idx + 1}`,
      source: "buyer" as const,
      mimeType: ev.mimeType,
    })),
    ...vendorEvidence.map((ev, idx) => ({
      url: ev.url,
      label: ev.originalName || `Vendor Dispute Photo #${idx + 1}`,
      source: "vendor" as const,
      mimeType: ev.mimeType,
    })),
  ];

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) =>
      prev === null ? null : (prev - 1 + allItems.length) % allItems.length
    );
  }, [allItems.length]);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) =>
      prev === null ? null : (prev + 1) % allItems.length
    );
  }, [allItems.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setActiveIndex(null);
      } else if (e.key === "ArrowLeft" && allItems.length > 1) {
        e.stopPropagation();
        handlePrev();
      } else if (e.key === "ArrowRight" && allItems.length > 1) {
        e.stopPropagation();
        handleNext();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeIndex, allItems.length, handlePrev, handleNext]);

  if (allItems.length === 0) return null;

  const buyerItems = allItems
    .map((item, globalIdx) => ({ ...item, globalIdx }))
    .filter((item) => item.source === "buyer");

  const vendorItems = allItems
    .map((item, globalIdx) => ({ ...item, globalIdx }))
    .filter((item) => item.source === "vendor");

  const activeItem = activeIndex !== null ? allItems[activeIndex] : null;

  return (
    <>
      {variant === "pill" ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveIndex(0);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/90 hover:bg-white text-red-800 border border-red-200 shadow-2xs transition-colors cursor-pointer",
            className
          )}
        >
          <ImageIcon className="h-3 w-3 text-red-600 shrink-0" />
          <span>
            View {allItems.length} {allItems.length === 1 ? "photo" : "photos"}
          </span>
        </button>
      ) : (
        <div className={cn("flex flex-wrap items-start gap-5", className)}>
          {buyerItems.length > 0 && (
            <div className="space-y-1.5">
              {!compact && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900/80">
                  Buyer Inspection Photos ({buyerItems.length})
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {buyerItems.map((item) => (
                  <ThumbnailButton
                    key={`buyer-${item.globalIdx}-${item.url}`}
                    item={item}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveIndex(item.globalIdx);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {vendorItems.length > 0 && (
            <div className="space-y-1.5">
              {!compact && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-900/80">
                  Your Dispute Photos ({vendorItems.length})
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {vendorItems.map((item) => (
                  <ThumbnailButton
                    key={`vendor-${item.globalIdx}-${item.url}`}
                    item={item}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveIndex(item.globalIdx);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── In-Page Lightbox Modal ── */}
      {activeItem && activeIndex !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xs flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setActiveIndex(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Evidence photo preview"
        >
          {/* Top Bar */}
          <div
            className="flex items-center justify-between gap-4 text-white max-w-5xl w-full mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={cn(
                  "text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0",
                  activeItem.source === "vendor"
                    ? "bg-purple-500/30 text-purple-200 border border-purple-400/40"
                    : "bg-amber-500/30 text-amber-200 border border-amber-400/40"
                )}
              >
                {activeItem.source === "vendor"
                  ? "Vendor Dispute Photo"
                  : "Buyer Inspection Photo"}
              </span>
              <span className="text-sm font-medium truncate text-white/90">
                {activeItem.label}
              </span>
              {allItems.length > 1 && (
                <span className="text-xs text-white/60 shrink-0">
                  ({activeIndex + 1} of {allItems.length})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={activeItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
              >
                <span>Open original</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setActiveIndex(null)}
                aria-label="Close preview"
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Center Image Stage + Prev/Next Controls */}
          <div
            className="relative flex-1 flex items-center justify-center my-4 min-h-0 max-w-5xl w-full mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {allItems.length > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous photo"
                className="absolute left-2 sm:left-4 z-10 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 transition-colors shadow-lg"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeItem.url}
              alt={activeItem.label}
              className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10 bg-black/40"
            />

            {allItems.length > 1 && (
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next photo"
                className="absolute right-2 sm:right-4 z-10 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 transition-colors shadow-lg"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Bottom Thumbnail Strip (when multiple photos exist) */}
          {allItems.length > 1 ? (
            <div
              className="flex items-center justify-center gap-2 overflow-x-auto py-1 max-w-3xl mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {allItems.map((item, idx) => (
                <button
                  key={`strip-${idx}-${item.url}`}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "relative h-12 w-12 rounded-lg overflow-hidden border-2 transition-all shrink-0",
                    idx === activeIndex
                      ? "border-white scale-105 shadow-md"
                      : "border-white/20 opacity-60 hover:opacity-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.label}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}
        </div>
      )}
    </>
  );
}

function ThumbnailButton({
  item,
  onClick,
}: {
  item: LightboxImageItem;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Click to preview: ${item.label}`}
      className={cn(
        "group relative h-14 w-14 rounded-xl overflow-hidden border-2 bg-white shadow-xs transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0",
        item.source === "vendor"
          ? "border-purple-200 hover:border-purple-400"
          : "border-amber-200 hover:border-amber-400"
      )}
    >
      {!imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.label}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center bg-muted/40 text-muted-foreground p-1">
          <ImageIcon className="h-4 w-4" />
          <span className="text-[9px] truncate max-w-full mt-0.5">Photo</span>
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
        <Expand className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-xs" />
      </div>
    </button>
  );
}

export function LocalFilePreview({ file }: { file: File }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!objectUrl) return null;

  return (
    <EvidenceGallery
      compact
      vendorEvidence={[
        {
          url: objectUrl,
          publicId: file.name,
          mimeType: file.type,
          originalName: file.name,
        },
      ]}
    />
  );
}

