'use client';

import { BlocksEditor } from '@/components/admin/company/BlocksEditor';
import { fieldId } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';

/** How the site visit works: what the assistant tells a customer who asks for it. */
export function SiteVisitTab({ info, onChange, issues }: TabProps) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-ink-muted">
                Il sopralluogo si chiede dopo aver ricevuto il preventivo: scrivilo qui come vuoi che lo dica l&apos;assistente.
            </p>
            <BlocksEditor
                id={fieldId('site_visit')}
                label="Come funziona il sopralluogo"
                value={info.site_visit}
                onChange={(site_visit) => onChange({ site_visit })}
                issues={issues}
            />
        </div>
    );
}
