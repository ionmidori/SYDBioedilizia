import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-2xl bg-surface border border-line shadow-[0_0_15px_color-mix(in_oklab,var(--color-accent)_5%,transparent)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
