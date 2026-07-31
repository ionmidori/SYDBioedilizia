import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReadonlyURLSearchParams } from 'next/navigation';

interface UseUrlContextSyncOptions {
    /** `projectId` prop passed to ChatWidget — when set, it wins over the URL. */
    projectId?: string;
    contextProjectId: string | null | undefined;
    setProjectId: (id: string) => void;
}

interface UseUrlContextSyncResult {
    pathname: string | null;
    searchParams: ReadonlyURLSearchParams | null;
}

/**
 * Keeps the global chat context's `projectId` in sync with either the
 * `projectId` prop (Dashboard usage) or the URL (`/dashboard/[id]` route
 * param, or `?projectId=` query param on the landing page).
 *
 * Also returns `pathname`/`searchParams` since callers (ChatWidget's
 * project-page guard, useCadIntent) need the same values.
 */
export function useUrlContextSync({
    projectId,
    contextProjectId,
    setProjectId,
}: UseUrlContextSyncOptions): UseUrlContextSyncResult {
    // Sync Prop
    useEffect(() => {
        if (typeof projectId !== 'undefined' && projectId !== contextProjectId) {
            setProjectId(projectId);
        }
    }, [projectId, contextProjectId, setProjectId]);

    // Sync URL (when in Global Mode / Landing Page)
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        // Only if not explicitly controlled by prop (standard Dashboard/Global behavior)
        if (projectId) return;
        if (!pathname) return;

        // Dashboard Route: /dashboard/[id]
        const match = pathname.match(/\/dashboard\/([^\/]+)/);
        if (match && match[1]) {
            const pathId = match[1];
            if (pathId !== contextProjectId && pathId !== 'new') {
                setProjectId(pathId);
            }
        }
        // Query Param: ?projectId=... (Landing Page)
        else {
            const queryId = searchParams?.get('projectId');
            if (queryId && queryId !== contextProjectId) {
                setProjectId(queryId);
            }
        }
    }, [pathname, searchParams, contextProjectId, setProjectId, projectId]);

    return { pathname, searchParams };
}
