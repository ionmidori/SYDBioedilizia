import fs from 'fs';
import path from 'path';
import { FONT_VARIABLES } from '@/lib/brand/tokens.generated';

/**
 * next/font only accepts literal arguments, so app/layout.tsx cannot import the font
 * roles: it writes them out. This holds what it writes to typography.tokens.json
 * (through the generated FONT_VARIABLES): same faces, same CSS variables, all applied.
 */
const layout = fs.readFileSync(path.resolve(__dirname, '../app/layout.tsx'), 'utf8');

/** Every next/font/google loader call: `const x = Face_Name({ ... variable: "--..." ... })`. */
const loaders = [...layout.matchAll(/const (\w+) = (\w+)\(\{([^}]*)\}\);/g)].map(([, name, fn, args]) => ({
  name,
  face: fn.replaceAll('_', ' '),
  variable: /variable:\s*["']([^"']+)["']/.exec(args)?.[1],
}));

describe('fonts loaded by app/layout.tsx', () => {
  it('are exactly the font roles of typography.tokens.json, with their CSS variables', () => {
    const loaded = loaders.map(({ face, variable }) => ({ face, variable })).sort((a, b) => a.face.localeCompare(b.face));
    const declared = Object.values(FONT_VARIABLES).map(({ face, variable }) => ({ face, variable })).sort((a, b) => a.face.localeCompare(b.face));
    expect(loaded).toEqual(declared);
  });

  it('are all applied to <body>, where the font utilities read their variables', () => {
    const body = /<body[\s\S]*?className=\{`([^`]*)`\}/.exec(layout)?.[1] ?? '';
    for (const { name } of loaders) expect(body).toContain(`\${${name}.variable}`);
  });
});
