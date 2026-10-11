import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MediaGallery } from '../MediaGallery';
import { adminApi } from '@/lib/admin/admin-api';
import type { DossierMedia } from '@/types/admin-quote';

jest.mock('@/lib/admin/admin-api', () => ({ adminApi: { getMediaUrl: jest.fn() } }));
const getMediaUrl = adminApi.getMediaUrl as jest.MockedFunction<typeof adminApi.getMediaUrl>;

function media(overrides: Partial<DossierMedia> = {}): DossierMedia {
  return {
    media_id: 'm1',
    kind: 'input_photo',
    label: 'Foto 1 — caricata in chat',
    url: 'https://signed.test/m1?sig=old',
    ...overrides,
  };
}

describe('MediaGallery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groups photos and renders with readable labels', () => {
    render(
      <MediaGallery
        projectId="p1"
        media={[media(), media({ media_id: 'm2', kind: 'render', label: 'Render 1', url: 'https://signed.test/m2' })]}
      />,
    );
    expect(screen.getByText('Foto iniziali')).toBeInTheDocument();
    expect(screen.getByText('Render')).toBeInTheDocument();
    expect(screen.getByAltText('Foto 1 — caricata in chat')).toBeInTheDocument();
    expect(screen.getAllByTestId('gallery-thumb')).toHaveLength(2);
  });

  it('says so when there is nothing to show', () => {
    render(<MediaGallery projectId="p1" media={[]} />);
    expect(screen.getByTestId('gallery-empty')).toHaveTextContent('non ha allegato foto');
  });

  it('asks for a fresh URL once when the signed one has expired, then gives up', async () => {
    getMediaUrl.mockResolvedValue({ url: 'https://signed.test/m1?sig=new', filename: '', expires_in_seconds: 900 });
    render(<MediaGallery projectId="p1" media={[media()]} />);

    fireEvent.error(screen.getByAltText('Foto 1 — caricata in chat'));
    await waitFor(() =>
      expect(screen.getByAltText('Foto 1 — caricata in chat')).toHaveAttribute('src', 'https://signed.test/m1?sig=new'),
    );
    expect(getMediaUrl).toHaveBeenCalledTimes(1);
    expect(getMediaUrl).toHaveBeenCalledWith('p1', 'm1');

    // the fresh URL fails too: placeholder, no loop
    fireEvent.error(screen.getByAltText('Foto 1 — caricata in chat'));
    await waitFor(() => expect(screen.getByTestId('media-unavailable')).toBeInTheDocument());
    expect(getMediaUrl).toHaveBeenCalledTimes(1);
  });

  it('shows a placeholder when the URL could not be signed', () => {
    render(<MediaGallery projectId="p1" media={[media({ url: null })]} />);
    expect(screen.getByTestId('media-unavailable')).toBeInTheDocument();
  });

  it('opens http(s) links in a new tab but never renders other schemes as links', () => {
    render(
      <MediaGallery
        projectId="p1"
        media={[
          media({ media_id: 'l1', kind: 'link', label: 'Ispirazione', url: null, external_url: 'https://pinterest.com/x' }),
          media({ media_id: 'l2', kind: 'link', label: 'Strano', url: null, external_url: 'javascript:alert(1)' }),
        ]}
      />,
    );
    const links = screen.getAllByTestId('media-link');
    expect(links[0]).toHaveAttribute('href', 'https://pinterest.com/x');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(links[1]).not.toHaveAttribute('href');
    expect(links[1]).toHaveTextContent('Non disponibile');
  });

  it('enlarges a photo in a lightbox', () => {
    render(<MediaGallery projectId="p1" media={[media()]} />);
    fireEvent.click(screen.getByTestId('gallery-thumb'));
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://signed.test/m1?sig=old');
  });
});
