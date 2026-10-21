import { getVisibleText, hasVisibleText, stripDuplicateImages } from '../message-text';

describe('getVisibleText', () => {
    it('joins the streamed text parts', () => {
        expect(getVisibleText([
            { type: 'text', text: 'Ciao ' },
            { type: 'data-status', data: { message: 'x' } },
            { type: 'text', text: 'Mario' },
        ])).toBe('Ciao Mario');
    });

    it('lets the latest data-redact part win over streamed text', () => {
        expect(getVisibleText([
            { type: 'text', text: 'testo con dati sensibili' },
            { type: 'data-redact', data: { text: 'prima versione sicura' } },
            { type: 'data-redact', data: { text: 'versione sicura' } },
        ])).toBe('versione sicura');
    });

    it('strips the legacy "..." placeholder', () => {
        expect(getVisibleText([{ type: 'text', text: '...' }])).toBe('');
        expect(hasVisibleText([{ type: 'text', text: '...' }])).toBe(false);
        expect(getVisibleText([{ type: 'text', text: '...Ecco' }])).toBe('Ecco');
    });

    it('handles missing parts', () => {
        expect(getVisibleText(undefined)).toBe('');
        expect(hasVisibleText([])).toBe(false);
    });
});

describe('stripDuplicateImages', () => {
    // Same object, two different signed URLs (signature/date differ per request).
    const TOOL_URL = 'https://storage.googleapis.com/bucket/renders/s1/r.png?X-Goog-Signature=aaa';
    const TEXT_URL = 'https://storage.googleapis.com/bucket/renders/s1/r.png?X-Goog-Signature=bbb';

    it('drops a markdown image already shown by the render tool (production: shown twice)', () => {
        const text = `Ecco il rendering!\n\n![Render Cucina](${TEXT_URL})\n\nTi piace?`;
        const out = stripDuplicateImages(text, [TOOL_URL]);
        expect(out).not.toContain('![');
        expect(out).toContain('Ecco il rendering!');
        expect(out).toContain('Ti piace?');
    });

    it('keeps images of other files', () => {
        const other = '![foto](https://storage.googleapis.com/bucket/user-uploads/s1/k.jpg?sig=1)';
        expect(stripDuplicateImages(other, [TOOL_URL])).toBe(other);
    });

    it('is a no-op without tool images', () => {
        const text = `![x](${TEXT_URL})`;
        expect(stripDuplicateImages(text, [])).toBe(text);
    });

    it('ignores malformed urls', () => {
        expect(stripDuplicateImages('![x](not a url)', [TOOL_URL])).toBe('![x](not a url)');
    });
});
