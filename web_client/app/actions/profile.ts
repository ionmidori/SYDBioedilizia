"use server";

import { revalidatePath } from "next/cache";
import { profileUpdateSchema } from "@/lib/validation/profile-schema";
import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

/**
 * Real image type from the file's first bytes. `File.type` is whatever the
 * client declared, so it is never trusted (security audit 2026-10-03, L5).
 */
function sniffImageType(b: Buffer): string | null {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
    if (b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1", "heif"].includes(b.toString("latin1", 8, 12))) return "image/heic";
    return null;
}

interface ActionResult {
    success: boolean;
    message: string;
    errors?: Record<string, string[]>;
    photoURL?: string;
}

/**
 * Server Action to update user profile information
 * Handles both displayName and photo URL updates
 * 
 * @param formData - FormData containing profile update fields
 * @returns ActionResult with success status and updated photoURL if applicable
 */
export async function updateUserProfile(
    formData: FormData
): Promise<ActionResult> {
    try {
        // Get authentication token from cookies
        const cookieStore = await cookies();
        const token = cookieStore.get("auth-token")?.value;

        if (!token) {
            return {
                success: false,
                message: "Autenticazione richiesta. Effettua il login.",
            };
        }

        // Verify token and get user
        // checkRevoked: a token revoked on sign-out or password change is refused.
        const decodedToken = await (await getFirebaseAuth()).verifyIdToken(token, true);
        const uid = decodedToken.uid;

        // Parse and validate form data
        const rawData = {
            displayName: formData.get("displayName") as string | undefined,
        };

        const validationResult = profileUpdateSchema.safeParse(rawData);

        if (!validationResult.success) {
            const errors: Record<string, string[]> = {};
            validationResult.error.issues.forEach((issue) => {
                const path = issue.path.join(".");
                if (!errors[path]) {
                    errors[path] = [];
                }
                errors[path].push(issue.message);
            });

            return {
                success: false,
                message: "Validazione fallita. Controlla i campi inseriti.",
                errors,
            };
        }

        const updateData: { displayName?: string; photoURL?: string } = {};

        // Update displayName if provided
        if (validationResult.data.displayName) {
            updateData.displayName = validationResult.data.displayName;
        }

        // Update user record in Firebase Auth
        if (Object.keys(updateData).length > 0) {
            await (await getFirebaseAuth()).updateUser(uid, updateData);
        }

        // Revalidate profile page
        revalidatePath("/dashboard/profile");

        return {
            success: true,
            message: "Profilo aggiornato con successo!",
        };
    } catch (error) {
        console.error("[Server Action] Error updating profile:", error);
        return {
            success: false,
            message: "Errore durante l'aggiornamento del profilo. Riprova.",
        };
    }
}

/**
 * Server Action to upload user avatar
 * Handles file upload to Firebase Storage and updates user photoURL
 * 
 * @param formData - FormData containing avatar file
 * @returns ActionResult with success status and new photoURL
 */
export async function uploadUserAvatar(
    formData: FormData
): Promise<ActionResult> {
    try {
        // Get authentication token from cookies
        const cookieStore = await cookies();
        const token = cookieStore.get("auth-token")?.value;

        if (!token) {
            return {
                success: false,
                message: "Autenticazione richiesta. Effettua il login.",
            };
        }

        // Verify token and get user
        // checkRevoked: a token revoked on sign-out or password change is refused.
        const decodedToken = await (await getFirebaseAuth()).verifyIdToken(token, true);
        const uid = decodedToken.uid;

        // Get file from form data
        const file = formData.get("avatar") as File;

        if (!file) {
            return {
                success: false,
                message: "Nessun file selezionato.",
            };
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            return {
                success: false,
                message: "Il file non può superare i 5MB.",
            };
        }

        // Validate file type
        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
        if (!validTypes.includes(file.type)) {
            return {
                success: false,
                message: "Formato file non supportato. Usa JPG, PNG, WEBP o HEIC.",
            };
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const contentType = sniffImageType(buffer);
        if (!contentType) {
            return {
                success: false,
                message: "Formato file non supportato. Usa JPG, PNG, WEBP o HEIC.",
            };
        }

        // Upload to Firebase Storage
        const bucket = getFirebaseStorage().bucket();
        const fileName = `users/${uid}/avatar.webp`;
        const fileRef = bucket.file(fileName);
        let publicUrl: string;

        try {
            await fileRef.save(buffer, {
                metadata: {
                    contentType,
                    metadata: {
                        uploadedBy: uid,
                        uploadedAt: new Date().toISOString(),
                    }
                },
                public: false,
            });

            // Public on purpose: photoURL is shown wherever the user appears and a
            // signed URL would expire. The content type comes from the bytes above.
            await fileRef.makePublic();

            publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        } catch (uploadError) {
            console.error("[Server Action] Avatar storage upload failed:", uploadError);
            return {
                success: false,
                message: "Errore durante il caricamento della foto. Riprova.",
            };
        }

        try {
            // Update user photoURL in Firebase Auth
            await (await getFirebaseAuth()).updateUser(uid, {
                photoURL: publicUrl,
            });
        } catch (authError) {
            console.error("[Server Action] Failed to update photoURL on user record:", authError);
            return {
                success: false,
                message: "Foto caricata ma non è stato possibile aggiornare il profilo. Riprova.",
            };
        }

        // Revalidate profile page
        revalidatePath("/dashboard/profile");

        return {
            success: true,
            message: "Foto profilo aggiornata con successo!",
            photoURL: publicUrl,
        };
    } catch (error) {
        console.error("[Server Action] Error uploading avatar:", error);
        return {
            success: false,
            message: "Errore durante il caricamento della foto. Riprova.",
        };
    }
}


