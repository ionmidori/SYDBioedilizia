import { AdminApiError } from '../admin-api';
import { describeAdminError, describeUploadError } from '../admin-errors';

describe('describeAdminError', () => {
  it('a version conflict reads right for quotes AND the price book (no entity in the text)', () => {
    const info = describeAdminError(new AdminApiError(409, 'VERSION_CONFLICT', 'changed'));
    expect(info).toMatchObject({ kind: 'conflict', stale: true });
    expect(info.message).not.toMatch(/preventivo|listino/i);
  });

  it('lists the SKUs the AI recipes still use', () => {
    const info = describeAdminError(new AdminApiError(422, 'PRICE_BOOK_SKU_IN_USE', 'x', { skus: ['DEM-001', 'BAG-001'] }));
    expect(info.message).toContain('DEM-001, BAG-001');
    expect(info.stale).toBe(false);
  });

  it('maps the other known failures', () => {
    expect(describeAdminError(new AdminApiError(409, 'QUOTE_LOCKED', 'x')).kind).toBe('locked');
    expect(describeAdminError(new AdminApiError(409, 'INVALID_TRANSITION', 'x')).kind).toBe('transition');
    expect(describeAdminError(new AdminApiError(403, 'ADMIN_REQUIRED', 'x')).kind).toBe('denied');
    expect(describeAdminError(new AdminApiError(422, 'HTTP_422', 'x')).kind).toBe('invalid');
    expect(describeAdminError(new Error('network')).kind).toBe('other');
  });
});

describe('describeUploadError', () => {
  it('says what is wrong with the file', () => {
    expect(describeUploadError(new AdminApiError(413, 'HTTP_413', 'x')).message).toMatch(/10 MB/);
    expect(describeUploadError(new AdminApiError(400, 'HTTP_400', 'x')).message).toMatch(/immagine valida/);
    expect(describeUploadError(new AdminApiError(422, 'INVALID_IMAGE', 'x')).message).toMatch(/immagine utilizzabile/);
    expect(describeUploadError(new AdminApiError(502, 'PORTFOLIO_UPLOAD_FAILED', 'x')).message).toMatch(/Riprova/);
  });

  it('falls back to the general wording for everything else', () => {
    expect(describeUploadError(new AdminApiError(403, 'ADMIN_REQUIRED', 'x')).kind).toBe('denied');
    expect(describeUploadError(new Error('network')).kind).toBe('other');
  });
});
