"use client"

import * as React from "react"

const SIDEBAR_COOKIE_NAME = "sidebar:state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "18rem"
const SIDEBAR_WIDTH_ICON = "5rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContext = {
    state: "expanded" | "collapsed"
    open: boolean
    setOpen: (open: boolean) => void
    openMobile: boolean
    setOpenMobile: (open: boolean) => void
    isMobile: boolean
    toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

function useSidebar() {
    const context = React.useContext(SidebarContext)
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider.")
    }
    return context
}

const SidebarProvider = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div"> & {
        defaultOpen?: boolean
        open?: boolean
        onOpenChange?: (open: boolean) => void
    }
>(
    (
        {
            defaultOpen = true,
            open: openProp,
            onOpenChange: setOpenProp,
            className,
            style,
            children,
            ...props
        },
        ref
    ) => {
        const [isMobile, setIsMobile] = React.useState(false)
        const [openMobile, setOpenMobile] = React.useState(false)

        // Detect mobile on mount and resize
        React.useEffect(() => {
            const checkMobile = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches)
            checkMobile()
            window.addEventListener("resize", checkMobile)
            return () => window.removeEventListener("resize", checkMobile)
        }, [])

        // This is the internal state of the sidebar.
        // We use openProp and setOpenProp for control from outside the component.
        const [_open, _setOpen] = React.useState(defaultOpen)
        const open = openProp ?? _open
        const setOpen = React.useCallback(
            (value: boolean | ((value: boolean) => boolean)) => {
                const openState = typeof value === "function" ? value(open) : value
                if (setOpenProp) {
                    setOpenProp(openState)
                } else {
                    _setOpen(openState)
                }
            },
            [setOpenProp, open]
        )

        // NON-BLOCKING PERSISTENCE
        // Update cookie in useEffect to avoid blocking the main thread during UI interactions
        React.useEffect(() => {
            const openState = open
            document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
        }, [open])

        // Helper to toggle the sidebar.
        const toggleSidebar = React.useCallback(() => {
            return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
        }, [isMobile, setOpen, setOpenMobile])

        // Keyboard shortcut.
        React.useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (
                    event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
                    (event.metaKey || event.ctrlKey)
                ) {
                    event.preventDefault()
                    toggleSidebar()
                }
            }

            window.addEventListener("keydown", handleKeyDown)
            return () => window.removeEventListener("keydown", handleKeyDown)
        }, [toggleSidebar])

        // We add a state to so that we can do data-state="expanded" or "collapsed".
        // This makes it easier to style the sidebar with Tailwind classes.
        const state = open ? "expanded" : "collapsed"

        const contextValue = React.useMemo<SidebarContext>(
            () => ({
                state,
                open,
                setOpen,
                isMobile,
                openMobile,
                setOpenMobile,
                toggleSidebar,
            }),
            [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
        )

        return (
            <SidebarContext.Provider value={contextValue}>
                <div
                    style={
                        {
                            "--sidebar-width": SIDEBAR_WIDTH,
                            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                            ...style,
                        } as React.CSSProperties
                    }
                    className={`group/sidebar-wrapper flex h-full min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar ${className}`}
                    ref={ref}
                    {...props}
                >
                    {children}
                </div>
            </SidebarContext.Provider>
        )
    }
)
SidebarProvider.displayName = "SidebarProvider"

export { SidebarProvider, useSidebar, SidebarContext }
