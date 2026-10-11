'use client';

import { useEffect } from 'react';

import { setUnsaved } from '@/lib/admin/unsaved-guard';

/** While `unsaved`: the browser asks before a reload/close, and the console nav asks before leaving. */
export function useUnsavedGuard(key: string, unsaved: boolean): void {
  useEffect(() => {
    setUnsaved(key, unsaved);
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      setUnsaved(key, false);
    };
  }, [key, unsaved]);
}
