import { renderHook } from '@testing-library/react';
import { useUrlContextSync } from '../useUrlContextSync';

let mockPathname = '/';
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
    useSearchParams: () => mockSearchParams,
}));

function renderSync(overrides: { projectId?: string; contextProjectId?: string | null } = {}) {
    const setProjectId = jest.fn();
    const rendered = renderHook(
        (props: { projectId?: string; contextProjectId?: string | null }) =>
            useUrlContextSync({ ...props, setProjectId }),
        { initialProps: { projectId: overrides.projectId, contextProjectId: overrides.contextProjectId ?? null } }
    );
    return { ...rendered, setProjectId };
}

beforeEach(() => {
    mockPathname = '/';
    mockSearchParams = new URLSearchParams();
});

describe('useUrlContextSync — prop sync', () => {
    it('adopts the projectId prop when it differs from context', () => {
        const { setProjectId } = renderSync({ projectId: 'proj-1', contextProjectId: null });
        expect(setProjectId).toHaveBeenCalledWith('proj-1');
    });

    it('does nothing when the prop already matches context', () => {
        const { setProjectId } = renderSync({ projectId: 'proj-1', contextProjectId: 'proj-1' });
        expect(setProjectId).not.toHaveBeenCalled();
    });

    it('does nothing when no projectId prop is provided', () => {
        const { setProjectId } = renderSync({ contextProjectId: null });
        expect(setProjectId).not.toHaveBeenCalled();
    });
});

describe('useUrlContextSync — URL sync (no prop)', () => {
    it('adopts the id from a /dashboard/[id] path', () => {
        mockPathname = '/dashboard/proj-42';
        const { setProjectId } = renderSync({ contextProjectId: null });
        expect(setProjectId).toHaveBeenCalledWith('proj-42');
    });

    it('ignores the literal "new" segment on /dashboard/new', () => {
        mockPathname = '/dashboard/new';
        const { setProjectId } = renderSync({ contextProjectId: null });
        expect(setProjectId).not.toHaveBeenCalled();
    });

    it('does not re-sync when the path id already matches context', () => {
        mockPathname = '/dashboard/proj-42';
        const { setProjectId } = renderSync({ contextProjectId: 'proj-42' });
        expect(setProjectId).not.toHaveBeenCalled();
    });

    it('adopts ?projectId= on non-dashboard routes', () => {
        mockPathname = '/';
        mockSearchParams = new URLSearchParams('projectId=proj-9');
        const { setProjectId } = renderSync({ contextProjectId: null });
        expect(setProjectId).toHaveBeenCalledWith('proj-9');
    });

    it('does not sync when there is no query param and no dashboard match', () => {
        mockPathname = '/';
        mockSearchParams = new URLSearchParams();
        const { setProjectId } = renderSync({ contextProjectId: null });
        expect(setProjectId).not.toHaveBeenCalled();
    });

    it('is skipped entirely when a projectId prop is set (prop wins over URL)', () => {
        mockPathname = '/dashboard/from-url';
        const { setProjectId } = renderSync({ projectId: 'from-prop', contextProjectId: null });
        expect(setProjectId).toHaveBeenCalledWith('from-prop');
        expect(setProjectId).not.toHaveBeenCalledWith('from-url');
    });
});

describe('useUrlContextSync — return value', () => {
    it('returns pathname and searchParams for callers that also need them', () => {
        mockPathname = '/dashboard/proj-1';
        mockSearchParams = new URLSearchParams('intent=cad');
        const { result } = renderSync({ contextProjectId: 'proj-1' });

        expect(result.current.pathname).toBe('/dashboard/proj-1');
        expect(result.current.searchParams?.get('intent')).toBe('cad');
    });
});
