import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MediaAsset } from '@/lib/media-utils';

interface HouseFiles {
    /** Newest first. */
    assets: MediaAsset[];
    /** The first snapshot of this chat arrived (or failed). */
    loaded: boolean;
    error: string | null;
}

const NOT_LOADED: HouseFiles = { assets: [], loaded: false, error: null };
const NO_FIRESTORE: HouseFiles = {
    assets: [],
    loaded: true,
    error: 'Non riusciamo a leggere i file della tua casa. Ricarica la pagina per riprovare.',
};

function toAsset(chatId: string, snap: QueryDocumentSnapshot<DocumentData>): MediaAsset {
    const data = snap.data();
    const uploadedAt: Date = data.uploadedAt?.toDate?.() ?? new Date();
    return {
        id: snap.id,
        type: data.type === 'document' ? 'quote' : data.type,
        url: data.url,
        thumbnail: data.type === 'image' ? data.url : undefined,
        title: data.name,
        createdAt: uploadedAt,
        timestamp: uploadedAt,
        metadata: {
            size: data.size,
            uploadedBy: data.uploadedBy,
            projectId: chatId,
            roomId: typeof data.roomId === 'string' ? data.roomId : null,
        },
    };
}

/**
 * The media of the house, live: every file of the user's chat — photos and
 * videos sent in the chat, renders, uploads from the dashboard — each with its
 * room (`projects/{chatId}/files`).
 *
 * ADR-001: documented onSnapshot exception. The data is the user's own and
 * read-only here; every write goes through the backend.
 * See: docs/ADR/ADR-001-realtime-onSnapshot-vs-SSE.md
 */
export function useHouseFiles(chatId: string | null): HouseFiles {
    const [state, setState] = useState<HouseFiles & { chatId: string | null }>({ ...NOT_LOADED, chatId: null });

    useEffect(() => {
        if (!chatId || !db) return;
        const files = query(collection(db, 'projects', chatId, 'files'), orderBy('uploadedAt', 'desc'));
        return onSnapshot(
            files,
            (snapshot) => setState({
                chatId, loaded: true, error: null, assets: snapshot.docs.map((snap) => toAsset(chatId, snap)),
            }),
            (error) => {
                console.error('[useHouseFiles] onSnapshot error:', error.code, error.message);
                setState({
                    chatId,
                    loaded: true,
                    assets: [],
                    error: error.code === 'permission-denied'
                        ? 'Non hai i permessi per vedere i file della tua casa.'
                        : 'Errore durante l\'aggiornamento dei file in tempo reale.',
                });
            },
        );
    }, [chatId]);

    if (!chatId) return NOT_LOADED;
    if (!db) return NO_FIRESTORE;
    if (state.chatId !== chatId) return NOT_LOADED;
    return { assets: state.assets, loaded: state.loaded, error: state.error };
}
