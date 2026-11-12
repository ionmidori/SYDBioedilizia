import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { splitMarkdownBlocks } from '@/lib/chat/markdown-blocks';

// Fix for React 18/19 type mismatch
const Markdown = ReactMarkdown as React.ComponentType<React.ComponentProps<typeof ReactMarkdown>>;

type RemarkPlugins = React.ComponentProps<typeof ReactMarkdown>['remarkPlugins'];

/**
 * Only http(s), relative, anchor, mailto and plain `tel:` links survive (no
 * javascript:, data:). `tel:` takes a phone number only: "+" and digits.
 */
export const safeUrlTransform = (value: string): string =>
    /^(https?:\/\/|\/|#|mailto:)/i.test(value) || /^tel:\+?\d{3,20}$/i.test(value) ? value : '';

interface BlockProps {
    content: string;
    components?: Components;
    remarkPlugins?: RemarkPlugins;
}

const MarkdownBlock = React.memo<BlockProps>(({ content, components, remarkPlugins }) => (
    <Markdown urlTransform={safeUrlTransform} components={components} remarkPlugins={remarkPlugins}>
        {content}
    </Markdown>
));
MarkdownBlock.displayName = 'MarkdownBlock';

interface MemoizedMarkdownProps {
    children: string;
    components?: Components;
    /** Keep the reference stable (useMemo): a new array re-renders every finished block. */
    remarkPlugins?: RemarkPlugins;
}

/**
 * Markdown rendered block by block. While a reply streams in, only the block
 * being written re-renders; finished blocks keep their memoized output, so the
 * cost per update no longer grows with the length of the message.
 */
export const MemoizedMarkdown = React.memo<MemoizedMarkdownProps>(({ children, components, remarkPlugins }) => {
    const blocks = useMemo(() => splitMarkdownBlocks(children), [children]);
    return (
        <>
            {blocks.map((block, index) => (
                // Blocks only grow at the end of a streaming message: the index is a stable key.
                <MarkdownBlock key={index} content={block} components={components} remarkPlugins={remarkPlugins} />
            ))}
        </>
    );
});
MemoizedMarkdown.displayName = 'MemoizedMarkdown';
