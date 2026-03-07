/**
 * Professional Cookie Management Utility
 * 
 * Implements security best practices (SameSite, Secure) and 
 * provides a typed API for handling GDPR-compliant cookie categories.
 */

export type CookieCategory = 'essential' | 'analytics' | 'marketing';

export interface CookieOptions {
    days?: number;
    path?: string;
    domain?: string;
    sameSite?: 'Lax' | 'Strict' | 'None';
    secure?: boolean;
}

const DEFAULT_OPTIONS: CookieOptions = {
    days: 365,
    path: '/',
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
};

export const CookieManager = {
    /**
     * Set a cookie with professional security defaults
     */
    set(name: string, value: string, options: CookieOptions = {}): void {
        if (typeof document === 'undefined') return;

        const opts = { ...DEFAULT_OPTIONS, ...options };
        let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

        if (opts.days) {
            const date = new Date();
            date.setTime(date.getTime() + opts.days * 24 * 60 * 60 * 1000);
            cookieString += `; expires=${date.toUTCString()}`;
        }

        cookieString += `; path=${opts.path}`;
        if (opts.domain) cookieString += `; domain=${opts.domain}`;
        cookieString += `; samesite=${opts.sameSite}`;
        if (opts.secure) cookieString += `; secure`;

        document.cookie = cookieString;
    },

    /**
     * Get a cookie value by name
     */
    get(name: string): string | null {
        if (typeof document === 'undefined') return null;

        const nameEQ = encodeURIComponent(name) + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
        return null;
    },

    /**
     * Delete a cookie
     */
    remove(name: string, path: string = '/'): void {
        this.set(name, '', { days: -1, path });
    },

    /**
     * Initialize GDPR Consent
     */
    setConsent(categories: Record<CookieCategory, boolean>): void {
        this.set('syd_cookie_consent', JSON.stringify(categories));

        // Trigger global event for components to react
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cookie_consent_updated', { detail: categories }));
        }
    },

    /**
     * Get current consent state
     */
    getConsent(): Record<CookieCategory, boolean> | null {
        const consent = this.get('syd_cookie_consent');
        if (!consent) return null;
        try {
            return JSON.parse(consent);
        } catch {
            return null;
        }
    },

    /**
     * Check if a specific category is allowed
     */
    isAllowed(category: CookieCategory): boolean {
        const consent = this.getConsent();
        if (!consent) return category === 'essential';
        return consent[category] || category === 'essential';
    }
};
