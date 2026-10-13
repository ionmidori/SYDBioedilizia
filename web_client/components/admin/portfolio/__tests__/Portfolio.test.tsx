import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { buildPatch, MAX_IMAGE_BYTES, PortfolioForm } from '../PortfolioForm';
import { PortfolioManager } from '../PortfolioManager';
import {
  useAdminPortfolio,
  useCreatePortfolioProject,
  useDeletePortfolioProject,
  useUpdatePortfolioProject,
  useUploadPortfolioImage,
} from '@/hooks/admin/use-admin';
import type { PortfolioProject } from '@/types/admin-content';

jest.mock('@/hooks/admin/use-admin');
const mockList = useAdminPortfolio as jest.MockedFunction<typeof useAdminPortfolio>;
const mockCreate = useCreatePortfolioProject as jest.MockedFunction<typeof useCreatePortfolioProject>;
const mockUpdate = useUpdatePortfolioProject as jest.MockedFunction<typeof useUpdatePortfolioProject>;
const mockDelete = useDeletePortfolioProject as jest.MockedFunction<typeof useDeletePortfolioProject>;
const mockUpload = useUploadPortfolioImage as jest.MockedFunction<typeof useUploadPortfolioImage>;

const IMAGE = 'https://firebasestorage.googleapis.com/v0/b/b/o/portfolio%2F1_a.webp?alt=media';
const NEW_IMAGE = 'https://firebasestorage.googleapis.com/v0/b/b/o/portfolio%2F2_b.webp?alt=media';

function project(overrides: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    id: 'p1',
    title: 'Bagno Trastevere',
    category: 'Bagno',
    location: 'Roma',
    description: 'Rifacimento completo',
    stats: { area: '6 mq', duration: '3 settimane', budget: '€12k' },
    image_url: IMAGE,
    active: true,
    order: 1,
    ...overrides,
  };
}

const mutation = () => ({ mutate: jest.fn(), reset: jest.fn(), isPending: false, error: null as unknown, variables: undefined as unknown });
let create = mutation();
let update = mutation();
let remove = mutation();
let upload = mutation();

beforeEach(() => {
  jest.clearAllMocks();
  create = mutation();
  update = mutation();
  remove = mutation();
  upload = mutation();
  mockCreate.mockReturnValue(create as unknown as ReturnType<typeof useCreatePortfolioProject>);
  mockUpdate.mockReturnValue(update as unknown as ReturnType<typeof useUpdatePortfolioProject>);
  mockDelete.mockReturnValue(remove as unknown as ReturnType<typeof useDeletePortfolioProject>);
  mockUpload.mockReturnValue(upload as unknown as ReturnType<typeof useUploadPortfolioImage>);
});

function list(items: PortfolioProject[]) {
  mockList.mockReturnValue({
    isPending: false,
    isError: false,
    data: { items, visible: items.filter((p) => p.active).length },
  } as unknown as ReturnType<typeof useAdminPortfolio>);
}

describe('buildPatch', () => {
  const form = (overrides: Record<string, unknown> = {}) => ({
    title: 'Bagno Trastevere', category: 'Bagno', location: 'Roma', description: 'Rifacimento completo',
    area: '6 mq', duration: '3 settimane', budget: '€12k', active: true, order: '1', imageUrl: IMAGE, ...overrides,
  });

  it('is empty when nothing changed, so an edit never rewrites untouched fields', () => {
    expect(buildPatch(project(), form())).toEqual({});
  });

  it('contains only what changed', () => {
    expect(buildPatch(project(), form({ title: ' Nuovo titolo ', active: false, order: '3' }))).toEqual({
      title: 'Nuovo titolo',
      active: false,
      order: 3,
    });
    expect(buildPatch(project(), form({ budget: '€15k' }))).toEqual({ stats: { area: '6 mq', duration: '3 settimane', budget: '€15k' } });
    expect(buildPatch(project(), form({ imageUrl: NEW_IMAGE }))).toEqual({ image_url: NEW_IMAGE });
  });

  it('ignores an empty or invalid order', () => {
    expect(buildPatch(project(), form({ order: '' }))).toEqual({});
    expect(buildPatch(project(), form({ order: '0' }))).toEqual({});
  });
});

describe('PortfolioManager', () => {
  it('lists projects with image, order and visibility, and counts the visible ones', () => {
    list([project(), project({ id: 'p2', title: 'Cucina', active: false, order: 2, image_url: null })]);
    render(<PortfolioManager />);
    expect(screen.getByText('2 progetti · 1 visibili sul sito.')).toBeInTheDocument();
    const [first, second] = screen.getAllByTestId('portfolio-card');
    expect(within(first).getByRole('img', { name: 'Bagno Trastevere' })).toHaveAttribute('src', IMAGE);
    expect(within(second).getByTestId('portfolio-hidden')).toBeInTheDocument();
    expect(within(second).getByLabelText('Nessuna immagine')).toBeInTheDocument();
  });

  it('hides and shows a project with one click, changing only its visibility', () => {
    list([project()]);
    render(<PortfolioManager />);
    fireEvent.click(screen.getByTestId('portfolio-toggle'));
    expect(update.mutate).toHaveBeenCalledWith({ id: 'p1', body: { active: false } });
  });

  it('asks before deleting and says what is lost', () => {
    list([project()]);
    render(<PortfolioManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina Bagno Trastevere' }));
    expect(remove.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('immagine viene cancellata');
    fireEvent.click(screen.getByTestId('portfolio-delete-confirm'));
    expect(remove.mutate).toHaveBeenCalledWith('p1', expect.any(Object));
  });

  it('explains the empty gallery (the site shows sample projects)', () => {
    list([]);
    render(<PortfolioManager />);
    expect(screen.getByTestId('portfolio-empty')).toHaveTextContent('di esempio');
  });

  it('opens the form for a new project and for an existing one, prefilled', () => {
    list([project()]);
    render(<PortfolioManager />);
    fireEvent.click(screen.getByTestId('portfolio-add'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Nuovo progetto');
    expect(screen.getByTestId('portfolio-title')).toHaveValue('');
  });
});

describe('PortfolioForm', () => {
  const file = (type: string, size = 1000) => new File([new Uint8Array(size)], 'foto.jpg', { type });

  it('uploads the chosen image and previews the stored copy', () => {
    upload.mutate.mockImplementation((_f, options) => options.onSuccess({ image_url: NEW_IMAGE, width: 1920, height: 1080, size_bytes: 1 }));
    render(<PortfolioForm project={null} open onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId('portfolio-file'), { target: { files: [file('image/jpeg')] } });
    expect(upload.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('portfolio-preview')).toHaveAttribute('src', NEW_IMAGE);
  });

  it.each([
    ['an unsupported type', file('application/pdf'), 'Formato non supportato'],
    ['a file over 10 MB', file('image/png', MAX_IMAGE_BYTES + 1), 'massimo 10 MB'],
  ])('refuses %s before sending anything', (_label, chosen, message) => {
    render(<PortfolioForm project={null} open onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId('portfolio-file'), { target: { files: [chosen] } });
    expect(screen.getByTestId('portfolio-file-error')).toHaveTextContent(message);
    expect(upload.mutate).not.toHaveBeenCalled();
  });

  it('creating needs a title, a place and an image, and says which is missing', () => {
    render(<PortfolioForm project={null} open onOpenChange={jest.fn()} />);
    fireEvent.click(screen.getByTestId('portfolio-save'));
    const problems = screen.getByTestId('portfolio-problems');
    expect(problems).toHaveTextContent('titolo');
    expect(problems).toHaveTextContent('città');
    expect(problems).toHaveTextContent('immagine');
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('creates with the uploaded image', () => {
    upload.mutate.mockImplementation((_f, options) => options.onSuccess({ image_url: NEW_IMAGE, width: 1, height: 1, size_bytes: 1 }));
    render(<PortfolioForm project={null} open onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId('portfolio-file'), { target: { files: [file('image/png')] } });
    fireEvent.change(screen.getByTestId('portfolio-title'), { target: { value: '  Cucina Prati ' } });
    fireEvent.change(screen.getByTestId('portfolio-location'), { target: { value: 'Roma' } });
    fireEvent.click(screen.getByTestId('portfolio-save'));
    expect(create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Cucina Prati', location: 'Roma', category: 'Soggiorno', image_url: NEW_IMAGE, active: true }),
      expect.any(Object),
    );
  });

  it('editing sends only the changes; with no change it just closes', () => {
    const onOpenChange = jest.fn();
    const { rerender } = render(<PortfolioForm project={project()} open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('portfolio-save'));
    expect(update.mutate).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(<PortfolioForm project={project()} open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByTestId('portfolio-title'), { target: { value: 'Bagno nuovo' } });
    fireEvent.click(screen.getByTestId('portfolio-save'));
    expect(update.mutate).toHaveBeenCalledWith({ id: 'p1', body: { title: 'Bagno nuovo' } }, expect.any(Object));
  });

  it('does not allow saving while the image is still uploading', () => {
    upload.isPending = true;
    render(<PortfolioForm project={project()} open onOpenChange={jest.fn()} />);
    expect(screen.getByTestId('portfolio-save')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento in corso');
  });
});
