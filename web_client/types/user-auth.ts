import { z } from 'zod';

/**
 * Golden Sync mirror of `RevokeSessionsResponse` in
 * `backend_python/src/models/user.py`.
 */
export const RevokeSessionsResponseSchema = z.object({
    revoked: z.boolean(),
    message: z.string(),
});

export type RevokeSessionsResponse = z.infer<typeof RevokeSessionsResponseSchema>;
