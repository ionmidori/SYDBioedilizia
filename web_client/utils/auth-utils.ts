/**
 * Firebase Auth Error Mapper
 * Converts Firebase error codes to user-friendly Italian messages
 */

const INVALID_CREDENTIAL_MESSAGE = 'Email o password non corretti. Riprova o reimposta la password.';
const WEAK_PASSWORD_MESSAGE =
    'La password non è abbastanza sicura: usa almeno 10 caratteri con lettere maiuscole e minuscole, numeri e simboli.';

export function mapAuthError(firebaseErrorCode: string): string {
    const errorMap: Record<string, string> = {
        // Email/Password Errors
        // Same text for wrong password / unknown user: never reveal whether an
        // email is registered (anti-enumeration).
        'auth/wrong-password': INVALID_CREDENTIAL_MESSAGE,
        'auth/user-not-found': INVALID_CREDENTIAL_MESSAGE,
        'auth/invalid-email': 'Inserisci un indirizzo email valido (es. nome@dominio.it).',
        'auth/email-already-in-use': 'Questa email è già registrata. Accedi o reimposta la password.',
        'auth/weak-password': WEAK_PASSWORD_MESSAGE,
        'auth/password-does-not-meet-requirements': WEAK_PASSWORD_MESSAGE,
        'auth/invalid-credential': INVALID_CREDENTIAL_MESSAGE,

        // Social Login Errors
        'auth/popup-closed-by-user': 'Login annullato.',
        'auth/cancelled-popup-request': 'Login annullato.',
        'auth/popup-blocked': 'Popup bloccato. Controlla le impostazioni del browser.',
        'auth/account-exists-with-different-credential':
            'Hai già un account con questa email: accedi con il metodo usato la prima volta (es. Google o email).',
        'auth/operation-not-supported-in-this-environment':
            'Questo browser non supporta l\'accesso. Apri il sito in Safari o Chrome.',
        'auth/web-storage-unsupported':
            'Il browser blocca i dati del sito. Disattiva la navigazione privata o apri il sito in Safari o Chrome.',
        'auth/unauthorized-domain': 'Accesso non abilitato su questo indirizzo. Contatta il supporto.',
        'auth/user-cancelled': 'Login annullato.',

        // Network Errors
        'auth/network-request-failed': 'Nessuna connessione. Controlla la rete.',
        'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',

        // Token/Session Errors
        'auth/expired-action-code': 'Link scaduto. Richiedi un nuovo link.',
        'auth/invalid-action-code': 'Link non valido o già usato.',
        'auth/user-disabled': 'Account disabilitato. Contatta il supporto.',
        'auth/requires-recent-login': 'Per motivi di sicurezza, esci e accedi nuovamente prima di completare questa operazione.',
        'auth/provider-already-linked': 'Hai già una password associata a questo account.',

        // Guest chats (lib/auth/guest-claim.ts)
        'syd/guest-claim-unavailable':
            'Non riusciamo a preparare il trasferimento delle tue conversazioni da ospite. Riprova tra poco.',
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
