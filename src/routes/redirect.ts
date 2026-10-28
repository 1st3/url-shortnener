import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { analyticsQueue } from '../services/analyticsQueue.js';
import { extractCountry, sanitizeReferrer, sanitizeUserAgent } from '../services/privacy.js';
import { renderErrorPage } from '../views/errorPages.js';

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'health',
  'favicon.ico',
  'robots.txt',
  'static',
  'assets',
  '_next',
  '_redirects',
]);

export const redirectRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Short link redirection: GET /:slug
  fastify.get<{ Params: { slug: string } }>('/:slug', async (req, reply) => {
    const rawSlug = req.params.slug;
    const slug = rawSlug.toLowerCase().trim();

    // Check reserved routes
    if (RESERVED_SLUGS.has(slug)) {
      return reply.callNotFound();
    }

    const db = getDatabase();
    const link = db
      .prepare('SELECT id, destination_url, is_active FROM links WHERE slug = ?')
      .get(slug) as { id: number; destination_url: string; is_active: number } | undefined;

    // Unknown slug -> 404
    if (!link) {
      reply.status(404).type('text/html');
      return renderErrorPage(
        404,
        'Short Link Not Found',
        `The requested link "brzl.ca/${slug}" does not exist or has been removed.`,
        config.DEFAULT_FALLBACK_URL
      );
    }

    // Disabled slug -> 410
    if (link.is_active === 0) {
      reply.status(410).type('text/html');
      return renderErrorPage(
        410,
        'Link Deactivated',
        `The link "brzl.ca/${slug}" has been disabled and is no longer available.`,
        config.DEFAULT_FALLBACK_URL
      );
    }

    // Enqueue analytics asynchronously without blocking redirect response
    analyticsQueue.enqueue({
      linkId: link.id,
      country: extractCountry(req.headers['cf-ipcountry']),
      referrer: sanitizeReferrer(req.headers['referer']),
      userAgent: sanitizeUserAgent(req.headers['user-agent']),
    });

    // Enforce 307 with strict no-cache headers
    reply
      .header('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate')
      .header('Pragma', 'no-cache')
      .redirect(link.destination_url, 307);
  });
};
