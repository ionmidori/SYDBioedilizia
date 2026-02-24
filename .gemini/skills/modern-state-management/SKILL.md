---
name: modern-state-management
description: Implement modern state management patterns using TanStack Query (Server State) and Zustand (Client State). Use when creating data-fetching layers, managing global UI state, or optimizing application performance.
---

# Modern State Management

This skill provides patterns for managing state in Next.js applications, distinguishing strictly between Server State (async data) and Client State (UI config).

## Core Principles

1.  **Server State is not Global State**: Do not put API data into Redux or Zustand. Use TanStack Query.
2.  **Client State is Minimal**: Use Zustand only for truly global UI state (e.g., sidebar open, theme, cart).
3.  **URL as State**: Prefer URL search params for shareable state (filters, pagination) over Zustand.

## 1. Server State: TanStack Query (v5)

Use for all async operations: fetching, caching, synchronizing, and updating server state.

### Setup (Provider)

Ensure you have a `QueryClientProvider` wrapping your app.

### Data Fetching Pattern

Create custom hooks to encapsulate query logic.

```tsx
// hooks/use-projects.ts
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/lib/api'; // Typed API call

export function useProjects(status?: string) {
  return useQuery({
    queryKey: ['projects', { status }], // Dependency array is crucial
    queryFn: () => getProjects(status),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
```

### Mutations & Optimistic Updates

For interactions that change data (POST/PUT/DELETE).

```tsx
// hooks/use-create-project.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProject,
    onMutate: async (newProject) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      // Snapshot previous value
      const previousProjects = queryClient.getQueryData(['projects']);
      // Optimistically update
      queryClient.setQueryData(['projects'], (old: any) => [...old, newProject]);
      return { previousProjects };
    },
    onError: (err, newProject, context) => {
      // Rollback
      queryClient.setQueryData(['projects'], context?.previousProjects);
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

## 2. Client State: Zustand

Use for global UI state that doesn't need to persist in the URL or Database.

### Store Pattern

Create small, specific stores rather than one giant store.

```tsx
// stores/use-ui-store.ts
import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  closeSidebar: () => set({ isSidebarOpen: false }),
}));
```

### Usage

```tsx
// Component.tsx
import { useUIStore } from '@/stores/use-ui-store';

export function SidebarToggle() {
  const toggle = useUIStore((state) => state.toggleSidebar);
  return <button onClick={toggle}>Menu</button>;
}
```

## 3. URL State (Nuqs or Native)

For state that should be shareable (filters, sorting).

```tsx
import { useSearchParams } from 'next/navigation';

// Read
const searchParams = useSearchParams();
const category = searchParams.get('category');

// Write (via Link or router.push)
// <Link href="?category=design">Design</Link>
```

## Checklist for Implementation

- [ ] Identify if state is Server (API) or Client (UI).
- [ ] For Server: Create a `useQuery` hook with proper keys.
- [ ] For Server Mutations: Implement `onMutate` for instant feedback.
- [ ] For Client: Create a Zustand store in `src/stores/`.
- [ ] For Filters: Move state to URL params first before considering Zustand.
