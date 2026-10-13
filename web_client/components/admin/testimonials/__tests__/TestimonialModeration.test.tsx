import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { TestimonialModeration } from '../TestimonialModeration';
import { useAdminTestimonials, useModerateTestimonial } from '@/hooks/admin/use-admin';
import type { AdminTestimonial } from '@/types/admin-content';

jest.mock('@/hooks/admin/use-admin');
const mockList = useAdminTestimonials as jest.MockedFunction<typeof useAdminTestimonials>;
const mockModerate = useModerateTestimonial as jest.MockedFunction<typeof useModerateTestimonial>;

function review(overrides: Partial<AdminTestimonial> = {}): AdminTestimonial {
  return { id: 't1', name: 'Anna', location: 'Roma', text: 'Ottimo lavoro!', rating: 4, status: 'pending', ...overrides };
}

const moderate = { mutate: jest.fn(), reset: jest.fn(), isPending: false, error: null as unknown, variables: undefined as unknown };

function load(items: AdminTestimonial[], stats = { pending: 2, approved: 5, rejected: 1 }) {
  mockList.mockReturnValue({ isPending: false, isError: false, data: { items, stats } } as unknown as ReturnType<typeof useAdminTestimonials>);
}

describe('TestimonialModeration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    moderate.error = null;
    moderate.isPending = false;
    mockModerate.mockReturnValue(moderate as unknown as ReturnType<typeof useModerateTestimonial>);
  });

  it('lists the pending reviews with name, stars and text, and the counts on the tabs', () => {
    load([review()]);
    render(<TestimonialModeration />);
    expect(mockList).toHaveBeenLastCalledWith('pending');
    const card = screen.getByTestId('review-card');
    expect(screen.getByTestId('review-name')).toHaveTextContent('Anna');
    expect(card).toHaveTextContent('Roma');
    expect(screen.getByRole('img', { name: '4 stelle su 5' })).toBeInTheDocument();
    expect(screen.getByTestId('tab-pending')).toHaveTextContent('2');
    expect(screen.getByTestId('tab-approved')).toHaveTextContent('5');
  });

  it('publishes with the internal note', () => {
    load([review()]);
    render(<TestimonialModeration />);
    fireEvent.change(screen.getByLabelText('Nota interna (facoltativa)'), { target: { value: '  ok  ' } });
    fireEvent.click(screen.getByTestId('review-approve'));
    expect(moderate.mutate).toHaveBeenCalledWith({ id: 't1', body: { decision: 'approve', notes: 'ok' } });
  });

  it('rejects without a note as null', () => {
    load([review()]);
    render(<TestimonialModeration />);
    fireEvent.click(screen.getByTestId('review-reject'));
    expect(moderate.mutate).toHaveBeenCalledWith({ id: 't1', body: { decision: 'reject', notes: null } });
  });

  it('a published review can be taken down; a rejected one can be published', () => {
    load([review({ status: 'approved' })]);
    const { rerender } = render(<TestimonialModeration />);
    expect(screen.queryByTestId('review-approve')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-reject')).toHaveTextContent('Togli dal sito');

    load([review({ status: 'rejected' })]);
    rerender(<TestimonialModeration />);
    expect(screen.queryByTestId('review-reject')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-approve')).toBeInTheDocument();
  });

  it('shows visitor text as plain text, never as markup', () => {
    load([review({ text: '<img src=x onerror=alert(1)><b>grassetto</b>' })]);
    const { container } = render(<TestimonialModeration />);
    expect(screen.getByTestId('review-text')).toHaveTextContent('<img src=x onerror=alert(1)><b>grassetto</b>');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('switches tabs and resets a previous error', () => {
    load([]);
    render(<TestimonialModeration />);
    expect(screen.getByTestId('reviews-empty')).toHaveTextContent('Nessuna recensione in attesa');
    fireEvent.click(screen.getByTestId('tab-approved'));
    expect(mockList).toHaveBeenLastCalledWith('approved');
    expect(moderate.reset).toHaveBeenCalled();
  });
});
