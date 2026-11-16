import {
    PASSKEY_DEVICE_COOKIE,
    PASSKEY_DEVICE_STORAGE_KEY,
    clearDevicePasskey,
    hasDevicePasskey,
    markDevicePasskey,
} from '../passkey-device';

describe('passkey-device marker', () => {
    beforeEach(() => {
        clearDevicePasskey();
    });

    it('is false by default', () => {
        expect(hasDevicePasskey()).toBe(false);
    });

    it('is true after mark and false after clear', () => {
        markDevicePasskey();
        expect(hasDevicePasskey()).toBe(true);
        clearDevicePasskey();
        expect(hasDevicePasskey()).toBe(false);
    });

    it('falls back to the server-set cookie when localStorage was evicted (Safari ITP)', () => {
        window.localStorage.removeItem(PASSKEY_DEVICE_STORAGE_KEY);
        document.cookie = `${PASSKEY_DEVICE_COOKIE}=1; Path=/`;
        expect(hasDevicePasskey()).toBe(true);
    });

    it('still works when localStorage throws (Safari private mode)', () => {
        const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(hasDevicePasskey()).toBe(false);
        spy.mockRestore();
    });
});
