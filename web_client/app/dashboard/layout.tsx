'use client';

import { SidebarProvider, useSidebar } from "@/components/dashboard/SidebarProvider"
import { AppSidebar } from "@/components/dashboard/AppSidebar"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { useAuth } from "@/hooks/useAuth"
import { useInactivityLogout } from "@/hooks/useInactivityLogout"
import { InactivityWarningDialog } from "@/components/auth/InactivityWarningDialog"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"

// Sidebar dimensions - w-60 = 15rem = 240px (expanded), w-20 = 5rem = 80px (collapsed)
const SIDEBAR_WIDTH_EXPANDED = '18rem'
const SIDEBAR_WIDTH_COLLAPSED = '5rem'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { logout, user, isInitialized } = useAuth();
    const router = useRouter();

    // Protection Logic: Redirect if not authenticated after initialization
    useEffect(() => {
        if (isInitialized && !user) {
            router.push('/');
        }
    }, [isInitialized, user, router]);

    // Enable inactivity detection only for authenticated (non-anonymous) users
    const { showWarning, secondsRemaining, extendSession } = useInactivityLogout({
        timeoutMinutes: 30,
        warningMinutes: 2,
        onLogout: logout,
        enabled: !!user && !user.isAnonymous,
    });

    // Show loading state while initializing
    if (!isInitialized) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-luxury-bg">
                <Loader2 className="w-10 h-10 text-luxury-gold animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <SidebarProvider>
            <DashboardContent
                showWarning={showWarning}
                secondsRemaining={secondsRemaining}
                extendSession={extendSession}
                logout={logout}
            >
                {children}
            </DashboardContent>
        </SidebarProvider>
    )
}

function DashboardContent({
    children,
    showWarning,
    secondsRemaining,
    extendSession,
    logout
}: {
    children: React.ReactNode
    showWarning: boolean
    secondsRemaining: number
    extendSession: () => void
    logout: () => Promise<void>
}) {
    const { open, isMobile } = useSidebar()

    // Calculate margin based on sidebar state - only on desktop
    const sidebarWidth = isMobile ? '0' : (open ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED)

    return (
        <div className="h-screen w-full bg-luxury-bg text-luxury-text overflow-hidden relative flex flex-col md:block">
            {/* Background Atmospheric Elements */}
            {/* Background Atmospheric Elements - Optimized with GPU acceleration */}
            {/* Background Atmospheric Elements - Optimized with GPU acceleration */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-luxury-teal/10 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2 pointer-events-none will-change-transform transform-gpu" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-luxury-gold/5 rounded-full blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2 pointer-events-none will-change-transform transform-gpu" />

            {/* Mobile Header - Visible only on mobile */}
            <DashboardHeader />

            {/* Desktop Sidebar - Fixed position, logic handled internally */}
            <AppSidebar className="z-20" />

            {/* Main Content Area */}
            <main
                style={{
                    marginLeft: sidebarWidth,
                    contain: 'layout paint'  // ISOLATION: Prevents reflow from cascading up
                }}
                className="flex-1 md:h-full overflow-hidden relative transition-[margin] duration-300 ease-in-out z-10 will-change-[margin]"
            >
                <div className="h-full overflow-auto p-4 md:p-8 selection:bg-luxury-teal/30">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </div>
            </main>

            {/* Inactivity Warning Dialog */}
            <InactivityWarningDialog
                open={showWarning}
                secondsRemaining={secondsRemaining}
                onExtend={extendSession}
                onLogout={logout}
            />
        </div>
    )
}
