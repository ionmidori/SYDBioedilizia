import { triggerHaptic } from '../haptics';
import { cn } from '../utils';

describe('cn', () => {
    it('merges conditional classes', () => {
        expect(cn('a', false && 'b', 'c')).toBe('a c');
    });

    it('lets the last conflicting Tailwind class win', () => {
        expect(cn('p-2', 'p-4')).toBe('p-4');
        expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });
});

describe('triggerHaptic', () => {
    it('vibrates for 10ms when the Vibration API exists', () => {
        const vibrate = jest.fn();
        Object.defineProperty(navigator, 'vibrate', {
            value: vibrate,
            writable: true,
            configurable: true,
        });

        triggerHaptic();

        expect(vibrate).toHaveBeenCalledWith(10);
        delete (navigator as unknown as Record<string, unknown>).vibrate;
    });

    it('is a no-op without the Vibration API', () => {
        expect(() => triggerHaptic()).not.toThrow();
    });
});
