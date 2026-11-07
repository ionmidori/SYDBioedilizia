"use client";

import * as React from "react"
import { Slot as SlotPrimitive } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

const Slot = SlotPrimitive;

/** Variants, all coloured with semantic roles (web_client/brand/tokens/roles.tokens.json). */
export const BUTTON_VARIANTS = ["primary", "accent", "secondary", "ghost", "danger", "link"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: "bg-primary text-on-primary hover:bg-primary-hover",
    accent: "bg-accent text-on-accent hover:bg-accent/90",
    secondary: "border border-line text-ink hover:bg-surface-muted",
    ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
    danger: "bg-danger text-on-danger hover:bg-danger/90",
    link: "text-primary-ink underline-offset-4 hover:underline",
};

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
    {
        variants: {
            variant: VARIANT_CLASSES,
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-11 rounded-md px-8",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : motion.button

        // Motion props only apply when not using Slot (asChild) to avoid conflicts
        const motionProps = !asChild ? {
            whileTap: { scale: 0.96 },
            transition: { type: "spring", stiffness: 400, damping: 17 }
        } : {}

        return (
            // @ts-expect-error - React 19 / Motion component type mismatch
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...motionProps}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
