import React from 'react';
import { ImagePreview } from '@/components/chat/ImagePreview';
import { GalleryCard } from '@/components/chat/GalleryCard';

interface ToolInvocation {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args?: any;
    result?: any;
}

interface ToolStatusProps {
    tool: ToolInvocation;
    onImageClick: (imageUrl: string) => void;
}

/**
 * Tool invocation status component
 * Displays loading states, results, and errors for AI tool calls
 * ✅ Memoized to prevent unnecessary re-renders
 */
export const ToolStatus = React.memo<ToolStatusProps>(({ tool, onImageClick }) => {
    // Loading state: Tool is being called
    if (tool.state === 'call') {
        if (tool.toolName === 'generate_render') {
            return (
                <div className="flex items-center gap-2 text-sm text-luxury-gold/70 italic mt-2">
                    <span className="animate-pulse">🎨</span>
                    Generando rendering...
                </div>
            );
        }

        if (tool.toolName === 'submit_lead_data') {
            return (
                <div className="text-sm text-luxury-gold/70 italic mt-2">
                    📝 Salvando i tuoi dati...
                </div>
            );
        }

        if (tool.toolName === 'analyze_room' || tool.toolName === 'analyze_media_triage') {
            return (
                <div className="flex flex-col gap-1 mt-2 p-3 bg-luxury-gold/5 border border-luxury-gold/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-luxury-gold font-medium">
                        <span className="animate-pulse text-lg">🧠</span>
                        Agentic Vision in corso...
                    </div>
                    <div className="text-xs text-luxury-gold/60 pl-7">
                        <span className="animate-pulse">⚡</span> Analisi parametri strutturali
                    </div>
                </div>
            );
        }

        // Fallback for any other tool
        return (
            <div className="flex items-center gap-2 text-sm text-luxury-gold/70 italic mt-2 relative overflow-hidden rounded-md px-2 py-1">
                <div className="absolute inset-0 animate-shimmer opacity-20 pointer-events-none" />
                <span className="animate-pulse">⚙️</span>
                Elaborazione in corso...
            </div>
        );
    }

    // Completed state: Tool finished with result
    if (tool.state === 'result') {
        const result = tool.result || (tool as any).output;


        // Gallery: Project images
        if (tool.toolName === 'show_project_gallery') {
            try {
                const galleryData = typeof result === 'string' ? JSON.parse(result) : result;
                if (galleryData?.type === 'gallery' && galleryData?.items) {
                    return (
                        <div className="mt-3">
                            <GalleryCard
                                items={galleryData.items}
                                projectId={galleryData.projectId}
                            />
                        </div>
                    );
                }
            } catch (e) {
                console.error('[ToolStatus] Failed to parse gallery data:', e);
                // Fall through to text rendering
            }
        }

        // Success: Image generated
        if (result?.imageUrl) {
            return (
                <div className="mt-3">
                    <ImagePreview
                        src={result.imageUrl}
                        alt={result.description || 'Rendering generato'}
                        onClick={onImageClick}
                        className="w-full"
                    />
                </div>
            );
        }

        // Error: Tool failed
        if (result?.error || result?.status === 'error') {
            return (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    <p className="font-medium">Errore generazione immagine:</p>
                    <p>{result?.error || 'Si è verificato un errore sconosciuto.'}</p>
                </div>
            );
        }
    }

    return null;
});
