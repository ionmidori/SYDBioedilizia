"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface OpenChatButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function OpenChatButton({ children = "Parla con l'AI", className, ...props }: OpenChatButtonProps) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("OPEN_CHAT"))}
      className={cn(
        "inline-flex items-center justify-center px-6 py-3 rounded-full border border-luxury-gold/30 text-luxury-gold font-medium hover:bg-luxury-gold/10 transition-all duration-200 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
