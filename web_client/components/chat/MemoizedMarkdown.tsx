import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { splitMarkdownBlocks } from '@/lib/chat/markdown-blocks';

// Fix for React 18/19 type mismatch
const Markdown = ReactMarkdown as React.ComponentType<React.ComponentProps<typeof ReactMarkdown>>;

type RemarkPlugins = React.ComponentProps<typeof ReactMarkdown>['remarkPlugins'];

/** Rewrites (or blanks) every link URL of a message. */
export type UrlTransform = (url: string) => string;

/**
 * Only http(s), relative, anchor and mailto links survive (no javascript:,
 * data:, tel:). A `tel:` link exists only for the company numbers, allowed by
 * the caller's own transform (MessageItem): never one the model writes.
 */
export const safeUrlTransform: UrlTransform = (value) =>
    /^(https?:\/\/|\/|#|mailto:)/i.test(value) ? value : '';

interface BlockProps {
    content: string;
    components?: Components;
    remarkPlugins?: RemarkPlugins;
    urlTransform: UrlTransform;
}

const MarkdownBlock = React.memo<BlockProps>(({ content, components, remarkPlugins, urlTransform }) => (
    <Markdown urlTransform={urlTransform} components={components} remarkPlugins={remarkPlugins}>
        {content}
    </Markdown>
));
MarkdownBlock.displayName = 'MarkdownBlock';

interface MemoizedMarkdownProps {
    children: string;
    components?: Components;
    /** Keep the reference stable (useMemo): a new array re-renders every finished block. */
    remarkPlugins?: RemarkPlugins;
    /** Defaults to `safeUrlTransform`. Keep the reference stable too. */
    urlTransform?: UrlTransform;
}

/**
 * Markdown rendered block by block. While a reply streams in, only the block
 * being written re-renders; finished blocks keep their memoized output, so the
 * cost per update no longer grows with the length of the message.
 */
export const MemoizedMarkdown = React.memo<MemoizedMarkdownProps>(({ children, components, remarkPlugins, urlTransform = safeUrlTransform }) => {
    const blocks = useMemo(() => splitMarkdownBlocks(children), [children]);
    return (
        <>
            {blocks.map((block, index) => (
                // Blocks only grow at the end of a streaming message: the index is a stable key.
                <MarkdownBlock
                    key={index}
                    content={block}
                    components={components}
                    remarkPlugins={remarkPlugins}
                    urlTransform={urlTransform}
                />
            ))}
        </>
    );
});
MemoizedMarkdown.displayName = 'MemoizedMarkdown';
