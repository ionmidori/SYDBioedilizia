import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatAlert } from '../ChatAlert';

describe('ChatAlert', () => {
    it('announces an error assertively', () => {
        render(<ChatAlert variant="error" message="Invio fallito." onDismiss={jest.fn()} dismissLabel="Chiudi errore" />);

        expect(screen.getByRole('alert')).toHaveTextContent('Invio fallito.');
    });

    it('announces a warning politely: the reply still arrives', () => {
        render(
            <ChatAlert
                variant="warning"
                message="Un video allegato non è leggibile ed è stato ignorato."
                onDismiss={jest.fn()}
                dismissLabel="Chiudi avviso"
            />
        );

        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Un video allegato non è leggibile ed è stato ignorato.');
        expect(status).toHaveAttribute('aria-live', 'polite');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('can be dismissed', async () => {
        const onDismiss = jest.fn();
        render(<ChatAlert variant="warning" message="x" onDismiss={onDismiss} dismissLabel="Chiudi avviso" />);

        await userEvent.click(screen.getByRole('button', { name: 'Chiudi avviso' }));

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders an optional action', async () => {
        const onClick = jest.fn();
        render(
            <ChatAlert
                variant="error"
                message="Errore"
                onDismiss={jest.fn()}
                dismissLabel="Chiudi errore"
                action={{ label: 'Riprova', ariaLabel: 'Riprova ultimo messaggio', onClick }}
            />
        );

        await userEvent.click(screen.getByRole('button', { name: 'Riprova ultimo messaggio' }));

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('has no action button unless given one', () => {
        render(<ChatAlert variant="warning" message="x" onDismiss={jest.fn()} dismissLabel="Chiudi avviso" />);

        expect(screen.getAllByRole('button')).toHaveLength(1);
    });
});
