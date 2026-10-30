import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HouseSettingsView } from '../HouseSettingsView';

let mockProject: { data?: unknown; isLoading: boolean; error: Error | null };
jest.mock('@/hooks/use-project', () => ({ useProject: () => mockProject }));
const MockForm = jest.fn<React.ReactElement, [{ sessionId: string; initialData?: unknown }]>(() => <form aria-label="Dettagli" />);
jest.mock('@/components/dashboard/ConstructionDetailsForm', () => ({
    __esModule: true,
    default: (props: { sessionId: string; initialData?: unknown }) => MockForm(props),
}));

const DETAILS = { id: 'chat-1', footage_sqm: 90 };

beforeEach(() => {
    MockForm.mockClear();
    mockProject = {
        data: { session_id: 'chat-1', title: 'Nuovo Progetto', construction_details: DETAILS },
        isLoading: false,
        error: null,
    };
});

describe('HouseSettingsView (the details of the house)', () => {
    it('edits the details of the user’s house, with no project name', () => {
        render(<HouseSettingsView chatId="chat-1" />);

        expect(MockForm.mock.calls.at(-1)?.[0]).toEqual({ sessionId: 'chat-1', initialData: DETAILS });
        expect(screen.queryByText('Nuovo Progetto')).not.toBeInTheDocument();
    });

    it('lets a house with no details yet fill them in', () => {
        mockProject = { data: { session_id: 'chat-1', title: 'Nuovo Progetto' }, isLoading: false, error: null };
        render(<HouseSettingsView chatId="chat-1" />);

        expect(MockForm.mock.calls.at(-1)?.[0]).toEqual({ sessionId: 'chat-1', initialData: undefined });
    });

    it('says so when the house cannot be read', () => {
        mockProject = { data: undefined, isLoading: false, error: new Error('boom') };
        render(<HouseSettingsView chatId="chat-1" />);

        expect(screen.getByRole('alert')).toHaveTextContent('Non riusciamo a leggere i dettagli della tua casa');
        expect(MockForm).not.toHaveBeenCalled();
    });

    it('waits for the house before showing the form', () => {
        mockProject = { data: undefined, isLoading: true, error: null };
        render(<HouseSettingsView chatId="chat-1" />);

        expect(MockForm).not.toHaveBeenCalled();
    });
});
