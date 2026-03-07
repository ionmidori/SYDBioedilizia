import { z } from 'zod';
import { projectDetailsSchema, addressSchema } from '../lib/validation/project-details-schema';
import { projectListItemSchema, projectSchema } from '../lib/validation/project-list-schema';

export const projectStatusSchema = z.enum(['draft', 'analyzing', 'quoted', 'rendering', 'completed']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const propertyTypeSchema = z.enum(['apartment', 'villa', 'commercial']);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export type Address = z.infer<typeof addressSchema>;

export type ProjectDetails = z.infer<typeof projectDetailsSchema>;

export type ProjectListItem = z.infer<typeof projectListItemSchema>;

export type Project = z.infer<typeof projectSchema>;

export const projectCreateSchema = z.object({
    title: z.string().optional(),
});
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = z.object({
    title: z.string().optional(),
    status: projectStatusSchema.optional(),
    thumbnail_url: z.string().optional(),
    original_image_url: z.string().optional(),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
