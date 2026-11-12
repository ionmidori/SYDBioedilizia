'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { CheckCircle2, History, Loader2, Save } from 'lucide-react';

import { CompanyHistoryPanel } from '@/components/admin/company/CompanyHistoryPanel';
import { CompanyTabs, panelId, tabId } from '@/components/admin/company/CompanyTabs';
import { AreaTab } from '@/components/admin/company/tabs/AreaTab';
import { HoursTab } from '@/components/admin/company/tabs/HoursTab';
import { IdentityTab } from '@/components/admin/company/tabs/IdentityTab';
import { QuoteTermsTab } from '@/components/admin/company/tabs/QuoteTermsTab';
import { ServicesTab } from '@/components/admin/company/tabs/ServicesTab';
import { SiteVisitTab } from '@/components/admin/company/tabs/SiteVisitTab';
import type { TabProps } from '@/components/admin/company/types';
import { SaveDialog } from '@/components/admin/SaveDialog';
import { useCompanyInfo, useSaveCompanyInfo } from '@/hooks/admin/use-admin';
import { useUnsavedGuard } from '@/hooks/admin/use-unsaved-guard';
import {
    changedParts,
    COMPANY_TABS,
    PART_LABELS,
    validateCompanyInfo,
    type CompanyIssue,
    type CompanyTab,
} from '@/lib/admin/company-info-logic';
import type { CompanyInfo } from '@/types/company-info';

/** Placeholder of a tab not built yet: replaced as the tabs land. */
function ComingSoon() {
    return <p className="text-sm text-ink-muted">Questa scheda sarà disponibile a breve.</p>;
}

const TAB_COMPONENTS: Record<CompanyTab, ComponentType<TabProps>> = {
    identity: IdentityTab,
    hours: HoursTab,
    area: AreaTab,
    services: ServicesTab,
    site_visit: SiteVisitTab,
    quote_terms: QuoteTermsTab,
    sections: ComingSoon,
    faq: ComingSoon,
    about: ComingSoon,
};

const MAX_ISSUES_SHOWN = 8;

/**
 * Unsaved edits, tied to the version they started from. `savedAs` is the ETag the server returned
 * for them: the draft stays on screen until the refetched company info carries it, so a save never
 * flashes the old data.
 */
interface Draft {
    baseEtag: string;
    savedAs: string | null;
    info: CompanyInfo;
}

const tabLabel = (tab: CompanyTab) => COMPANY_TABS.find((t) => t.id === tab)?.label ?? tab;

/**
 * The true facts about SYD, edited here and nowhere else: the site, the quotes and the assistant
 * read them. Every save is versioned (If-Match) and recorded with who, when and why.
 */
export function CompanyInfoEditor() {
    const query = useCompanyInfo();
    const save = useSaveCompanyInfo();

    const [draft, setDraft] = useState<Draft | null>(null);
    const [tab, setTab] = useState<CompanyTab>('identity');
    const [showErrors, setShowErrors] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    // Id of the element to focus after the next render (the first bad field…).
    const focusAfterRender = useRef<string | null>(null);

    const saved = query.data?.info;
    const etag = query.data?.etag ?? '';
    const activeDraft = draft && draft.savedAs && draft.savedAs === etag ? null : draft;
    const awaitingRefresh = !!activeDraft?.savedAs && query.isFetching;
    const info = activeDraft?.info ?? saved;
    const parts = useMemo(() => (saved && activeDraft ? changedParts(saved, activeDraft.info) : []), [saved, activeDraft]);
    const dirty = parts.length > 0;
    const issues = useMemo(() => (info ? validateCompanyInfo(info) : []), [info]);

    // Closing the tab, reloading or using the console menu asks first while edits are unsaved.
    useUnsavedGuard('company-info', dirty);
    useEffect(() => {
        const id = focusAfterRender.current;
        if (!id) return;
        focusAfterRender.current = null;
        const target = document.getElementById(id) ?? document.getElementById(panelId(tab));
        target?.focus();
        target?.scrollIntoView?.({ block: 'center' });
    });

    if (query.isPending) {
        return (
            <div className="py-16 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-accent-ink" aria-label="Caricamento" />
            </div>
        );
    }
    if (query.isError || !info || !saved) {
        return (
            <div role="alert" className="py-10 text-center text-sm text-danger-ink">
                Impossibile caricare la scheda società. Riprova tra poco.
            </div>
        );
    }

    const stale = activeDraft !== null && !awaitingRefresh && activeDraft.baseEtag !== etag;
    const busy = awaitingRefresh || save.isPending;
    const shownIssues: CompanyIssue[] = showErrors ? issues : [];
    const errorTabs = new Set(shownIssues.map((issue) => issue.tab));
    const ActiveTab = TAB_COMPONENTS[tab];

    const edit = (patch: Partial<CompanyInfo>) => {
        setNotice(null);
        // Built on the version the server returned for the previous save, if its refetch has not arrived yet.
        setDraft({ baseEtag: activeDraft?.savedAs ?? activeDraft?.baseEtag ?? etag, savedAs: null, info: { ...info, ...patch } });
    };

    const reload = () => {
        setDraft(null);
        setShowErrors(false);
        setNotice(null);
        save.reset();
        void query.refetch();
    };

    const jumpTo = (issue: CompanyIssue) => {
        setTab(issue.tab);
        focusAfterRender.current = issue.fieldId;
    };

    const startSave = () => {
        if (issues.length > 0) {
            setShowErrors(true);
            jumpTo(issues[0]);
            return;
        }
        setSaveOpen(true);
    };

    const confirmSave = (reason: string | null) => {
        if (!activeDraft || stale) return;
        save.mutate(
            { etag, body: { info: activeDraft.info, reason } },
            {
                onSuccess: (result) => {
                    setDraft((prev) => (prev ? { ...prev, savedAs: result.etag } : prev));
                    setSaveOpen(false);
                    setShowErrors(false);
                    setNotice(`Salvato (versione ${result.version}). Il sito e l'assistente si aggiornano entro qualche minuto.`);
                },
            },
        );
    };

    const { source, version, ignored_document: ignored } = query.data;

    return (
        <section className="space-y-5" aria-labelledby="company-title" data-testid="company-info">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 id="company-title" className="text-2xl font-semibold">
                        Società
                    </h1>
                    <p className="text-sm text-ink-muted">
                        Le informazioni vere di SYD: le usano il sito, i preventivi e l&apos;assistente · versione {version}
                        {source === 'seed' ? ' (dati iniziali, mai modificati)' : ''}.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setHistoryOpen((open) => !open)}
                    aria-pressed={historyOpen}
                    className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-xl border border-line text-sm hover:bg-surface cursor-pointer"
                >
                    <History className="w-4 h-4" aria-hidden /> Storico
                </button>
            </div>

            {ignored ? (
                <p role="status" data-testid="company-ignored" className="rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-ink">
                    La scheda salvata non era valida ed è stata ignorata: stai vedendo i dati iniziali. Salvando la sostituisci.
                </p>
            ) : (
                source === 'seed' && (
                    <p role="status" data-testid="company-seed" className="rounded-xl border border-info/30 bg-info-subtle px-4 py-3 text-sm text-info-ink">
                        Sono i dati iniziali: il primo salvataggio crea la scheda.
                    </p>
                )
            )}
            {notice && (
                <p role="status" data-testid="notice" className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle px-4 py-3 text-sm text-success-ink">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> {notice}
                </p>
            )}
            {stale && (
                <div role="alert" data-testid="stale-banner" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-ink">
                    <span className="flex-1 min-w-[12rem]">
                        La scheda è stata modificata da un altro admin: le tue modifiche non salvate partono da una versione precedente.
                    </span>
                    <button type="button" onClick={reload} className="min-h-11 px-3 py-1.5 rounded-lg border border-warning/40 hover:bg-warning-subtle cursor-pointer">
                        Scarta le mie modifiche e ricarica
                    </button>
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                    <CompanyTabs active={tab} onSelect={setTab} errorTabs={errorTabs} />
                </div>
                <div className="flex items-center gap-2">
                    {dirty && (
                        <button
                            type="button"
                            onClick={reload}
                            disabled={busy}
                            data-testid="company-discard"
                            className="min-h-11 px-3 py-2 rounded-xl border border-line text-sm hover:bg-surface disabled:opacity-50 cursor-pointer"
                        >
                            Annulla modifiche
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={startSave}
                        disabled={!dirty || stale || busy}
                        data-testid="company-save"
                        className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-on-accent text-sm font-medium disabled:opacity-50 cursor-pointer"
                    >
                        <Save className="w-4 h-4" aria-hidden />
                        Salva{dirty ? ` (${parts.length})` : ''}
                    </button>
                </div>
            </div>

            {shownIssues.length > 0 && (
                <div role="alert" data-testid="company-issues" className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-ink">
                    <p className="font-medium">Correggi questi punti prima di salvare ({shownIssues.length}):</p>
                    <ul className="mt-1 space-y-0.5">
                        {shownIssues.slice(0, MAX_ISSUES_SHOWN).map((issue) => (
                            <li key={`${issue.fieldId}-${issue.message}`}>
                                <button type="button" onClick={() => jumpTo(issue)} className="text-left underline cursor-pointer">
                                    {tabLabel(issue.tab)} — {issue.message}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {shownIssues.length > MAX_ISSUES_SHOWN && <p className="mt-1">…e altri {shownIssues.length - MAX_ISSUES_SHOWN}.</p>}
                </div>
            )}

            <div
                role="tabpanel"
                id={panelId(tab)}
                aria-labelledby={tabId(tab)}
                tabIndex={-1}
                className="focus:outline-hidden"
            >
                <fieldset disabled={busy} className="contents" aria-label={tabLabel(tab)}>
                    <ActiveTab info={info} onChange={edit} issues={shownIssues} />
                </fieldset>
            </div>

            {historyOpen && <CompanyHistoryPanel />}

            <SaveDialog
                open={saveOpen}
                onOpenChange={(open) => {
                    setSaveOpen(open);
                    if (!open) save.reset();
                }}
                title="Salvare la scheda società?"
                description="Il sito e l'assistente useranno i nuovi dati entro qualche minuto. Ogni versione resta nello storico."
                summary={
                    <div data-testid="save-parts" className="rounded-xl border border-line px-3 py-2 text-sm">
                        <p className="text-xs text-ink-muted">Parti modificate</p>
                        <ul className="list-disc pl-5">
                            {parts.map((part) => (
                                <li key={part}>{PART_LABELS[part]}</li>
                            ))}
                        </ul>
                    </div>
                }
                confirmLabel="Salva scheda"
                reasonPlaceholder="Es. Orari estivi"
                pending={save.isPending}
                error={save.error}
                onConfirm={confirmSave}
                onReload={() => {
                    setSaveOpen(false);
                    reload();
                }}
            />
        </section>
    );
}
