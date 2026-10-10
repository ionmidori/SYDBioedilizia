import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { splitMarkdownBlocks } from '@/lib/chat/markdown-blocks';

// Fix for React 18/19 type mismatch
const Markdown = ReactMarkdown as React.ComponentType<React.ComponentProps<typeof ReactMarkdown>>;

/** Only http(s), relative, anchor and mailto links survive (no javascript:, data:). */
export const safeUrlTransform = (value: string): string =>
    /^(https?:\/\/|\/|#|mailto:)/i.test(value) ? value : '';

interface BlockProps {
    content: string;
    components?: Components;
}

const MarkdownBlock = React.memo<BlockProps>(({ content, components }) => (
    <Markdown urlTransform={safeUrlTransform} components={components}>
        {content}
    </Markdown>
));
MarkdownBlock.displayName = 'MarkdownBlock';

interface MemoizedMarkdownProps {
    children: string;
    components?: Components;
}

/**
 * Markdown rendered block by block. While a reply streams in, only the block
 * being written re-renders; finished blocks keep their memoized output, so the
 * cost per update no longer grows with the length of the message.
 */
export const MemoizedMarkdown = React.memo<MemoizedMarkdownProps>(({ children, components }) => {
    const blocks = useMemo(() => splitMarkdownBlocks(children), [children]);
    return (
        <>
            {blocks.map((block, index) => (
                // Blocks only grow at the end of a streaming message: the index is a stable key.
                <MarkdownBlock key={index} content={block} components={components} />
            ))}
        </>
    );
});
MemoizedMarkdown.displayName = 'MemoizedMarkdown';
