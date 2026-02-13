import { z } from "zod";

/**
 * Zod schemas for project construction details validation.
 * Shared between client components and server actions.
 */

export const addressSchema = z.object({
    street: z.string().min(1, "Street address is required").max(200),
    city: z.string().min(1, "City is required").max(100),
    zip: z.string().min(1, "Postal code is required").max(20),
});

export const projectDetailsSchema = z.object({
    id: z.string().min(1, "Project ID is required"),
    footage_sqm: z.number({ error: "Inserisci la metratura" }).positive("La metratura deve essere maggiore di zero").max(100000),
    property_type: z.enum(["apartment", "villa", "commercial"]),
    address: addressSchema,
    budget_cap: z.number({ error: "Inserisci il budget" }).positive("Il budget deve essere maggiore di zero"),
    technical_notes: z.string().max(1000).optional(),
    renovation_constraints: z.array(z.string()),
});

export type ProjectDetailsFormData = z.infer<typeof projectDetailsSchema>;
