import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolStatus } from '../ToolStatus';

jest.mock('@/components/chat/ImagePreview', () => ({ ImagePreview: () => <div data-testid="image" /> }));
jest.mock('@/components/chat/GalleryCard', () => ({ GalleryCard: () => <div /> }));

const result = (toolName: string, value: unknown) => ({ toolCallId: 'c1', toolName, state: 'result' as const, result: value });

describe('ToolStatus — errors', () => {
    it('shows a failed render as an image error', () => {
        render(<ToolStatus tool={result('generate_render', { status: 'error', error: 'Quota esaurita' })} onImageClick={jest.fn()} />);

        expect(screen.getByText('Errore generazione immagine:')).toBeInTheDocument();
        expect(screen.getByText('Quota esaurita')).toBeInTheDocument();
    });

    it("shows nothing for another tool's error: it is a message for the agent, which answers in text", () => {
        // Production, 29 Oct: a guest's select_room is refused; the login turn showed "Errore generazione immagine".
        const refused = { status: 'error', message: 'Le stanze sono disponibili solo agli utenti registrati.' };
        const { container } = render(<ToolStatus tool={result('select_room', refused)} onImageClick={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});
