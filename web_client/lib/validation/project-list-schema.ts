import { z } from 'zod';

/**
 * Zod schema for API response validation of ProjectListItem.
 * Kept in sync with backend Pydantic model: src/models/project.py → ProjectListItem
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

export const projectListItemSchema = z.object({
    session_id: z.string().min(1),
    title: z.string(),
    status: projectStatusSchema,
    thumbnail_url: nullableOptionalUrl,
    original_image_url: nullableOptionalUrl,
    updated_at: z.string().datetime({ offset: true }),
    message_count: z.number().int().min(0).default(0),
});

export const projectListResponseSchema = z.array(projectListItemSchema);

export type ProjectListItemValidated = z.infer<typeof projectListItemSchema>;
