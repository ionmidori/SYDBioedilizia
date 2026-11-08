'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Timer } from 'lucide-react';

interface InactivityWarningDialogProps {
    open: boolean;
    secondsRemaining: number;
    onExtend: () => void;
    onLogout: () => void;
}

/**
 * Inactivity Warning Dialog
 * 
 * Displays a countdown warning before auto-logout due to inactivity.
 * User can choose to extend session or logout immediately.
 */
export function InactivityWarningDialog({
    open,
    secondsRemaining,
    onExtend,
    onLogout,
}: InactivityWarningDialogProps) {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;

    return (
        <Dialog open={open} onOpenChange={(isOpen: boolean) => {
            // If dialog is closed without clicking a button, extend session
            if (!isOpen) onExtend();
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-warning-subtle">
                            <AlertCircle className="h-6 w-6 text-warning-ink" />
                        </div>
                        <DialogTitle>Sessione in scadenza</DialogTitle>
                    </div>
                    <DialogDescription className="pt-4">
                        La tua sessione scadrà per inattività tra:
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-center py-6">
                    <div className="flex items-center gap-2 px-6 py-3 rounded-lg bg-warning-subtle border border-warning">
                        <Timer className="h-5 w-5 text-warning-ink" />
                        <span className="text-2xl font-mono font-semibold text-warning-ink">
                            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                        </span>
                    </div>
                </div>

                <p className="text-sm text-ink-muted text-center">
                    Clicca &quot;Rimani connesso&quot; per continuare a lavorare al tuo progetto.
                </p>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="secondary"
                        onClick={onLogout}
                        className="w-full sm:w-auto"
                    >
                        Esci ora
                    </Button>
                    <Button
                        onClick={onExtend}
                        className="w-full sm:w-auto"
                    >
                        Rimani connesso
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
