/** Public site URL used in share links. */
export const SITE_URL = "https://tokens.do";

export function shareText(rank: number): string {
  return `I'm world #${rank.toLocaleString("en-US")} token maxxer!`;
}

/**
 * X's post composer, pre-filled. X appends the URL to the text and renders it as a link card.
 * Encoded with encodeURIComponent (not URLSearchParams) so spaces are %20 and "#" is %23 —
 * an unencoded "#" would cut the text off at the rank.
 */
export function shareOnXUrl(rank: number): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(shareText(rank))}&url=${encodeURIComponent(SITE_URL)}`;
}
