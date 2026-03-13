/**
 * Security Utility: Input & Output Sanitization
 * 🛡️ Following 'securing-applications' best practices.
 */

/**
 * Sanitizes a string to prevent reflected XSS.
 * Removes HTML tags and common script injectors.
 */
export function sanitizeMessage(message: string): string {
    if (!message) return "";
    
    // 1. Remove all HTML tags
    const clean = message.replace(/<[^>]*>/g, "");
    
    // 2. Escape sensitive characters if we were inserting into innerHTML
    // Since React renders textContent by default, this is an extra layer of defense
    return clean
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


