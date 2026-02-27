'use client';

import { SidebarProvider, useSidebar } from "@/components/dashboard/SidebarProvider"
import { AppSidebar } from "@/components/dashboard/AppSidebar"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { useAuth } from "@/hooks/useAuth"
import { useInactivityLogout } from "@/hooks/useInactivityLogout"
import { InactivityWarningDialog } from "@/components/auth/InactivityWarningDialog"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { useEffect, useMemo } from "react"
import { MobileSwipeLayout } from "@/components/mobile/MobileSwipeLayout"
import { OnboardingTour } from "@/components/dashboard/OnboardingTour"
import { ScallopedPageTransition } from "@/components/ui/ScallopedPageTransition"

// Sidebar dimensions
const SIDEBAR_WIDTH_EXPANDED = '18rem'
const SIDEBAR_WIDTH_COLLAPSED = '5rem'
const SIDEBAR_MOBILE_WIDTH = '0'

export function DashboardClientLayout({
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
    const inactivityConfig = useMemo(() => ({
        timeoutMinutes: 30,
        warningMinutes: 2,
        onLogout: logout,
        enabled: !!user && !user.isAnonymous,
    }), [user, logout]);

    const { showWarning, secondsRemaining, extendSession } = useInactivityLogout(inactivityConfig);

    // Show loading state while initializing
    if (!isInitialized) {
        return <ScallopedPageTransition isNavigating />;
    }

    // Redirect fires via useEffect; show spinner while Firebase session restores
    // so there's never a blank flash between init and redirect
    if (!user) return <ScallopedPageTransition isNavigating />;

    return (
        <SidebarProvider>
            <MobileSwipeLayout>
                <DashboardContent
                    showWarning={showWarning}
                    secondsRemaining={secondsRemaining}
                    extendSession={extendSession}
                    logout={logout}
                >
                    {children}
                </DashboardContent>
            </MobileSwipeLayout>
            <OnboardingTour />
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
    const { isMobile } = useSidebar()

    // Calculate margin based on sidebar state
    // Desktop: Expanded vs Collapsed
    // Mobile: Always '4rem' (Rail width) because expansion is Overlay
    return (
        <>
            <div className="flex h-dvh min-h-[100dvh] supports-[height:100dvh]:h-[100dvh] w-full bg-luxury-bg text-luxury-text overflow-hidden relative">
                {/* Desktop Sidebar (AppSidebar handles its own responsive visibility) */}
                <AppSidebar />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 relative w-full overflow-hidden">
                    <DashboardHeader />
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative pb-[env(safe-area-inset-bottom)]">
                        {children}
                    </div>

                    {/* GLOBAL FLOATING CHAT REMOVED per user request */}
                    {/* <ChatWidget variant="floating" /> */}
                </div>
            </div>

            {/* Inactivity Warning Dialog */}
            <InactivityWarningDialog
                open={showWarning}
                secondsRemaining={secondsRemaining}
                onExtend={extendSession}
                onLogout={logout}
            />
        </>
    )
}
