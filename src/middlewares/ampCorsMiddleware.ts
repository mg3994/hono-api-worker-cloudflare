import { MiddlewareHandler } from 'hono';

/**
 * Middleware that provides dynamic CORS and AMP for Email header handling.
 * Gmail, Outlook, Yahoo, and AMP Email proxy renderers include the `__amp_source_origin`
 * query parameter. The server MUST dynamically echo `__amp_source_origin` back in the
 * `AMP-Access-Control-Allow-Source-Origin` header and expose it via `Access-Control-Expose-Headers`.
 *
 * CORS SPECIFICATION SAFETY RULES:
 * 1. Never combine `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`.
 * 2. If `__amp_source_origin` is present, `Access-Control-Allow-Origin` must always be explicitly set
 *    to the request's `Origin` or fall back to `ampSourceOrigin` if `Origin` header is missing.
 */
export const ampCorsMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const ampSourceOrigin = c.req.query('__amp_source_origin');
    const requestOrigin = c.req.header('Origin');

    // Determine the exact origin to echo (never wildcard '*' when credentials are true)
    const allowOrigin = requestOrigin || ampSourceOrigin || '';

    // Handle OPTIONS Preflight Requests
    if (c.req.method === 'OPTIONS') {
      const responseHeaders: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, __amp_source_origin',
      };

      if (allowOrigin) {
        responseHeaders['Access-Control-Allow-Origin'] = allowOrigin;
        responseHeaders['Access-Control-Allow-Credentials'] = 'true';
      } else {
        responseHeaders['Access-Control-Allow-Origin'] = '*';
      }

      if (ampSourceOrigin) {
        responseHeaders['AMP-Access-Control-Allow-Source-Origin'] = ampSourceOrigin;
        responseHeaders['Access-Control-Expose-Headers'] =
          'AMP-Access-Control-Allow-Source-Origin, Access-Control-Allow-Origin, Access-Control-Allow-Credentials';
      }

      return new Response(null, {
        status: 204,
        headers: responseHeaders,
      });
    }

    await next();

    // Dynamically inject CORS & AMP headers into the outgoing response
    if (allowOrigin) {
      c.header('Access-Control-Allow-Origin', allowOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
    } else {
      c.header('Access-Control-Allow-Origin', '*');
    }

    if (ampSourceOrigin) {
      c.header('AMP-Access-Control-Allow-Source-Origin', ampSourceOrigin);
      c.header(
        'Access-Control-Expose-Headers',
        'AMP-Access-Control-Allow-Source-Origin, Access-Control-Allow-Origin, Access-Control-Allow-Credentials'
      );
    }
  };
};
