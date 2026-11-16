import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { profileUpdateSchema } from '@/lib/validation/profile-schema';
import { mapAuthError } from '@/utils/auth-utils';

export interface ProfileActionResult {
    success: boolean;
    message: string;
    errors?: Record<string, string[]>;
    photoURL?: string;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SUPPORTED_AVATAR_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
]);

function readAscii(bytes: Uint8Array, start: number, end: number): string {
    return String.fromCharCode(...bytes.slice(start, end));
}

function sniffImageMimeType(bytes: Uint8Array): string | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return 'image/png';
    }
    if (
        bytes.length >= 12 &&
        readAscii(bytes, 0, 4) === 'RIFF' &&
        readAscii(bytes, 8, 12) === 'WEBP'
    ) {
        return 'image/webp';
    }
    if (
        bytes.length >= 12 &&
        readAscii(bytes, 4, 8) === 'ftyp' &&
        ['heic', 'heix', 'mif1', 'msf1', 'heif'].includes(readAscii(bytes, 8, 12))
    ) {
        return 'image/heic';
    }
    return null;
}

function getFirebaseErrorMessage(error: unknown, fallback: string): string {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code.startsWith('auth/')) {
        return mapAuthError(code);
    }
    return fallback;
}

/**
 * Validates and persists the current signed-in user's displayName directly via
 * Firebase Auth Client SDK so profile updates never depend on cookie staleness
 * or Node-only firebase-admin/auth ESM loading on serverless runtimes.
 */
export async function updateProfileDisplayName(rawDisplayName: string): Promise<ProfileActionResult> {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
        return {
            success: false,
            message: 'Autenticazione richiesta. Effettua il login.',
        };
    }

    const validationResult = profileUpdateSchema.safeParse({ displayName: rawDisplayName });
    if (!validationResult.success) {
        const errors: Record<string, string[]> = {};
        for (const issue of validationResult.error.issues) {
            const path = issue.path.join('.');
            if (!errors[path]) errors[path] = [];
            errors[path].push(issue.message);
        }
        return {
            success: false,
            message: 'Validazione fallita. Controlla i campi inseriti.',
            errors,
        };
    }

    const nextDisplayName = validationResult.data.displayName;
    if (!nextDisplayName) {
        return {
            success: false,
            message: 'Validazione fallita. Controlla i campi inseriti.',
            errors: { displayName: ['Inserisci il tuo nome.'] },
        };
    }

    try {
        await updateProfile(currentUser, { displayName: nextDisplayName });
        return {
            success: true,
            message: 'Profilo aggiornato con successo!',
        };
    } catch (error) {
        console.error('[ProfileClient] Failed to update displayName:', error);
        return {
            success: false,
            message: getFirebaseErrorMessage(
                error,
                "Errore durante l'aggiornamento del profilo. Riprova.",
            ),
        };
    }
}

/**
 * Validates image magic bytes and size, uploads the avatar to Firebase Storage
 * (`users/{uid}/avatar.webp` enforced by `storage.rules`), and updates
 * `photoURL` on the signed-in Firebase Auth user.
 */
export async function uploadProfileAvatar(file: File): Promise<ProfileActionResult> {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
        return {
            success: false,
            message: 'Autenticazione richiesta. Effettua il login.',
        };
    }

    if (!file) {
        return {
            success: false,
            message: 'Nessun file selezionato.',
        };
    }

    if (file.size > MAX_AVATAR_BYTES) {
        return {
            success: false,
            message: 'Il file non può superare i 5MB.',
        };
    }

    if (!SUPPORTED_AVATAR_MIME_TYPES.has(file.type)) {
        return {
            success: false,
            message: 'Formato file non supportato. Usa JPG, PNG, WEBP o HEIC.',
        };
    }

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const contentType = sniffImageMimeType(bytes);
        if (!contentType) {
            return {
                success: false,
                message: 'Formato file non supportato. Usa JPG, PNG, WEBP o HEIC.',
            };
        }

        const avatarRef = ref(storage, `users/${currentUser.uid}/avatar.webp`);
        await uploadBytes(avatarRef, file, {
            contentType,
            customMetadata: {
                uploadedBy: currentUser.uid,
                uploadedAt: new Date().toISOString(),
            },
        });

        const photoURL = await getDownloadURL(avatarRef);
        await updateProfile(currentUser, { photoURL });

        return {
            success: true,
            message: 'Foto profilo aggiornata con successo!',
            photoURL,
        };
    } catch (error) {
        console.error('[ProfileClient] Failed to upload avatar:', error);
        return {
            success: false,
            message: getFirebaseErrorMessage(
                error,
                'Errore durante il caricamento della foto. Riprova.',
            ),
        };
    }
}
