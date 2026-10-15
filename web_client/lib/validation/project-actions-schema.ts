import { z } from "zod";

/**
 * XSS Mitigation: Basic pattern to block HTML tags 
 */
const xssPattern = /<[^>]*>/;

export const createProjectSchema = z.object({
  title: z.string()
    .min(3, { message: "Il nome del progetto deve essere di almeno 3 caratteri." })
    .max(50, { message: "Il nome del progetto non può superare i 50 caratteri." })
    .refine(val => !xssPattern.test(val), { message: "Il titolo contiene caratteri non validi." }),
});

export type CreateProjectValues = z.infer<typeof createProjectSchema>;

export const renameProjectSchema = createProjectSchema; // Same validation rules for now
export type RenameProjectValues = z.infer<typeof renameProjectSchema>;
