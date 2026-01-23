/**
 * Firebase Auth Error Mapper
 * Converts Firebase error codes to user-friendly Italian messages
 */

export function mapAuthError(firebaseErrorCode: string): string {
    const errorMap: Record<string, string> = {
        // Email/Password Errors
        'auth/wrong-password': 'La password non sembra corretta.',
        'auth/user-not-found': 'Non troviamo questo account.',
        'auth/invalid-email': 'Indirizzo email non valido.',
        'auth/email-already-in-use': 'Questo indirizzo email è già registrato.',
        'auth/weak-password': 'Password troppo debole. Usa almeno 6 caratteri.',
        'auth/invalid-credential': 'Credenziali non valide.',

        // Social Login Errors
        'auth/popup-closed-by-user': 'Login annullato.',
        'auth/cancelled-popup-request': 'Login annullato.',
        'auth/popup-blocked': 'Popup bloccato. Controlla le impostazioni del browser.',
        'auth/account-exists-with-different-credential': 'Hai già un account con questa email.',

        // Network Errors
        'auth/network-request-failed': 'Nessuna connessione. Controlla la rete.',
        'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',

        // Token/Session Errors
        'auth/expired-action-code': 'Link scaduto. Richiedi un nuovo link.',
        'auth/invalid-action-code': 'Link non valido o già usato.',
        'auth/user-disabled': 'Account disabilitato. Contatta il supporto.',

        // Magic Link Errors
        'auth/invalid-email-link': 'Link email non valido.',
        'auth/missing-email': 'Email mancante.',
    };

    return errorMap[firebaseErrorCode] || 'Qualcosa è andato storto. Riprova.';
}

/**
 * Trigger haptic feedback (vibration) on mobile devices
 * @param pattern - Vibration pattern: 'light', 'medium', 'heavy'
 */
export function triggerHapticFeedback(pattern: 'light' | 'medium' | 'heavy' = 'medium'): void {
    if (!navigator.vibrate) return;

    const patterns = {
        light: [10],
        medium: [50],
        heavy: [100],
    };

    navigator.vibrate(patterns[pattern]);
}
