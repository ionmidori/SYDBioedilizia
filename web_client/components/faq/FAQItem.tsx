"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Link2, MessageSquare } from "lucide-react";
import { FAQAnswer } from "@/components/faq/FAQAnswer";
import { OpenChatButton } from "@/components/ui/open-chat-button";
import { M3Transition } from "@/lib/m3-motion";
import { cn } from "@/lib/utils";
import type { FaqItem } from "@/types/company-info";

interface FAQItemProps {
  item: FaqItem;
  forceOpen?: boolean;
  onToggle?: (slug: string, open: boolean) => void;
}

const subscribeToHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};

export function FAQItemCard({ item, forceOpen, onToggle }: FAQItemProps) {
  const reduceMotion = useReducedMotion();
  const hashMatches = useSyncExternalStore(
    subscribeToHash,
    () => typeof window !== "undefined" && window.location.hash === `#${item.slug}`,
    () => false
  );

  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [prevForceOpen, setPrevForceOpen] = useState<boolean | undefined>(forceOpen);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (forceOpen !== prevForceOpen) {
    setPrevForceOpen(forceOpen);
    setManualOpen(null);
  }

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === `#${item.slug}`) {
        setManualOpen(true);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [item.slug]);

  const isOpen = manualOpen ?? forceOpen ?? hashMatches;

  const handleToggle = () => {
    const next = !isOpen;
    setManualOpen(next);
    onToggle?.(item.slug, next);
  };

  const handleCopyLink = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}#${item.slug}`
        : `#${item.slug}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      id={item.slug}
      className={cn(
        "group scroll-mt-24 md:scroll-mt-60 rounded-2xl border bg-surface overflow-clip transition-[border-color,box-shadow,background-color] duration-200 motion-reduce:transition-none",
        isOpen
          ? "border-primary/35 shadow-2"
          : "border-line shadow-1 hover:border-line-strong hover:shadow-2"
      )}
    >
      <button
        id={`faq-trigger-${item.slug}`}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-4 min-h-[44px] p-5 sm:p-6 text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-2xl"
        aria-expanded={isOpen}
        aria-controls={`faq-content-${item.slug}`}
      >
        <span
          className={cn(
            "text-base sm:text-lg font-semibold leading-snug text-pretty transition-colors duration-200 motion-reduce:transition-none",
            isOpen ? "text-primary-ink" : "text-ink group-hover:text-primary-ink"
          )}
        >
          {item.question}
        </span>
        <span
          className={cn(
            "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-200 motion-reduce:transition-none",
            isOpen
              ? "bg-primary-subtle text-primary-ink"
              : "bg-surface-muted text-ink-muted group-hover:bg-primary-subtle group-hover:text-primary-ink"
          )}
          aria-hidden="true"
        >
          <motion.span
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={reduceMotion ? { duration: 0 } : M3Transition.gentleReveal}
            className="inline-flex"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.span>
        </span>
      </button>

      {/* CSS grid-template-rows 0fr <-> 1fr animates expansion smoothly without layout thrashing */}
      <div
        id={`faq-content-${item.slug}`}
        aria-labelledby={`faq-trigger-${item.slug}`}
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 invisible pointer-events-none"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-5 sm:px-6 pb-6 border-t border-line/70 pt-4">
            <div className="prose max-w-[68ch] text-ink leading-relaxed prose-strong:text-ink prose-li:text-ink text-pretty">
              {/* SECURITY: rendered as structured React elements, no HTML injection */}
              <FAQAnswer blocks={item.answer} />
            </div>

            <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
              <OpenChatButton
                prompt={`Vorrei approfondire questa FAQ: "${item.question}"`}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-xl border-primary/25 bg-primary-subtle text-primary-ink hover:bg-primary hover:text-on-primary hover:border-primary gap-2"
              >
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                Chiedi a SYD su questa domanda
              </OpenChatButton>

              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-success-ink" aria-hidden="true" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span aria-live="polite">{copied ? "Link copiato" : "Copia link"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
