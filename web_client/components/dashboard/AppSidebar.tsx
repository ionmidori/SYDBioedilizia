'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import NextImage from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Home,
    FolderKanban,
    Settings,
    LogOut,
    FileText,
    Globe,
    MessageSquare,
    Sliders,
    X,
    ChevronLeft,
    ChevronRight,
    Menu,
    User as UserIcon,
    LayoutGrid,
    type LucideIcon
} from 'lucide-react'

import { useSidebar } from '@/components/dashboard/SidebarProvider'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { SydLogo } from '@/components/branding/SydLogo'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface NavItemProps {
    href: string
    icon: LucideIcon
    label: string
    active?: boolean
    className?: string
    onClick?: (e?: React.MouseEvent) => void
    collapsed?: boolean
}

interface UserBadgeProps {
    user: any
    collapsed?: boolean
}

// ============================================================================
// MEMOIZED SUB-COMPONENTS
// ============================================================================

const NavItem = React.memo<NavItemProps>(function NavItem({
    href,
    icon: Icon,
    label,
    active,
    className,
    onClick,
    collapsed = false
}) {
    const content = (
        <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer relative overflow-hidden",
            collapsed ? "justify-center" : "",
            active
                ? "bg-luxury-gold text-luxury-bg shadow-md"
                : "text-luxury-text/60 hover:text-luxury-text hover:bg-white/5",
            className
        )}
            title={collapsed ? label : undefined}
        >
            <div className={cn(
                "p-2 rounded-lg transition-colors duration-200",
                active
                    ? "bg-luxury-bg/10"
                    : "bg-white/5 group-hover:bg-luxury-gold/10 group-hover:text-luxury-gold"
            )}>
                <Icon className={cn("w-5 h-5", active ? "text-luxury-bg" : "group-hover:text-luxury-gold")} />
            </div>

            {!collapsed && (
                <span className="font-medium text-sm tracking-tight relative z-10">
                    {label}
                </span>
            )}
        </div>
    )

    // Render as Link if it's a real navigation path
    if (href && href !== '#') {
        return (
            <Link
                href={href}
                className="w-full block"
                prefetch={true}
                onClick={onClick} // Pass onClick to Link to allow side-effects (like closing menu)
            >
                {content}
            </Link>
        )
    }

    // Render as div/button for actions (like Logout)
    return (
        <div onClick={onClick} className="w-full" role="button" tabIndex={0}>
            {content}
        </div>
    )
})

const UserBadge = React.memo<UserBadgeProps>(function UserBadge({ user, collapsed = false }) {
    const initials = React.useMemo(() => {
        if (user.displayName) {
            return user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
        }
        return user.email ? user.email[0].toUpperCase() : 'U'
    }, [user.displayName, user.email])

    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-[1.25rem] glass-premium border-luxury-gold/10 mb-1 transition-all hover:border-luxury-gold/30 hover:bg-white/5 group select-none relative overflow-hidden shadow-xl",
            collapsed && "justify-center p-2 rounded-xl"
        )}>
            <div className="absolute inset-0 bg-gradient-to-tr from-luxury-gold/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative shrink-0 z-10">
                <div className="relative">
                    {user.photoURL ? (
                        <NextImage
                            src={user.photoURL}
                            alt={user.displayName || 'User'}
                            width={40}
                            height={40}
                            className="rounded-full border-2 border-luxury-gold/20 shadow-lg"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full border-2 border-luxury-gold/30 bg-luxury-gold/10 flex items-center justify-center text-luxury-gold font-black text-sm shadow-lg">
                            {initials}
                        </div>
                    )}
                </div>
            </div>

            {!collapsed && (
                <div className="flex-1 min-w-0 relative z-10">
                    <p className="text-sm font-bold text-luxury-text truncate leading-tight">
                        {user.displayName || 'Anonymous User'}
                    </p>
                    <p className="text-xs text-luxury-text/50 truncate leading-tight mt-0.5">
                        {user.email || 'No email'}
                    </p>
                </div>
            )}
        </div>
    )
})

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AppSidebar({ className, ...props }: React.ComponentProps<'div'>) {
    const pathname = usePathname()
    const router = useRouter()
    const { logout, user } = useAuth()
    const { state, open, toggleSidebar, isMobile, openMobile, setOpenMobile } = useSidebar()

    const [projectsExpanded, setProjectsExpanded] = React.useState(false)

    // ========================================================================
    // SWIPE HANDLERS
    // ========================================================================
    const [touchStart, setTouchStart] = React.useState<number | null>(null)
    const [touchStartY, setTouchStartY] = React.useState<number | null>(null)
    const [touchEnd, setTouchEnd] = React.useState<number | null>(null)
    const minSwipeDistance = 50

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null)
        setTouchStart(e.targetTouches[0].clientX)
        setTouchStartY(e.targetTouches[0].clientY)
    }

    const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX)

    const onTouchEnd = (e: React.TouchEvent) => {
        if (!touchStart || !touchEnd || !touchStartY) return

        const distance = touchStart - touchEnd
        const yDistance = touchStartY - e.changedTouches[0].clientY

        // Directional Locking: Ensure mostly horizontal movement
        // If vertical movement is greater than horizontal, ignore (it's a scroll)
        if (Math.abs(distance) < Math.abs(yDistance)) return

        const isLeftSwipe = distance > minSwipeDistance
        const isRightSwipe = distance < -minSwipeDistance

        // Swipe Right (negative distance) -> Close Sidebar
        if (isRightSwipe && openMobile) {
            setOpenMobile(false)
        }
        // Swipe Left (positive distance) -> Open Sidebar
        if (isLeftSwipe && !openMobile) {
            setOpenMobile(true)
        }
    }

    // ========================================================================
    // MEMOIZED CALCULATIONS
    // ========================================================================

    const SYSTEM_ROUTES = ['projects', 'settings', 'profile', 'notifications', 'gallery']

    const isInProject = React.useMemo(() => {
        const segments = pathname.split('/')
        if (segments.length < 3) return false
        const potentialProjectId = segments[2]
        return !SYSTEM_ROUTES.includes(potentialProjectId)
    }, [pathname])

    const currentProjectId = React.useMemo(
        () => isInProject ? pathname.split('/')[2] : null,
        [isInProject, pathname]
    )

    React.useEffect(() => {
        if (isInProject) {
            setProjectsExpanded(true)
        }
    }, [isInProject])

    const navItems = React.useMemo(() => [
        { href: '/dashboard', label: 'Dashboard', icon: Home },
        { href: '/dashboard/gallery', label: 'Galleria Globale', icon: LayoutGrid },
        { href: '/dashboard/projects', label: 'I Miei Progetti', icon: FolderKanban },
    ], [])

    const projectSubItems = React.useMemo(() =>
        currentProjectId ? [
            { href: `/dashboard/${currentProjectId}`, label: 'Cantiere AI', icon: MessageSquare },
            { href: `/dashboard/${currentProjectId}/files`, label: 'Galleria & File', icon: FileText },
            { href: `/dashboard/${currentProjectId}/settings`, label: 'Parametri Cantiere', icon: Sliders },
        ] : []
        , [currentProjectId])

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    const handleLogout = React.useCallback(async () => {
        try {
            await logout()
            router.push('/')
        } catch (error) {
            console.error('Logout failed:', error)
        }
    }, [logout, router])

    const handleProjectsClick = React.useCallback((e?: React.MouseEvent) => {
        // Handle desktop expand: if closed, open sidebar and allow navigation to proceed
        // The user wants to go to "I Miei Progetti" main page, so we don't preventDefault.
        if (!isMobile && !open) {
            toggleSidebar()
            setProjectsExpanded(true)
            // We allow the event to propagate so Link handles the navigation
        }

        // We removed the manual toggle logic (setProjectsExpanded(!projectsExpanded))
        // because the user explicitly wants to Navigate to the parent route, not just collapse the menu.
    }, [isMobile, open, toggleSidebar])

    const handleNavClick = React.useCallback(() => {
        // Close mobile sidebar on navigation for better UX
        if (isMobile) {
            setOpenMobile(false)
        }
    }, [isMobile, setOpenMobile])

    if (!user) return null

    // ========================================================================
    // RENDER LOGIC
    // ========================================================================

    // Mobile:
    // - Sidebar is OFF-CANVAS (Right) by default.
    // - Triggered by FAB.
    // - openMobile means "Visible".
    // Desktop:
    // - Sidebar is Persistent (Left).
    // - isCollapsed based on open state.

    // We treat Desktop and Mobile fundamentally differently now.

    const isDesktopCollapsed = !open
    const isMobileVisible = isMobile && openMobile

    // ========================================================================
    // MOBILE FAB PERSISTENCE
    // ========================================================================
    const [fabY, setFabY] = React.useState(0)

    React.useEffect(() => {
        const savedY = localStorage.getItem('sidebar-fab-y')
        if (savedY) {
            setFabY(parseFloat(savedY))
        }
    }, [])

    const handleDragEnd = (_: any, info: any) => {
        const newY = fabY + info.offset.y
        setFabY(newY)
        localStorage.setItem('sidebar-fab-y', newY.toString())
    }

    return (
        <>
            {/* ============================================================ */}
            {/* MOBILE FLOATING ACTION BUTTON (FAB) */}
            {/* ============================================================ */}
            {isMobile && !openMobile && (
                <motion.button
                    drag="y"
                    dragMomentum={false}
                    // Initialize with persisted Y
                    initial={{ y: fabY }}
                    animate={{ y: fabY }}
                    onDragEnd={handleDragEnd}
                    whileDrag={{ scale: 1.1 }}
                    dragConstraints={{ top: -500, bottom: 150 }} // Allow more drag Up than Down since we start low
                    onClick={() => setOpenMobile(true)}
                    // Tab Style: Half-Circle on Right Edge, starting at 3/4 height
                    className="fixed right-0 top-3/4 z-[90] flex items-center justify-center pl-4 pr-1.5 py-4 bg-luxury-gold text-luxury-bg shadow-2xl rounded-l-2xl border-y border-l border-white/10 touch-none cursor-grab active:cursor-grabbing hover:bg-luxury-gold/90 transition-colors"
                    style={{ marginTop: '-2rem' }} // Center adjustment
                    aria-label="Open Menu"
                >
                    <Menu className="w-6 h-6" />
                </motion.button>
            )}

            {/* ============================================================ */}
            {/* MOBILE OVERLAY */}
            {/* ============================================================ */}
            {isMobile && openMobile && (
                <div
                    className="fixed inset-0 z-[99] bg-black/20"
                    onClick={() => setOpenMobile(false)} // Clicking backdrop closes
                    aria-hidden="true"
                />
            )}

            {/* ============================================================ */}
            {/* SWIPE EDGE TRIGGER (Open from Right Edge) */}
            {/* ============================================================ */}
            {isMobile && !openMobile && (
                <div
                    className="fixed inset-y-0 right-0 w-8 z-[85]"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                />
            )}

            {/* ============================================================ */}
            {/* SIDEBAR CONTAINER */}
            {/* ============================================================ */}
            <div
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onClick={(e) => e.stopPropagation()} // Prevent bubbles to overlay
                className={cn(
                    "group/sidebar peer text-sidebar-foreground transition-all duration-300 ease-in-out",
                    // Mobile: Fixed Right, Top, Bottom. Width 52 (reduced by ~30%). Slide in from Right.
                    // Desktop: Hidden on Mobile. Block on Desktop. Fixed Left.
                    isMobile
                        ? cn(
                            "fixed inset-y-0 right-0 !z-[100] w-52 bg-luxury-bg shadow-2xl border-l border-luxury-gold/10",
                            openMobile ? "translate-x-0" : "translate-x-full"
                        )
                        : cn(
                            "hidden md:flex flex-col shrink-0 h-full border-r border-luxury-gold/5 bg-luxury-bg text-luxury-text shadow-xl z-30 transition-all duration-300",
                            open ? "w-72" : "w-20"
                        ),
                    className
                )}
                data-state={state}
                {...props}
            >
                <div className={cn(
                    "flex flex-col h-full",
                    // Mobile: Top alignment for User/Nav, Bottom for X?
                    isMobile ? "justify-start" : ""
                )}>

                    {/* ============================================================ */}
                    {/* MOBILE USER SECTION (TOP) */}
                    {/* ============================================================ */}
                    {isMobile && (
                        <div className="p-4 border-b border-luxury-gold/10 bg-luxury-bg/50 shrink-0">
                            <Link href="/dashboard/profile" className="block focus-visible:outline-none" onClick={() => setOpenMobile(false)}>
                                <UserBadge user={user} collapsed={false} />
                            </Link>
                            <div className="mt-4 flex flex-col gap-1.5">
                                <Link
                                    href="/"
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-luxury-text/60 hover:text-luxury-text hover:bg-white/5 transition-all text-xs font-medium border border-transparent hover:border-luxury-gold/10"
                                >
                                    <Globe className="w-4 h-4" />
                                    <span>Torna al Sito</span>
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-red-400/80 hover:text-red-400 hover:bg-red-500/5 transition-all text-xs font-medium w-full text-left border border-transparent hover:border-red-500/10"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span>Logout</span>
                                </button>
                            </div>
                        </div>
                    )}


                    {/* ============================================================ */}
                    {/* HEADER (Desktop Only) */}
                    {/* ============================================================ */}
                    {!isMobile && (
                        <div className={cn(
                            "h-20 flex items-center border-b border-luxury-gold/10 bg-luxury-bg/50 relative overflow-hidden transition-all duration-300 shrink-0",
                            isDesktopCollapsed ? "justify-center px-0" : "justify-between pl-4 pr-3"
                        )}>
                            {!isDesktopCollapsed && (
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-luxury-gold/5 to-transparent pointer-events-none" />
                            )}

                            {/* Logo */}
                            {!isDesktopCollapsed && (
                                <Link href="/" className="group/logo relative z-10 transition-transform hover:scale-105 active:scale-95 duration-200">
                                    <SydLogo className="h-6 w-auto origin-left opacity-90 group-hover:opacity-100 transition-opacity" showSubtitle={false} />
                                </Link>
                            )}
                            {isDesktopCollapsed && (
                                <Link href="/" className="relative z-10 group/logo mb-2">
                                    <div className="w-8 h-8 rounded bg-luxury-gold/10 flex items-center justify-center border border-luxury-gold/20 group-hover/logo:border-luxury-gold/50 transition-colors">
                                        <span className="font-bold text-luxury-gold text-xs font-trajan">SYD</span>
                                    </div>
                                </Link>
                            )}

                            {/* Desktop Toggle */}
                            <button
                                onClick={toggleSidebar}
                                className={cn(
                                    "relative z-10 p-2 rounded-lg bg-white/5 hover:bg-luxury-gold/20 border border-luxury-gold/20 hover:border-luxury-gold/50 transition-all",
                                    isDesktopCollapsed ? "mb-2" : ""
                                )}
                                aria-label={isDesktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                            >
                                {isDesktopCollapsed ? (
                                    <ChevronRight className="w-4 h-4 text-luxury-gold" />
                                ) : (
                                    <ChevronLeft className="w-5 h-5 text-luxury-gold" />
                                )}
                            </button>
                        </div>
                    )}

                    {/* Mobile Close Button (Bottom Right) */}
                    {isMobile && (
                        <div className="absolute bottom-6 right-6 z-[110]">
                            <button
                                onClick={() => setOpenMobile(false)}
                                className="p-3 rounded-full bg-black/50 border border-luxury-gold/20 text-white hover:bg-black/70 active:scale-95 transition-all shadow-xl backdrop-blur-sm"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    )}

                    {/* SPACER for Mobile Bottom Alignment: Pushes Nav down, but allows it to grow up */}
                    {isMobile && <div className="flex-1 min-h-[2rem]" />}


                    {/* ============================================================ */}
                    {/* NAVIGATION */}
                    {/* ============================================================ */}
                    <div className={cn(
                        "overflow-y-auto overflow-x-hidden space-y-2 custom-scrollbar transition-all duration-300 flex flex-col shrink-0",
                        isDesktopCollapsed && !isMobile ? "py-4 px-2" : "py-8 px-4",
                        // Mobile: Huge padding bottom to clear FAB and Thumb zone
                        isMobile ? "pb-48 pt-4 justify-end" : "flex-1"
                    )}>
                        {navItems.map((item) => (
                            <div key={item.href}>
                                {item.href === '/dashboard/projects' ? (
                                    <>
                                        {/* Projects Item */}
                                        <NavItem
                                            {...item}
                                            active={pathname === item.href}
                                            collapsed={!isMobile && isDesktopCollapsed}
                                            onClick={handleProjectsClick}
                                            className="w-full"
                                        />

                                        {/* Project Submenu */}
                                        {(projectsExpanded && projectSubItems.length > 0) && (
                                            <div
                                                className="ml-3 mt-2 space-y-1 border-l-2 border-luxury-gold/20 pl-3 relative z-10"
                                            >
                                                {projectSubItems.map((subItem) => (
                                                    <NavItem
                                                        key={subItem.href}
                                                        {...subItem}
                                                        active={pathname === subItem.href}
                                                        collapsed={false}
                                                        onClick={handleNavClick}
                                                        className="text-xs"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <NavItem
                                        {...item}
                                        active={pathname === item.href}
                                        collapsed={!isMobile && isDesktopCollapsed}
                                        onClick={handleNavClick}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ============================================================ */}
                    {/* FOOTER (Desktop Only now) */}
                    {/* ============================================================ */}
                    {!isMobile && (
                        <div className={cn(
                            "p-4 border-t border-luxury-gold/10 bg-luxury-bg/50 relative overflow-hidden shrink-0",
                            isDesktopCollapsed ? "flex justify-center" : ""
                        )}>
                            <div className="relative z-10 w-full space-y-3">
                                <Link
                                    href="/dashboard/profile"
                                    className="block group/profile focus-visible:outline-none"
                                >
                                    <UserBadge user={user} collapsed={isDesktopCollapsed} />
                                </Link>

                                <div className={cn(
                                    "mt-2",
                                    isDesktopCollapsed ? "flex flex-col gap-2 items-center" : "flex flex-col gap-1.5"
                                )}>
                                    <Link
                                        href="/"
                                        className={cn(
                                            "rounded-lg transition-all font-medium border border-transparent",
                                            isDesktopCollapsed
                                                ? "p-2 bg-white/5 hover:bg-luxury-gold/20 text-luxury-text/70 hover:text-luxury-gold hover:border-luxury-gold/20"
                                                : "flex items-center justify-start gap-3 px-3 py-1.5 bg-white/5 hover:bg-luxury-gold/10 text-luxury-text/70 hover:text-luxury-gold text-xs hover:border-luxury-gold/20"
                                        )}
                                        title="Torna al sito"
                                    >
                                        <Globe className={isDesktopCollapsed ? "w-4 h-4" : "w-3.5 h-3.5"} />
                                        {!isDesktopCollapsed && <span>Torna al Sito</span>}
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className={cn(
                                            "rounded-lg transition-all font-medium border border-transparent",
                                            isDesktopCollapsed
                                                ? "p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/20"
                                                : "flex items-center justify-start gap-3 px-3 py-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-xs w-full text-left hover:border-red-500/20"
                                        )}
                                        title="Logout"
                                    >
                                        <LogOut className={isDesktopCollapsed ? "w-4 h-4" : "w-3.5 h-3.5"} />
                                        {!isDesktopCollapsed && <span>Logout</span>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </>
    )
}
