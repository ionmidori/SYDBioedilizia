import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { CompanyInfoEditor } from '../CompanyInfoEditor';
import { useCompanyInfo, useCompanyInfoHistory, useSaveCompanyInfo } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';
import { confirmLeave, LEAVE_MESSAGE } from '@/lib/admin/unsaved-guard';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import type { CompanyInfo, CompanyInfoResponse } from '@/types/company-info';

jest.mock('@/hooks/admin/use-admin');
const mockInfo = useCompanyInfo as jest.MockedFunction<typeof useCompanyInfo>;
const mockSave = useSaveCompanyInfo as jest.MockedFunction<typeof useSaveCompanyInfo>;
const mockHistory = useCompanyInfoHistory as jest.MockedFunction<typeof useCompanyInfoHistory>;

const copy = (): CompanyInfo => JSON.parse(JSON.stringify(SEED_COMPANY_INFO));

function infoQuery(overrides: Partial<CompanyInfoResponse> = {}, extra: Record<string, unknown> = {}) {
    mockInfo.mockReturnValue({
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: jest.fn(),
        data: { etag: '"v2"', version: 2, source: 'firestore', info: copy(), ...overrides },
        ...extra,
    } as unknown as ReturnType<typeof useCompanyInfo>);
}

const saveMutation = { mutate: jest.fn(), isPending: false, error: null as unknown, reset: jest.fn() };
const phone = () => screen.getByLabelText('Telefono');

describe('CompanyInfoEditor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        saveMutation.error = null;
        saveMutation.mutate.mockReset();
        mockSave.mockReturnValue(saveMutation as unknown as ReturnType<typeof useSaveCompanyInfo>);
        mockHistory.mockReturnValue({
            isPending: false,
            isError: false,
            data: {
                items: [
                    {
                        version: 2,
                        actor_uid: 'a',
                        reason: 'Orari estivi',
                        changed_parts: ['hours', 'identity'],
                        created_at: '2026-11-12T10:00:00Z',
                    },
                ],
            },
        } as unknown as ReturnType<typeof useCompanyInfoHistory>);
    });

    it('shows a spinner while loading and an error when it cannot load', () => {
        infoQuery({}, { isPending: true, data: undefined });
        const { unmount } = render(<CompanyInfoEditor />);
        expect(screen.getByLabelText('Caricamento')).toBeInTheDocument();
        unmount();
        infoQuery({}, { isPending: false, isError: true, data: undefined });
        render(<CompanyInfoEditor />);
        expect(screen.getByRole('alert')).toHaveTextContent(/Impossibile caricare/);
    });

    it('shows the company info, its version and the identity tab first', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        expect(screen.getByRole('heading', { name: 'Società' })).toBeInTheDocument();
        expect(screen.getByText(/versione 2/)).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(9);
        expect(screen.getByRole('tab', { name: /Identità e contatti/ })).toHaveAttribute('aria-selected', 'true');
        expect(phone()).toHaveValue(SEED_COMPANY_INFO.identity.phone);
        expect(screen.getByTestId('company-save')).toBeDisabled();
    });

    it('asks why before saving, names what changed and sends the ETag it read', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06 123456' } });
        fireEvent.click(screen.getByTestId('company-save'));
        expect(within(screen.getByTestId('save-parts')).getByText('Identità e contatti')).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('save-reason'), { target: { value: 'orari estivi' } });
        fireEvent.click(screen.getByTestId('save-confirm'));
        expect(saveMutation.mutate).toHaveBeenCalledTimes(1);
        const [vars] = saveMutation.mutate.mock.calls[0];
        expect(vars.etag).toBe('"v2"');
        expect(vars.body.reason).toBe('orari estivi');
        expect(vars.body.info.identity.phone).toBe('06 123456');
    });

    it('does not send a phone with too few digits: it flags the field and moves focus to it', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06' } });
        fireEvent.click(screen.getByTestId('company-save'));
        expect(screen.queryByTestId('save-confirm')).not.toBeInTheDocument();
        expect(screen.getByTestId('company-issues')).toHaveTextContent(/cifre/);
        expect(phone()).toHaveAttribute('aria-invalid', 'true');
        expect(document.activeElement).toBe(phone());
        expect(saveMutation.mutate).not.toHaveBeenCalled();
    });

    it('marks the tab that has problems', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06' } });
        fireEvent.click(screen.getByTestId('company-save'));
        expect(screen.getByRole('tab', { name: /Identità e contatti/ })).toHaveTextContent(/contiene errori/);
    });

    it('sends WhatsApp as null when it is emptied', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '' } });
        fireEvent.click(screen.getByTestId('company-save'));
        fireEvent.click(screen.getByTestId('save-confirm'));
        expect(saveMutation.mutate.mock.calls[0][0].body.info.identity.whatsapp).toBeNull();
    });

    it('warns when another admin saved first, blocks saving, and discards on request', () => {
        infoQuery();
        const { rerender } = render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06 123456' } });
        infoQuery({ etag: '"v3"', version: 3 });
        rerender(<CompanyInfoEditor />);
        expect(screen.getByTestId('stale-banner')).toBeInTheDocument();
        expect(screen.getByTestId('company-save')).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Scarta le mie modifiche/ }));
        expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
        expect(phone()).toHaveValue(SEED_COMPANY_INFO.identity.phone);
    });

    it('shows no false conflict while the saved version is being fetched, then the notice', () => {
        infoQuery();
        const { rerender } = render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06 123456' } });
        saveMutation.mutate.mockImplementation((_vars, options) =>
            options.onSuccess({ etag: '"v3"', version: 3, changed_parts: ['identity'] }),
        );
        fireEvent.click(screen.getByTestId('company-save'));
        fireEvent.click(screen.getByTestId('save-confirm'));
        expect(screen.getByTestId('notice')).toHaveTextContent(/versione 3/);
        // the old version is still what the query holds, and it is refetching
        infoQuery({}, { isFetching: true });
        rerender(<CompanyInfoEditor />);
        expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
        expect(phone()).toHaveValue('06 123456');
        // the refetch arrives with the saved version
        const saved = copy();
        saved.identity.phone = '06 123456';
        infoQuery({ etag: '"v3"', version: 3, info: saved });
        rerender(<CompanyInfoEditor />);
        expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
        expect(phone()).toHaveValue('06 123456');
        expect(screen.getByTestId('company-save')).toBeDisabled();
    });

    it('says when it shows the initial data, and when it ignored a stored document', () => {
        infoQuery({ source: 'seed', version: 0, etag: '"v0"' });
        const { unmount } = render(<CompanyInfoEditor />);
        expect(screen.getByTestId('company-seed')).toBeInTheDocument();
        expect(screen.queryByTestId('company-ignored')).not.toBeInTheDocument();
        unmount();
        infoQuery({ source: 'seed', version: 0, etag: '"v0"', ignored_document: 'invalid_info' });
        render(<CompanyInfoEditor />);
        expect(screen.getByTestId('company-ignored')).toBeInTheDocument();
    });

    it('moves between tabs with the arrow keys, Home and End', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        const tabs = screen.getAllByRole('tab');
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(document.activeElement).toBe(tabs[1]);
        fireEvent.keyDown(tabs[1], { key: 'End' });
        expect(tabs[8]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(tabs[8], { key: 'ArrowRight' });
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
        expect(tabs[8]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(tabs[8], { key: 'Home' });
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('asks before leaving with unsaved edits, and not after discarding them', () => {
        infoQuery();
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        render(<CompanyInfoEditor />);
        expect(confirmLeave()).toBe(true);
        fireEvent.change(phone(), { target: { value: '06 123456' } });
        expect(confirmLeave()).toBe(false);
        expect(confirm).toHaveBeenCalledWith(LEAVE_MESSAGE);
        fireEvent.click(screen.getByTestId('company-discard'));
        expect(confirmLeave()).toBe(true);
        confirm.mockRestore();
    });

    it('shows a version conflict from the server in the save dialog', () => {
        infoQuery();
        saveMutation.error = new AdminApiError(409, 'VERSION_CONFLICT', 'changed');
        render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06 123456' } });
        fireEvent.click(screen.getByTestId('company-save'));
        expect(screen.getByTestId('error-banner')).toHaveAttribute('data-error-kind', 'conflict');
    });

    it('shows the history with the changed parts in Italian', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        fireEvent.click(screen.getByRole('button', { name: /Storico/ }));
        const history = screen.getByTestId('company-history');
        expect(history).toHaveTextContent('v2');
        expect(history).toHaveTextContent('Orari, Identità e contatti');
        expect(history).toHaveTextContent('Orari estivi');
    });

    it('discarding the edits restores the saved values and disables Save', () => {
        infoQuery();
        render(<CompanyInfoEditor />);
        fireEvent.change(phone(), { target: { value: '06 123456' } });
        act(() => {
            fireEvent.click(screen.getByTestId('company-discard'));
        });
        expect(screen.getByTestId('company-save')).toBeDisabled();
        expect(phone()).toHaveValue(SEED_COMPANY_INFO.identity.phone);
    });
});
