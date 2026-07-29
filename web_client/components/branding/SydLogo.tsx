'use client';

export function SydLogo({ className = "" }: { className?: string, showSubtitle?: boolean }) {
    return (
        <div className={`flex items-center gap-3 ${className}`}>
            {/* Metallic Bars with clean look */}
            <div className="flex flex-col gap-0.5">
                <div className="h-1 w-9 rounded-sm bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300" />
                <div className="h-1 w-9 rounded-sm bg-gradient-to-r from-gray-400 via-gray-500 to-gray-400" />
                <div className="h-1 w-9 rounded-sm bg-gradient-to-r from-gray-600 via-gray-700 to-gray-600" />
                <div className="h-1 w-9 rounded-sm bg-gradient-to-r from-black via-gray-900 to-black" />
            </div>

            {/* Text clean. Not an <h1>: this renders inside a home link in the Navbar,
                Footer and dashboard header on every page — a heading here would give
                each page 2-3 <h1>s (one per place this component mounts) on top of
                the page's own content heading, which is what a screen reader or
                crawler should treat as the actual page title. */}
            <div className="flex flex-col">
                <p className="text-2xl font-bold leading-none tracking-tight font-trajan whitespace-nowrap">
                    <span className="text-luxury-gold">
                        SYD BIOEDILIZIA
                    </span>
                </p>
            </div>
        </div>
    );
}
