import { render, screen } from '@testing-library/react';
import { Alert } from '@/components/ui/alert';
import { BUTTON_VARIANTS, Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ELEVATION_LEVELS, ROLE_NAMES, STATUS_TONES } from '@/lib/brand/tokens.generated';

/** Colour utilities whose value must be a semantic role (sizes, widths and the like are not colours). */
const COLOUR_UTILITY = /^(?:[\w-]+(?:\[[^\]]*\])?:)*!?(bg|text|border|ring-offset|ring|outline|divide|placeholder|fill|stroke|from|via|to)-(.+?)(?:\/\d+)?$/;
const NOT_A_COLOUR = /^(?:\d.*|\[.*|x|y|t|b|l|r|xs|sm|base|lg|xl|\dxl|left|center|right|justify|start|end|none|hidden|solid|dashed|dotted|transparent|current|inherit|offset-\d+)$/;

function colourValues(className: string): string[] {
  return className
    .split(/\s+/)
    .map((c) => COLOUR_UTILITY.exec(c))
    .filter((m): m is RegExpExecArray => m !== null && !NOT_A_COLOUR.test(m[2]))
    .map((m) => m[2]);
}

const roles: readonly string[] = ROLE_NAMES;

describe('Button', () => {
  it.each(BUTTON_VARIANTS)('variant %s colours itself with semantic roles only', (variant) => {
    render(<Button variant={variant}>Azione</Button>);
    const values = colourValues(screen.getByRole('button').className);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(roles).toContain(v);
  });

  it.each(BUTTON_VARIANTS)('variant %s keeps a real edge in forced-colors mode when it is a filled shape', (variant) => {
    // Forced colours drop backgrounds: a filled button without a border would read as plain text.
    render(<Button variant={variant}>Azione</Button>);
    const classes = screen.getByRole('button').className.split(/\s+/);
    if (classes.some((c) => /^bg-/.test(c))) expect(classes).toEqual(expect.arrayContaining(['border', 'border-transparent']));
  });

  it('is primary by default', () => {
    render(<Button>Azione</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary', 'text-on-primary');
  });
});

describe('StatusBadge', () => {
  it.each(STATUS_TONES)('renders the %s tone with its subtle background and ink', (tone) => {
    render(<StatusBadge tone={tone}>Stato</StatusBadge>);
    const badge = screen.getByText('Stato');
    expect(badge).toHaveClass(`bg-${tone}-subtle`, `text-${tone}-ink`);
    for (const v of colourValues(badge.className)) expect(roles).toContain(v);
  });
});

describe('Alert', () => {
  it.each(STATUS_TONES)('announces the %s tone with the right live role', (tone) => {
    render(
      <Alert tone={tone} title="Titolo">
        Dettaglio
      </Alert>,
    );
    const alert = screen.getByRole(tone === 'danger' ? 'alert' : 'status');
    expect(alert).toHaveTextContent('Titolo');
    expect(alert).toHaveTextContent('Dettaglio');
    expect(alert).toHaveClass(`bg-${tone}-subtle`, `text-${tone}-ink`);
    for (const v of colourValues(alert.className)) expect(roles).toContain(v);
  });
});

describe('Card', () => {
  it.each(ELEVATION_LEVELS)('elevation %s maps to shadow-%s', (level) => {
    render(<Card elevation={level}>Contenuto</Card>);
    expect(screen.getByText('Contenuto')).toHaveClass(`shadow-${level}`);
  });

  it('has no shadow at elevation 0 (the default) and uses role colours', () => {
    render(<Card>Contenuto</Card>);
    const card = screen.getByText('Contenuto');
    expect(card.className).not.toMatch(/\bshadow-/);
    for (const v of colourValues(card.className)) expect(roles).toContain(v);
  });
});
