import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClearChatDialog } from '../ClearChatDialog';

describe('ClearChatDialog', () => {
    const REASSURANCE_COPY =
        'Foto, render e preventivi restano sempre salvi nella tua Area Personale.';

    it('renders room-scoped copy and reassurance callout when roomLabel is provided', () => {
        render(
            <ClearChatDialog
                open={true}
                onOpenChange={jest.fn()}
                roomLabel="Bagno"
                isClearing={false}
                errorMessage={null}
                onConfirm={jest.fn()}
            />,
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Ricominciare la chat di Bagno?' })).toBeInTheDocument();
        expect(screen.getByText(REASSURANCE_COPY)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ricomincia stanza' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Annulla' })).toBeEnabled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders full-chat copy and reassurance callout when roomLabel is null', () => {
        render(
            <ClearChatDialog
                open={true}
                onOpenChange={jest.fn()}
                roomLabel={null}
                isClearing={false}
                errorMessage={null}
                onConfirm={jest.fn()}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Pulire tutta la chat?' })).toBeInTheDocument();
        expect(screen.getByText(REASSURANCE_COPY)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Pulisci chat' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Annulla' })).toBeEnabled();
    });

    it('calls onConfirm on confirm click and disables both buttons with pending label while clearing', async () => {
        const user = userEvent.setup();
        const onConfirm = jest.fn();

        const { rerender } = render(
            <ClearChatDialog
                open={true}
                onOpenChange={jest.fn()}
                roomLabel="Bagno"
                isClearing={false}
                errorMessage={null}
                onConfirm={onConfirm}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Ricomincia stanza' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);

        rerender(
            <ClearChatDialog
                open={true}
                onOpenChange={jest.fn()}
                roomLabel="Bagno"
                isClearing={true}
                errorMessage={null}
                onConfirm={onConfirm}
            />,
        );

        const pendingBtn = screen.getByRole('button', { name: 'Pulizia in corso…' });
        const cancelBtn = screen.getByRole('button', { name: 'Annulla' });
        expect(pendingBtn).toBeDisabled();
        expect(pendingBtn).toHaveAttribute('aria-busy', 'true');
        expect(cancelBtn).toBeDisabled();
    });

    it('renders role="alert" with errorMessage without closing the dialog', () => {
        const onOpenChange = jest.fn();

        render(
            <ClearChatDialog
                open={true}
                onOpenChange={onOpenChange}
                roomLabel={null}
                isClearing={false}
                errorMessage="Impossibile pulire la chat in questo momento."
                onConfirm={jest.fn()}
            />,
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Impossibile pulire la chat in questo momento.',
        );
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('calls onOpenChange(false) on Annulla click and on Escape key when not clearing', async () => {
        const user = userEvent.setup();
        const onOpenChange = jest.fn();

        render(
            <ClearChatDialog
                open={true}
                onOpenChange={onOpenChange}
                roomLabel="Bagno"
                isClearing={false}
                errorMessage={null}
                onConfirm={jest.fn()}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Annulla' }));
        expect(onOpenChange).toHaveBeenCalledWith(false);

        onOpenChange.mockClear();
        await user.keyboard('{Escape}');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('blocks dismissal on Escape while isClearing is true', async () => {
        const user = userEvent.setup();
        const onOpenChange = jest.fn();

        render(
            <ClearChatDialog
                open={true}
                onOpenChange={onOpenChange}
                roomLabel="Bagno"
                isClearing={true}
                errorMessage={null}
                onConfirm={jest.fn()}
            />,
        );

        await user.keyboard('{Escape}');
        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
