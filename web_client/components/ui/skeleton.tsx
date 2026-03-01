import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-2xl bg-white/5 border border-white/5 shadow-[0_0_15px_rgba(233,196,106,0.05)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
