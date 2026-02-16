"use client";
import React from 'react';

export function DebugLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="border-4 border-red-500 relative overflow-scroll w-full h-full">
            <div className="absolute top-0 left-0 bg-red-500 text-white text-xs px-2 z-50">
                DEBUG LAYOUT BOUNDS
            </div>
            {children}
        </div>
    );
}
