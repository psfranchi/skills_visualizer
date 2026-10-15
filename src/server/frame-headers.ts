/** UI responses must not be framed by other sites (clickjacking); used by dev and serve. */
export const FRAME_HEADERS: Readonly<Record<string, string>> = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};
