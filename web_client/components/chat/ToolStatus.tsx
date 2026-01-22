import React from 'react';
import { ImagePreview } from '@/components/chat/ImagePreview';

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
                <div className="flex items-center gap-2 text-sm text-slate-400 italic mt-2">
                    <span className="animate-pulse">🎨</span>
                    Generando rendering...
                </div>
            );
        }

        if (tool.toolName === 'submit_lead_data') {
            return (
                <div className="text-sm text-slate-400 italic mt-2">
                    📝 Salvando i tuoi dati...
                </div>
            );
        }

        if (tool.toolName === 'analyze_room') {
            return (
                <div className="flex items-center gap-2 text-sm text-slate-400 italic mt-2">
                    <span className="animate-spin">🔍</span>
                    Analisi della stanza in corso...
                </div>
            );
        }

        return null;
    }

    // Completed state: Tool finished with result
    if (tool.state === 'result') {
        const result = tool.result || (tool as any).output;

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
