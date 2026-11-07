import * as React from "react"

import type { ElevationLevel } from "@/lib/brand/tokens.generated"
import { cn } from "@/lib/utils"

/** Elevation level -> shadow utility (levels from web_client/brand/tokens/elevation.tokens.json). */
const ELEVATION_CLASS: Record<0 | ElevationLevel, string> = {
    0: "",
    1: "shadow-1",
    2: "shadow-2",
    3: "shadow-3",
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Depth through shadow, not glass: 0 (flat, default) to 3 (dialog-like). */
    elevation?: 0 | ElevationLevel
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, elevation = 0, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("rounded-lg border border-line bg-surface text-ink", ELEVATION_CLASS[elevation], className)}
        {...props}
    />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex flex-col space-y-1.5 p-6", className)}
        {...props}
    />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn(
            "text-2xl font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-ink-muted", className)}
        {...props}
    />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex items-center p-6 pt-0", className)}
        {...props}
    />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
