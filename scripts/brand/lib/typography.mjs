// Typography roles (web_client/brand/tokens/typography.tokens.json) -> CSS and TS.
// A generic engine like semantic.mjs: which roles exist, their faces, the next/font
// variables and the wordmark settings are data; nothing about them is written here.

const FONT_EXT = 'syd.font';
const ROLE_REF = /^\{font\.([\w-]+)\}$/;

const entries = (node) => Object.entries(node ?? {}).filter(([k]) => !k.startsWith('$'));
/** CSS font-family item: names with spaces are quoted, generic keywords are not. */
const family = (name) => (/\s/.test(name) ? `"${name}"` : name);

/**
 * Font roles, each with the face next/font loads and the variable it sets.
 * @returns {{ role: string, face: string, variable: string, fallbacks: string[] }[]}
 */
export function fontRoles(tree) {
    return entries(tree.font).map(([role, def]) => {
        const ext = def.$extensions?.[FONT_EXT];
        if (!ext?.face || !ext?.variable?.startsWith('--')) throw new Error(`font.${role}: needs syd.font { face, variable: "--..." }`);
        if (!Array.isArray(def.$value) || def.$value.length === 0) throw new Error(`font.${role}: $value must list the fallbacks`);
        return { role, face: ext.face, variable: ext.variable, fallbacks: def.$value };
    });
}

/** `@theme inline` lines: the utility reads the next/font variable where it is set (the body), then falls back. */
export function fontThemeLines(tree) {
    return fontRoles(tree).map(({ role, variable, fallbacks }) => `  --font-${role}: var(${variable}), ${fallbacks.map(family).join(', ')};`);
}

/** The `wordmark` utility: the brand name set like the logo inside running text. */
export function wordmarkUtility(tree) {
    const w = tree.wordmark;
    if (!w) return null;
    const ref = ROLE_REF.exec(w.family?.$value ?? '');
    const roles = fontRoles(tree).map((f) => f.role);
    if (!ref || !roles.includes(ref[1])) throw new Error(`wordmark.family must reference a font role ({font.<role>}), got ${w.family?.$value}`);
    return [
        '@utility wordmark {',
        `  font-family: var(--font-${ref[1]});`,
        `  font-weight: ${w.weight.$value};`,
        `  text-transform: ${w.case.$value};`,
        `  letter-spacing: ${w.tracking.$value};`,
        '}',
    ].join('\n');
}

/** role -> { face, variable }, for the generated TS (layout.tsx is held to it by a test). */
export function fontVariables(tree) {
    return Object.fromEntries(fontRoles(tree).map(({ role, face, variable }) => [role, { face, variable }]));
}
