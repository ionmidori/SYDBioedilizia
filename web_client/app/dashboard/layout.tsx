import { Metadata } from "next"
import { DashboardClientLayout } from "@/components/dashboard/DashboardClientLayout"

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
