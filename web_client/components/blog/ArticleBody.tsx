import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { RichInline } from "@/components/content/RichInline";
import type { BlogBlock, KeyPointIcon } from "@/lib/blog/types";

/**
 * Renders an article body from typed blocks (Server Component).
 * Classes follow the former hand-written pages with a few deliberate
 * uniformations: one warning-callout style (the "costi" article had its own box
 * and "bonus" a bare <div>), one spacing for lists, one h3 style, and the
 * same FAQ card style in every article ("umidita" had richer cards).
 * Heading levels are unchanged, including the h1 -> h3 jump of key-point boxes.
 */

const ICONS: Record<KeyPointIcon, React.ReactNode> = {
  check: (
    <CheckCircle2
      className="w-5 h-5 text-success-ink shrink-0 mt-0.5"
      aria-hidden="true"
    />
  ),
  file: (
    <FileText
      className="w-5 h-5 text-info-ink shrink-0 mt-0.5"
      aria-hidden="true"
    />
  ),
  alert: (
    <AlertTriangle
      className="w-5 h-5 text-warning-ink shrink-0 mt-0.5"
      aria-hidden="true"
    />
  ),
};

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "lead":
      return (
        <p className="lead text-xl text-ink mb-8">
          <RichInline text={block.text} />
        </p>
      );
    case "h2":
      return (
        <h2 className="text-2xl font-serif font-bold mt-10 mb-4 text-ink">
          <RichInline text={block.text} />
        </h2>
      );
    case "h3":
      return (
        <h3 className="text-xl font-serif font-semibold mt-7 mb-3 text-ink">
          <RichInline text={block.text} />
        </h3>
      );
    case "p":
      return (
        <p>
          <RichInline text={block.text} />
        </p>
      );
    case "ul":
      return (
        <ul className="list-disc pl-6 mb-6 space-y-2">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichInline text={item} />
            </li>
          ))}
        </ul>
      );
    case "callout":
      return block.tone === "warning" ? (
        <div
          role="note"
          className="bg-warning-subtle border border-warning/30 rounded-xl p-4 my-6 text-sm text-warning-ink not-prose"
        >
          <p>
            <RichInline text={block.text} />
          </p>
        </div>
      ) : (
        <div
          role="note"
          className="bg-surface-muted/50 border border-line p-6 rounded-xl my-6"
        >
          {block.title && (
            <h4 className="font-bold text-lg mb-2">
              <RichInline text={block.title} />
            </h4>
          )}
          <p className="mb-0">
            <RichInline text={block.text} />
          </p>
        </div>
      );
    case "keyPoints":
      return (
        <div className="bg-surface border border-line rounded-xl p-6 md:p-8 my-8 shadow-sm not-prose">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            📌 {block.heading}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {block.items.map((item, i) => (
              <div key={i} className="flex gap-3">
                {ICONS[item.icon]}
                <div>
                  <strong className="block text-ink text-sm">
                    {item.title}
                  </strong>
                  <span className="text-sm text-ink-muted">
                    <RichInline text={item.text} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "takeaways":
      return (
        <div className="bg-surface border border-line p-6 my-8 rounded-xl shadow-xs not-prose">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            📌 {block.heading}
          </h3>
          <ul className="space-y-2 text-ink-muted">
            {block.items.map((item, i) => (
              <li key={i}>
                <RichInline text={item} strongClassName="text-ink" />
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

export function ArticleBody({ blocks }: { blocks: readonly BlogBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}
