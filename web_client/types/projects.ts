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

/** Body of POST /api/projects/{id}/files — Golden Sync with ProjectFileMetadata (models/project.py). */
export interface ProjectFileMetadata {
    file_id: string;
    url: string;
    name: string;
    type: string;
    size: number;
    /** Object path in the bucket: must be under projects/{id}/uploads/ */
    storage_path?: string | null;
    /** Room the file belongs to (see types/room.ts) */
    room_id?: string | null;
}
