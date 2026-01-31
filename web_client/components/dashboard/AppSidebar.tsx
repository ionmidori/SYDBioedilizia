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
    onClick?: () => void
    collapsed?: boolean
}

interface UserBadgeProps {
    user: any
    collapsed?: boolean
}

// ============================================================================
// MEMOIZED SUB-COMPONENTS
// ============================================================================

/**
 * NavItem - Memoized navigation item component
 * Displays icon-only when collapsed, icon + label when expanded
 */
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
                <>
                    <span className="font-medium text-sm tracking-tight relative z-10">
                        {label}
                    </span>
                </>
            )}
        </div>
    )

    if (onClick) {
        return (
            <div onClick={onClick} className="w-full">
                {content}
            </div>
        )
    }

    return (
        <Link href={href} className="w-full block" prefetch={true}>
            {content}
        </Link>
    )
})

/**
 * UserBadge - Memoized user profile badge
 * Shows avatar/initials + name when expanded, just avatar when collapsed
 */
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
            collapsed && "justify-center"
        )}>
            {/* Cinematic Background Wash */}
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
    // MEMOIZED CALCULATIONS
    // ========================================================================

    // System routes that are NOT project pages
    const SYSTEM_ROUTES = ['projects', 'settings', 'profile', 'notifications', 'gallery']

    const isInProject = React.useMemo(() => {
        const segments = pathname.split('/')
        // Must have at least 3 segments: ['', 'dashboard', 'projectId']
        if (segments.length < 3) return false
        // The third segment must NOT be a system route
        const potentialProjectId = segments[2]
        return !SYSTEM_ROUTES.includes(potentialProjectId)
    }, [pathname])

    const currentProjectId = React.useMemo(
        () => isInProject ? pathname.split('/')[2] : null,
        [isInProject, pathname]
    )

    // Auto-expand project submenu only when in project context
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

    const handleProjectsClick = React.useCallback(() => {
        if (isInProject) {
            setProjectsExpanded(!projectsExpanded)
        } else {
            router.push('/dashboard/projects')
        }
    }, [isInProject, projectsExpanded, router])

    // ========================================================================
    // EARLY RETURN
    // ========================================================================

    if (!user) return null

    // ========================================================================
    // RENDER
    // ========================================================================

    const isCollapsed = !isMobile && !open

    return (
        <>
            {/* Mobile Overlay */}
            {isMobile && openMobile && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                    onClick={() => setOpenMobile(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar Container */}
            <div
                className={cn(
                    "group/sidebar peer text-sidebar-foreground transition-all duration-300 ease-in-out",
                    isMobile ? "fixed inset-y-0 left-0 z-50" : "hidden md:block",
                    isMobile
                        ? openMobile ? "translate-x-0" : "-translate-x-full"
                        : open ? "w-72" : "w-20",
                    className
                )}
                data-state={state}
                {...props}
            >
                <div className={cn(
                    "fixed inset-y-0 left-0 z-10 border-r border-luxury-gold/5 bg-luxury-bg text-luxury-text flex flex-col shadow-2xl transition-all duration-300",
                    isMobile ? "w-72" : open ? "w-72" : "w-20"
                )}>

                    {/* ============================================================ */}
                    {/* HEADER */}
                    {/* ============================================================ */}
                    <div className="h-20 flex items-center justify-between pl-4 pr-3 border-b border-luxury-gold/10 bg-luxury-bg/50 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-luxury-gold/5 to-transparent pointer-events-none" />

                        {/* Logo */}
                        {(open || isMobile) ? (
                            <Link href="/" className="group/logo relative z-10 transition-transform hover:scale-105 active:scale-95 duration-200">
                                <SydLogo className="scale-[0.9] origin-left group-hover/logo:opacity-90 transition-opacity" showSubtitle={false} />
                            </Link>
                        ) : (
                            <Link href="/" className="group/logo relative z-10" title="SYD BIOEDILIZIA">
                                {/* Metallic Bars - Compact Version */}
                                <div className="flex flex-col gap-0.5">
                                    <div className="h-1 w-10 rounded-sm bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300" />
                                    <div className="h-1 w-10 rounded-sm bg-gradient-to-r from-gray-400 via-gray-500 to-gray-400" />
                                    <div className="h-1 w-10 rounded-sm bg-gradient-to-r from-gray-600 via-gray-700 to-gray-600" />
                                    <div className="h-1 w-10 rounded-sm bg-gradient-to-r from-black via-gray-900 to-black" />
                                </div>
                            </Link>
                        )}

                        {/* Toggle/Close Button */}
                        {isMobile ? (
                            <button
                                onClick={() => setOpenMobile(false)}
                                className="relative z-10 p-2 rounded-lg hover:bg-white/5 transition-colors"
                                aria-label="Close sidebar"
                            >
                                <X className="w-5 h-5 text-luxury-text/60" />
                            </button>
                        ) : (
                            <button
                                onClick={toggleSidebar}
                                className="relative z-10 p-2 rounded-lg bg-white/5 hover:bg-luxury-gold/20 border border-luxury-gold/20 hover:border-luxury-gold/50 transition-all"
                                aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
                            >
                                {open ? (
                                    <ChevronLeft className="w-5 h-5 text-luxury-gold" />
                                ) : (
                                    <ChevronRight className="w-5 h-5 text-luxury-gold" />
                                )}
                            </button>
                        )}
                    </div>

                    {/* ============================================================ */}
                    {/* NAVIGATION */}
                    {/* ============================================================ */}
                    <div className="flex-1 overflow-auto py-8 px-4 space-y-2 custom-scrollbar">
                        {navItems.map((item) => (
                            <div key={item.href}>
                                {item.href === '/dashboard/projects' ? (
                                    <>
                                        <button
                                            onClick={handleProjectsClick}
                                            className="w-full"
                                        >
                                            <NavItem
                                                {...item}
                                                active={pathname === item.href}
                                                collapsed={isCollapsed}
                                            />
                                        </button>

                                        {/* Project Submenu - show ONLY when in project */}
                                        <AnimatePresence>
                                            {isInProject && projectsExpanded && !isCollapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                    className="overflow-hidden ml-3 mt-2 space-y-1 border-l-2 border-luxury-gold/20 pl-3"
                                                >
                                                    {projectSubItems.map((subItem) => (
                                                        <NavItem
                                                            key={subItem.href}
                                                            {...subItem}
                                                            active={pathname === subItem.href}
                                                            collapsed={false}
                                                            className="text-xs"
                                                        />
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </>
                                ) : (
                                    <NavItem
                                        {...item}
                                        active={pathname === item.href}
                                        collapsed={isCollapsed}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ============================================================ */}
                    {/* FOOTER */}
                    {/* ============================================================ */}
                    <div className="p-5 border-t border-luxury-gold/10 bg-luxury-bg/30 space-y-3 relative overflow-hidden">
                        {/* Atmospheric Footer Glow */}
                        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-luxury-gold/5 rounded-full blur-2xl pointer-events-none" />

                        {/* User Profile Badge - Links to Profile */}
                        <Link href="/dashboard/profile" className="block focus-visible:outline-none">
                            <UserBadge user={user} collapsed={isCollapsed} />
                        </Link>

                        {!isCollapsed && (
                            <div className="grid gap-2">
                                {/* Project Settings button removed from here */}
                                <NavItem
                                    href="/"
                                    label="Torna al Sito"
                                    icon={Globe}
                                    active={false}
                                    className="bg-white/5 border border-white/5 hover:border-luxury-gold/20 hover:bg-white/10 !py-2 !text-xs"
                                />
                                <NavItem
                                    href="#"
                                    label="Logout"
                                    icon={LogOut}
                                    active={false}
                                    onClick={handleLogout}
                                    className="bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 hover:border-red-500/30 text-red-100/60 hover:text-red-300 !py-2 !text-xs"
                                />
                            </div>
                        )}

                        {/* Collapsed Footer Buttons */}
                        {isCollapsed && (
                            <div className="flex flex-col gap-2 items-center">
                                {/* Project Settings button removed from footer as per user request */}
                                <button
                                    onClick={() => router.push('/')}
                                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                                    title="Torna al Sito"
                                >
                                    <Globe className="w-5 h-5 text-luxury-text/60" />
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5 text-red-100/60" />
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </>
    )
}
