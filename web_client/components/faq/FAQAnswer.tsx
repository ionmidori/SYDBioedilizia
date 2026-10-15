import type { FaqBlock, FaqInline } from "@/lib/faq-data";
import { RichInline } from "@/components/content/RichInline";

/**
 * Renders a FAQ answer from structured blocks.
 *
 * Security: content is rendered exclusively through React elements and text
 * nodes — there is NO dangerouslySetInnerHTML anywhere in this path. Inline
 * `**bold**` markers are converted to <strong> by RichInline; everything else is
 * plain text, so any stray HTML in the source data would be shown literally.
 */
const renderInline = (text: FaqInline) => <RichInline text={text} />;

export function FAQAnswer({ blocks }: { blocks: FaqBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "lead":
            return (
              <p key={i} className="font-medium text-lg mb-2">
                {renderInline(block.text)}
              </p>
            );
          case "p":
            return (
              <p key={i} className="mt-2">
                {renderInline(block.text)}
              </p>
            );
          case "note":
            return (
              <p key={i} className="mt-2 text-sm text-muted-foreground">
                {renderInline(block.text)}
              </p>
            );
          case "callout":
            return (
              <p key={i} className="mt-2 font-semibold">
                {renderInline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc pl-5 space-y-1 mt-2">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal pl-5 space-y-1 mt-2">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "definitions":
            return (
              <div key={i} className="mt-3 space-y-3">
                {block.items.map((def, j) => (
                  <div key={j}>
                    <strong className="text-primary">{renderInline(def.term)}</strong>
                    <p className="text-sm">{renderInline(def.description)}</p>
                  </div>
                ))}
              </div>
            );
        }
      })}
    </>
  );
}
