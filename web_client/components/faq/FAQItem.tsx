"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { FAQItem } from "@/lib/faq-data";
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
        "group border backdrop-blur-sm rounded-2xl overflow-hidden transition-all duration-300",
        isOpen
          ? "bg-white/10 border-luxury-gold/30 shadow-lg shadow-luxury-gold/5"
          : "bg-white/5 border-luxury-gold/10 hover:bg-white/[0.07] hover:border-luxury-gold/20"
      )}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-luxury-teal/40 rounded-2xl"
        aria-expanded={isOpen}
        aria-controls={`faq-content-${item.slug}`}
      >
        <span
          className={cn(
            "text-lg font-medium pr-4 leading-snug transition-colors duration-200",
            isOpen ? "text-luxury-gold" : "text-luxury-text/90 group-hover:text-luxury-gold"
          )}
        >
          {item.question}
        </span>
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200",
            isOpen
              ? "bg-luxury-teal/15 text-luxury-teal"
              : "bg-white/5 text-luxury-text/50 group-hover:bg-luxury-teal/10 group-hover:text-luxury-teal"
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

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={`faq-content-${item.slug}`}
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: "auto", marginBottom: 24 },
              collapsed: { opacity: 0, height: 0, marginBottom: 0 },
            }}
            transition={M3Transition.containerTransform}
          >
            <div className="px-6 prose prose-invert max-w-none text-luxury-text/80 leading-relaxed prose-strong:text-luxury-text prose-li:text-luxury-text/80">
              <div dangerouslySetInnerHTML={{ __html: item.answer }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
