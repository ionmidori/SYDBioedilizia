import { renderHook } from '@testing-library/react';
import { useWebShare } from '../useWebShare';

// navigator.share / navigator.clipboard do not exist in jsdom: define per test.
function defineNavigatorProp(prop: string, value: unknown) {
    Object.defineProperty(navigator, prop, { value, writable: true, configurable: true });
}

function undefineNavigatorProp(prop: string) {
    // deleting reverts to the jsdom prototype (where share/clipboard are absent)
    delete (navigator as unknown as Record<string, unknown>)[prop];
}

afterEach(() => {
    undefineNavigatorProp('share');
    undefineNavigatorProp('clipboard');
});

describe('useWebShare — native share available', () => {
    it('shares via navigator.share and reports success', async () => {
        const shareMock = jest.fn().mockResolvedValue(undefined);
        defineNavigatorProp('share', shareMock);

        const { result } = renderHook(() => useWebShare());

        expect(result.current.canShare).toBe(true);
        await expect(result.current.share({ url: 'https://x/y' })).resolves.toBe(true);
        expect(shareMock).toHaveBeenCalledWith({ url: 'https://x/y' });
    });

    it('treats a user cancellation (AbortError) as a non-error', async () => {
        const abort = new Error('cancelled');
        abort.name = 'AbortError';
        defineNavigatorProp('share', jest.fn().mockRejectedValue(abort));

        const { result } = renderHook(() => useWebShare());

        await expect(result.current.share({ url: 'https://x/y' })).resolves.toBe(false);
    });

    it('returns false and logs on a real share failure', async () => {
        defineNavigatorProp('share', jest.fn().mockRejectedValue(new Error('denied')));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useWebShare());

        await expect(result.current.share({ url: 'https://x/y' })).resolves.toBe(false);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('shareQuote composes the SYD title and text', async () => {
        const shareMock = jest.fn().mockResolvedValue(undefined);
        defineNavigatorProp('share', shareMock);

        const { result } = renderHook(() => useWebShare());
        await result.current.shareQuote('https://x/q.pdf', 'Casa Roma');

        expect(shareMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Preventivo Casa Roma - SYD',
                url: 'https://x/q.pdf',
            })
        );
    });

    it('shareRender composes the render title', async () => {
        const shareMock = jest.fn().mockResolvedValue(undefined);
        defineNavigatorProp('share', shareMock);

        const { result } = renderHook(() => useWebShare());
        await result.current.shareRender('https://x/r.png', 'Cucina');

        expect(shareMock).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Rendering Cucina - SYD' })
        );
    });
});

describe('useWebShare — fallback without navigator.share', () => {
    it('copies the url to the clipboard', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        defineNavigatorProp('clipboard', { writeText });

        const { result } = renderHook(() => useWebShare());

        expect(result.current.canShare).toBe(false);
        await expect(result.current.share({ url: 'https://x/y' })).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('https://x/y');
    });

    it('returns false when the clipboard write fails', async () => {
        defineNavigatorProp('clipboard', {
            writeText: jest.fn().mockRejectedValue(new Error('no permission')),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useWebShare());

        await expect(result.current.share({ url: 'https://x/y' })).resolves.toBe(false);
        errorSpy.mockRestore();
    });

    it('returns false when there is nothing to copy', async () => {
        const { result } = renderHook(() => useWebShare());
        await expect(result.current.share({ title: 'solo titolo' })).resolves.toBe(false);
    });
});
