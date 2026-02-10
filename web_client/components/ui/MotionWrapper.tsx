"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";

interface MotionWrapperProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
    whileTapScale?: number;
    whileHoverScale?: number;
    hoverLift?: boolean;
}

export const MotionWrapper = React.forwardRef<HTMLDivElement, MotionWrapperProps>(
    ({ children, className, whileTapScale = 0.96, whileHoverScale, hoverLift, ...props }, ref) => {
        return (
            <motion.div
                ref={ref}
                className={cn("inline-block", className)}
                whileTap={{ scale: whileTapScale }}
                whileHover={{
                    scale: whileHoverScale,
                    y: hoverLift ? -4 : 0,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);

MotionWrapper.displayName = "MotionWrapper";
