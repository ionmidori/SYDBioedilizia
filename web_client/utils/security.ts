/**
 * Security Utility: Input & Output Sanitization
 * 🛡️ Following 'securing-applications' best practices.
 */

/**
 * Normalizes a short user-facing message before it is stored in React state.
 *
 * This is intentionally NOT an HTML sanitizer: every consumer renders the
 * result as a React text node (e.g. `setError(sanitizeMessage(...))`), and React
 * escapes text content by default — so there is no HTML context to inject into.
 * Attempting a regex tag-strip here gave a false sense of safety and was flagged
 * by CodeQL (js/incomplete-multi-character-sanitization). Instead we just tidy
 * the string: drop control characters, collapse whitespace, trim, and cap length.
 */
export function sanitizeMessage(message: string): string {
  if (!message) return "";
  // Drop ASCII control characters (C0 range + DEL) by code point — avoids a
  // control-character regex literal while producing clean, single-line text.
  let out = "";
  for (const ch of message) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 500);
}
