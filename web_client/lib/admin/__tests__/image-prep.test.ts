import imageCompression from 'browser-image-compression';

import { DIRECT_UPLOAD_LIMIT, prepareImageForUpload } from '../image-prep';

jest.mock('browser-image-compression', () => ({ __esModule: true, default: jest.fn() }));
const compress = imageCompression as unknown as jest.Mock;

const file = (size: number) => new File([new Uint8Array(size)], 'foto.jpg', { type: 'image/jpeg' });

describe('prepareImageForUpload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends small photos as they are', async () => {
    const small = file(1000);
    await expect(prepareImageForUpload(small)).resolves.toBe(small);
    expect(compress).not.toHaveBeenCalled();
  });

  it('shrinks big photos to about 3 MB', async () => {
    const shrunk = file(10);
    compress.mockResolvedValue(shrunk);
    const big = file(DIRECT_UPLOAD_LIMIT + 1);
    await expect(prepareImageForUpload(big)).resolves.toBe(shrunk);
    expect(compress).toHaveBeenCalledWith(big, expect.objectContaining({ maxSizeMB: 3, maxWidthOrHeight: 2560 }));
  });

  it('falls back to the original if shrinking fails: the server judges it', async () => {
    compress.mockRejectedValue(new Error('canvas unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const big = file(DIRECT_UPLOAD_LIMIT + 1);
    await expect(prepareImageForUpload(big)).resolves.toBe(big);
    warn.mockRestore();
  });
});
