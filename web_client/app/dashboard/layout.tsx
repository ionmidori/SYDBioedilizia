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
import { MobileSwipeLayout } from "@/components/mobile/MobileSwipeLayout"
import { OnboardingTour } from "@/components/dashboard/OnboardingTour"
import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { createFadeSlideVariants } from "@/lib/m3-motion"

// Sidebar dimensions
const SIDEBAR_WIDTH_EXPANDED = '18rem'
const SIDEBAR_WIDTH_COLLAPSED = '5rem'
const SIDEBAR_MOBILE_WIDTH = '0'

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
            <div className="h-[100dvh] supports-[height:100dvh]:h-[100dvh] w-full flex items-center justify-center bg-luxury-bg">
                <Loader2 className="w-10 h-10 text-luxury-gold animate-spin" />
            </div>
        );
    }

    if (!user) return null;

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

const pageVariants = createFadeSlideVariants()

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
    const pathname = usePathname()

    // Calculate margin based on sidebar state
    // Desktop: Expanded vs Collapsed
    // Mobile: Always '4rem' (Rail width) because expansion is Overlay
    return (
        <>
            <div className="flex h-screen min-h-[100dvh] supports-[height:100dvh]:min-h-[100dvh] w-full bg-luxury-bg text-luxury-text overflow-hidden relative">
                {/* Desktop Sidebar (Hidden on Mobile) */}
                {/* Desktop Sidebar (AppSidebar handles its own responsive visibility) */}
                <AppSidebar />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 relative w-full overflow-hidden">
                    <DashboardHeader />
                    <div className="flex-1 overflow-y-auto overflow-x-hidden relative pb-[env(safe-area-inset-bottom)]">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={pathname}
                                variants={pageVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                className="min-h-full h-full"
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
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
