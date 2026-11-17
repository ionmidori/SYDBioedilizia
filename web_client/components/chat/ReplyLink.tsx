import type { Components } from 'react-markdown';

const WEB_PAGE = /^https?:\/\//i;

/**
 * A link in an assistant reply. A web page (wa.me included) opens in a new tab, so the
 * chat stays open; `tel:`, `mailto:` and site paths keep their usual behavior. `href`
 * has already passed the url transform. `node` (react-markdown's AST) is not passed on.
 */
export const ReplyLink: NonNullable<Components['a']> = ({ href, title, children }) => {
    const external = href !== undefined && WEB_PAGE.test(href);
    return (
        <a href={href} title={title} {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>
            {children}
        </a>
    );
};
