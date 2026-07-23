import { Metadata } from "next"
import { DashboardClientLayout } from "@/components/dashboard/DashboardClientLayout"

// Required by the strict CSP (issue #133): the proxy injects a per-request
// nonce for /dashboard/*, and Next.js can only stamp it on its <script> tags
// when the route is rendered dynamically (static HTML has no request headers).
// No SEO/caching cost: the dashboard is auth-gated and per-user anyway.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Dashboard | SYD",
    description: "La tua area personale SYD",
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <DashboardClientLayout>{children}</DashboardClientLayout>
}
