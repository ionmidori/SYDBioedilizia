"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { FAQItem } from "@/lib/faq-data";
import { FAQAnswer } from "@/components/faq/FAQAnswer";
import { M3Transition } from "@/lib/m3-motion";
import { cn } from "@/lib/utils";

interface FAQItemProps {
  item: FAQItem;
}

export function FAQItemCard({ item }: FAQItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      id={item.slug}
      className={cn(
        "group border backdrop-blur-sm rounded-2xl overflow-hidden transition-colors duration-300",
        isOpen
          ? "bg-surface-muted border-line shadow-lg"
          : "bg-surface border-line hover:bg-surface-muted hover:border-line"
      )}
    >
      <button
        id={`faq-trigger-${item.slug}`}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
        aria-expanded={isOpen}
        aria-controls={`faq-content-${item.slug}`}
      >
        <span
          className={cn(
            "text-lg font-medium pr-4 leading-snug transition-colors duration-200",
            isOpen ? "text-accent-ink" : "text-ink group-hover:text-accent-ink"
          )}
        >
          {item.question}
        </span>
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200",
            isOpen
              ? "bg-primary-subtle text-primary-ink"
              : "bg-surface text-ink-muted group-hover:bg-primary-subtle group-hover:text-primary-ink"
          )}
        >
          <motion.div
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={M3Transition.gentleReveal}
          >
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </div>
      </button>

      {/* CSS grid-template-rows 0fr <-> 1fr animates expansion smoothly without layout thrashing */}
      <div
        id={`faq-content-${item.slug}`}
        role="region"
        aria-labelledby={`faq-trigger-${item.slug}`}
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 invisible pointer-events-none"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-6 prose max-w-none text-ink leading-relaxed prose-strong:text-ink prose-li:text-ink">
            {/* SECURITY: rendered as structured React elements, no HTML injection */}
            <FAQAnswer blocks={item.answer} />
          </div>
        </div>
      </div>
    </div>
  );
}
