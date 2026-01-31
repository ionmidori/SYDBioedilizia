import { z } from "zod";

/**
 * File Upload Schema
 * Validates file uploads with size and type restrictions
 */
export const fileUploadSchema = z.object({
    file: z.instanceof(File, { message: "File richiesto" }),
    type: z.enum(["image", "document", "video"], {
        message: "Tipo file non valido"
    }),
});

/**
 * Image Upload Schema
 * Specific validation for image uploads
 */
export const imageUploadSchema = fileUploadSchema.extend({
    type: z.literal("image"),
    size: z.number().max(10 * 1024 * 1024, "Le immagini non possono superare i 10MB"),
    mimeType: z.enum([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic"
    ], {
        message: "Formato immagine non supportato"
    }),
});

/**
 * Document Upload Schema
 * Specific validation for document uploads
 */
export const documentUploadSchema = fileUploadSchema.extend({
    type: z.literal("document"),
    size: z.number().max(25 * 1024 * 1024, "I documenti non possono superare i 25MB"),
    mimeType: z.enum(["application/pdf"], {
        message: "Solo file PDF sono supportati"
    }),
});

/**
 * Video Upload Schema
 * Specific validation for video uploads
 */
export const videoUploadSchema = fileUploadSchema.extend({
    type: z.literal("video"),
    size: z.number().max(100 * 1024 * 1024, "I video non possono superare i 100MB"),
    mimeType: z.enum([
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo"
    ], {
        message: "Formato video non supportato. Usa MP4 o MOV"
    }),
});

/**
 * File Metadata Schema
 * Schema for file metadata stored in Firestore
 */
export const fileMetadataSchema = z.object({
    url: z.string().url(),
    name: z.string().min(1, "Nome file richiesto"),
    type: z.enum(["image", "document", "video"]),
    size: z.number().positive(),
    uploadedAt: z.date(),
    uploadedBy: z.string().min(1, "ID utente richiesto"),
    projectId: z.string().min(1, "ID progetto richiesto"),
});

// Type exports
export type FileUploadData = z.infer<typeof fileUploadSchema>;
export type ImageUploadData = z.infer<typeof imageUploadSchema>;
export type DocumentUploadData = z.infer<typeof documentUploadSchema>;
export type VideoUploadData = z.infer<typeof videoUploadSchema>;
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

/**
 * Utility function to validate file before upload
 */
export function validateFileForUpload(file: File): {
    valid: boolean;
    error?: string;
    type?: "image" | "document" | "video";
} {
    // Determine file type from MIME type
    let fileType: "image" | "document" | "video" | undefined;

    if (file.type.startsWith("image/")) {
        fileType = "image";
        const result = imageUploadSchema.safeParse({
            file,
            type: "image",
            size: file.size,
            mimeType: file.type
        });

        if (!result.success) {
            return { valid: false, error: result.error.issues[0]?.message };
        }
    } else if (file.type === "application/pdf") {
        fileType = "document";
        const result = documentUploadSchema.safeParse({
            file,
            type: "document",
            size: file.size,
            mimeType: file.type
        });

        if (!result.success) {
            return { valid: false, error: result.error.issues[0]?.message };
        }
    } else if (file.type.startsWith("video/")) {
        fileType = "video";
        const result = videoUploadSchema.safeParse({
            file,
            type: "video",
            size: file.size,
            mimeType: file.type
        });

        if (!result.success) {
            return { valid: false, error: result.error.issues[0]?.message };
        }
    } else {
        return {
            valid: false,
            error: "Tipo di file non supportato. Usa immagini (JPG, PNG, WEBP), PDF o video (MP4, MOV)"
        };
    }

    return { valid: true, type: fileType };
}
