"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { openChat } from "@/lib/chat-events";

interface OpenChatButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /** Optional message pre-filled in the chat composer when opened. */
  prompt?: string;
}

export function OpenChatButton({
  children = "Parla con l'AI",
  prompt,
  onClick,
  className,
  ...props
}: OpenChatButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    openChat(prompt);
    onClick?.(event);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 rounded-full border border-line-strong text-accent-ink font-medium hover:bg-accent-subtle transition-all duration-200 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
