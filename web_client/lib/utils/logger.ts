/**
 * Logger utility with environment-aware logging
 * ✅ BUG FIX #17: Remove console.log overhead in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
    /**
     * Debug logs - only in development
     */
    debug: (...args: any[]) => {
        if (isDevelopment) {
            console.log(...args);
        }
    },

    /**
     * Info logs - only in development
     */
    info: (...args: any[]) => {
        if (isDevelopment) {
            console.info(...args);
        }
    },

    /**
     * Warning logs - always enabled
     */
    warn: (...args: any[]) => {
        console.warn(...args);
    },

    /**
     * Error logs - always enabled
     */
    error: (...args: any[]) => {
        console.error(...args);
    },

    /**
     * Group logs - only in development
     */
    group: (label: string) => {
        if (isDevelopment) {
            console.group(label);
        }
    },

    groupEnd: () => {
        if (isDevelopment) {
            console.groupEnd();
        }
    }
};
