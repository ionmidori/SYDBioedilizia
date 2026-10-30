import { z } from 'zod';
import { projectDetailsSchema } from './project-details-schema';

/**
 * Zod schema for API response validation of GET /api/projects/{id}.
 * Kept in sync with backend Pydantic model: src/models/project.py → ProjectDocument
 *
 * Purpose: Detect schema drift early on the frontend. Uses graceful transforms:
 * - `null` from backend → `undefined` in the UI layer (matches TS interface string | undefined)
 * - Naive datetime strings normalised by backend (always `Z` suffix after fix)
 */

const projectStatusSchema = z.enum([
    'draft',
    'analyzing',
    'quoted',
    'rendering',
    'completed',
]);

/**
 * Accepts `null | string | undefined` from the wire and normalises to `string | undefined`.
 * Firebase Storage signed URLs contain query params that can fail strict url() validation,
 * so we validate only that the value is a string if present.
 */
const nullableOptionalUrl = z
    .string()
    .nullish()
    .transform((val) => val ?? undefined);

export const projectSchema = z.object({
    session_id: z.string().min(1),
    title: z.string(),
    user_id: z.string(),
    status: projectStatusSchema,
    thumbnail_url: nullableOptionalUrl,
    original_image_url: nullableOptionalUrl,
    message_count: z.number().int().min(0).default(0),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    construction_details: projectDetailsSchema.nullish().transform((val) => val ?? undefined),
});
