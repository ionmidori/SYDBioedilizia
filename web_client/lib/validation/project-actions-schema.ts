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

/**
 * Lead Capture Schema
 * Validates lead generation form data.
 */
export const leadSchema = z.object({
  name: z.string()
    .min(2, { message: "Inserisci il tuo nome completo." })
    .max(100, { message: "Il nome è troppo lungo." })
    .refine(val => !xssPattern.test(val), { message: "Il nome contiene caratteri non validi." }),
  email: z.string()
    .email({ message: "Inserisci un indirizzo email valido." })
    .max(320, { message: "L'email è troppo lunga." })
    .refine(val => !xssPattern.test(val), { message: "Email non valida." }),
  contact: z.string()
    .min(5, { message: "Inserisci un numero di telefono o contatto valido." })
    .max(30, { message: "Il contatto è troppo lungo." })
    .refine(val => !xssPattern.test(val), { message: "Contatto non valido." }),
  scope: z.string()
    .min(10, { message: "Descrivi brevemente la tua richiesta (min 10 caratteri)." })
    .max(2000, { message: "La descrizione è troppo lunga." })
    .refine(val => !xssPattern.test(val), { message: "La descrizione contiene caratteri non validi." }),
  // Honeypot field for bot protection (should remain empty)
  website: z.string().max(0).optional(),
});

export type LeadValues = z.infer<typeof leadSchema>;
