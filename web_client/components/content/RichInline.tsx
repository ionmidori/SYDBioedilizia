import { Fragment } from "react";

/**
 * Renders inline content from structured data (FAQ answers, blog articles).
 *
 * Security: output is React elements and text nodes only — no
 * dangerouslySetInnerHTML. `**bold**` markers become <strong>, `\n` becomes
 * <br/>; any other markup in the source is shown literally, never parsed.
 */
export function RichInline({
  text,
  strongClassName,
}: {
  text: string;
  strongClassName?: string;
}) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {/* Even indices are plain text, odd indices are bold. */}
          {line.split("**").map((segment, si) =>
            si % 2 === 1 ? (
              <strong key={si} className={strongClassName}>
                {segment}
              </strong>
            ) : (
              <Fragment key={si}>{segment}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}
