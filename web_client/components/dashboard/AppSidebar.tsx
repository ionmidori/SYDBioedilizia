'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import NextImage from 'next/image'
import { motion } from 'framer-motion'
import {
    Home,
    FolderKanban,
    LogOut,
    FileText,
    Globe,
    MessageSquare,
    Sliders,
    X,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    type LucideIcon
} from 'lucide-react'

import { useSidebar } from '@/components/dashboard/SidebarProvider'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

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

    if (href && href !== '#') {
        return (
            <Link
                href={href}
                className="w-full block"
                prefetch={true}
                onClick={onClick}
            >
                {content}
            </Link>
        )
    }

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
                    <p className="text-sm font-bold font-trajan text-luxury-text truncate leading-tight">
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
        { href: '/dashboard', label: 'Bacheca', icon: Home },
        { href: '/dashboard/gallery', label: 'Galleria', icon: LayoutGrid },
        { href: '/dashboard/projects', label: 'Progetti', icon: FolderKanban },
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
        if (!isMobile && !open) {
            toggleSidebar()
            setProjectsExpanded(true)
        }
    }, [isMobile, open, toggleSidebar])

    const handleNavClick = React.useCallback(() => {
        if (isMobile) {
            setOpenMobile(false)
        }
    }, [isMobile, setOpenMobile])

    if (!user) return null

    // ========================================================================
    // RENDER LOGIC
    // ========================================================================

    const isDesktopCollapsed = !open
    const isMobileVisible = isMobile && openMobile

    // ========================================================================
    // NOTCH DRAG PERSISTENCE (replaces FAB)
    // ========================================================================
    const [notchY, setNotchY] = React.useState(0)

    React.useEffect(() => {
        const savedY = localStorage.getItem('sidebar-fab-y')
        if (savedY) {
            setNotchY(parseFloat(savedY))
        }
    }, [])

    const handleDragEnd = (_: any, info: any) => {
        const newY = notchY + info.offset.y
        setNotchY(newY)
        localStorage.setItem('sidebar-fab-y', newY.toString())
    }

    // ========================================================================
    // USER HUB SECTION (shared between desktop and mobile)
    // ========================================================================
    const renderUserHub = (collapsed: boolean) => (
        <div className={cn(
            "border-b border-luxury-gold/10 bg-luxury-bg/50 relative overflow-hidden shrink-0",
            collapsed ? "p-2 flex flex-col items-center gap-2" : "p-4"
        )}>
            {!collapsed && (
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-luxury-gold/5 to-transparent pointer-events-none" />
            )}

            <div className="relative z-10 w-full">
                <Link
                    href="/dashboard/profile"
                    className="block group/profile focus-visible:outline-none"
                    onClick={isMobile ? () => setOpenMobile(false) : undefined}
                >
                    <UserBadge user={user} collapsed={collapsed} />
                </Link>

                <div className={cn(
                    "mt-3",
                    collapsed ? "flex flex-col gap-2 items-center" : "flex items-center gap-2"
                )}>
                    <Link
                        href="/"
                        className={cn(
                            "rounded-lg transition-all font-medium border border-transparent",
                            collapsed
                                ? "p-2 bg-white/5 hover:bg-luxury-gold/20 text-luxury-text/70 hover:text-luxury-gold hover:border-luxury-gold/20"
                                : "flex items-center justify-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-luxury-gold/10 text-luxury-text/70 hover:text-luxury-gold text-xs hover:border-luxury-gold/20 flex-1"
                        )}
                        title="Torna al sito"
                    >
                        <Globe className={collapsed ? "w-4 h-4" : "w-3.5 h-3.5"} />
                        {!collapsed && <span>Home</span>}
                    </Link>
                    <button
                        onClick={handleLogout}
                        className={cn(
                            "rounded-lg transition-all font-medium border border-transparent",
                            collapsed
                                ? "p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/20"
                                : "flex items-center justify-center gap-2 px-3 py-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-xs hover:border-red-500/20 flex-1"
                        )}
                        title="Logout"
                    >
                        <LogOut className={collapsed ? "w-4 h-4" : "w-3.5 h-3.5"} />
                        {!collapsed && <span>Logout</span>}
                    </button>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {/* ============================================================ */}
            {/* MOBILE NOTCH (replaces FAB) */}
            {/* ============================================================ */}
            {isMobile && !openMobile && (
                <motion.button
                    drag="y"
                    dragMomentum={false}
                    initial={{ y: notchY }}
                    animate={{ y: notchY }}
                    onDragEnd={handleDragEnd}
                    whileDrag={{ scale: 1.1 }}
                    dragConstraints={{ top: -500, bottom: 150 }}
                    onClick={() => setOpenMobile(true)}
                    className="fixed right-0 top-3/4 z-[90] notch-draggable flex items-center justify-center w-6 h-12 bg-luxury-gold text-luxury-bg shadow-2xl rounded-l-xl border-y border-l border-white/10 cursor-grab active:cursor-grabbing hover:w-7 transition-[width]"
                    style={{ marginTop: '-1.5rem' }}
                    aria-label="Toggle sidebar"
                    tabIndex={0}
                    role="button"
                >
                    <ChevronLeft className="w-4 h-4" />
                </motion.button>
            )}

            {/* ============================================================ */}
            {/* MOBILE OVERLAY */}
            {/* ============================================================ */}
            {isMobile && openMobile && (
                <div
                    className="fixed inset-0 z-[99] bg-black/20"
                    onClick={() => setOpenMobile(false)}
                    aria-hidden="true"
                />
            )}

            {/* ============================================================ */}
            {/* SIDEBAR CONTAINER */}
            {/* ============================================================ */}
            <div
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    "group/sidebar peer text-sidebar-foreground transition-all duration-300 ease-in-out",
                    isMobile
                        ? cn(
                            "fixed inset-y-0 right-0 !z-[100] w-52 bg-luxury-bg shadow-2xl border-l border-luxury-gold/10",
                            openMobile ? "translate-x-0" : "translate-x-full"
                        )
                        : cn(
                            "hidden md:flex flex-col shrink-0 h-full glass-sidebar text-luxury-text shadow-xl z-30 transition-all duration-300 relative",
                            open ? "w-72" : "w-20"
                        ),
                    className
                )}
                data-state={state}
                {...props}
            >
                {/* Desktop Notch (protruding from sidebar edge) */}
                {!isMobile && (
                    <button
                        onClick={toggleSidebar}
                        className="notch-trigger notch-draggable"
                        aria-label={isDesktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        tabIndex={0}
                    >
                        {isDesktopCollapsed ? (
                            <ChevronRight className="w-3 h-3 text-luxury-bg" />
                        ) : (
                            <ChevronLeft className="w-3 h-3 text-luxury-bg" />
                        )}
                    </button>
                )}

                <div className={cn(
                    "flex flex-col h-full",
                    isMobile ? "justify-start" : ""
                )}>

                    {/* ============================================================ */}
                    {/* USER HUB (Top - both mobile and desktop) */}
                    {/* ============================================================ */}
                    {renderUserHub(isMobile ? false : isDesktopCollapsed)}

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

                    {/* SPACER for Mobile Bottom Alignment */}
                    {isMobile && <div className="flex-1 min-h-[2rem]" />}

                    {/* ============================================================ */}
                    {/* NAVIGATION */}
                    {/* ============================================================ */}
                    <div className={cn(
                        "overflow-y-auto overflow-x-hidden space-y-2 custom-scrollbar transition-all duration-300 flex flex-col shrink-0",
                        isDesktopCollapsed && !isMobile ? "py-4 px-2" : "py-8 px-4",
                        isMobile ? "pb-48 pt-4 justify-end" : "flex-1"
                    )}>
                        {navItems.map((item) => (
                            <div key={item.href}>
                                {item.href === '/dashboard/projects' ? (
                                    <>
                                        <NavItem
                                            {...item}
                                            active={pathname === item.href}
                                            collapsed={!isMobile && isDesktopCollapsed}
                                            onClick={handleProjectsClick}
                                            className="w-full"
                                        />

                                        {/* Active Project Context */}
                                        {projectSubItems.length > 0 && (
                                            <div className="mt-3 space-y-1 relative z-10">
                                                {/* CANTIERE ATTIVO Header */}
                                                {(!isDesktopCollapsed || isMobile) && (
                                                    <span className="text-[10px] uppercase tracking-widest text-luxury-gold/60 font-bold px-3 block mb-2">
                                                        Cantiere Attivo
                                                    </span>
                                                )}
                                                <div className="ml-3 space-y-1 pl-3">
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

                </div>
            </div>
        </>
    )
}
