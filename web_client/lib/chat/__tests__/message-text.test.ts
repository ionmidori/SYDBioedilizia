import { getVisibleText, hasVisibleText } from '../message-text';

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
