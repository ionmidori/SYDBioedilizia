"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Minus } from "lucide-react";
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
        "group border border-border/40 bg-card/50 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-300",
        isOpen ? "bg-card/80 border-primary/20 shadow-lg" : "hover:bg-card/60"
      )}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-xl"
        aria-expanded={isOpen}
        aria-controls={`faq-content-${item.slug}`}
      >
        <span className="text-lg font-medium pr-4 leading-snug text-foreground/90 group-hover:text-primary transition-colors">
          {item.question}
        </span>
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200",
          isOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:bg-primary/5"
        )}>
          {/* Animated icon swap or rotation */}
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
              collapsed: { opacity: 0, height: 0, marginBottom: 0 }
            }}
            transition={M3Transition.containerTransform}
          >
            <div className="px-6 prose prose-neutral dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
              <div dangerouslySetInnerHTML={{ __html: item.answer }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
