import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { getDatabase } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

// Base62-friendly custom alphabet (omits confusing characters 0, O, 1, l, I)
const generateSlug = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 6);

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

const SLUG_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

const createLinkSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .max(2048, 'URL cannot exceed 2048 characters')
    .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
      message: 'URL must begin with http:// or https://',
    }),
  slug: z
    .string()
    .regex(SLUG_REGEX, 'Slug must be 2-64 characters alphanumeric, hyphens, or underscores')
    .optional(),
  description: z.string().max(255, 'Description cannot exceed 255 characters').optional(),
  is_active: z.boolean().optional().default(true),
});

const updateLinkSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .max(2048, 'URL cannot exceed 2048 characters')
    .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
      message: 'URL must begin with http:// or https://',
    })
    .optional(),
  slug: z
    .string()
    .regex(SLUG_REGEX, 'Slug must be 2-64 characters alphanumeric, hyphens, or underscores')
    .optional(),
  description: z.string().max(255).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Protect all /api/links and /api/stats routes with authentication
  fastify.addHook('preHandler', requireAuth);

  // GET /api/links - List links with pagination & search
  fastify.get('/api/links', async (req) => {
    const query = req.query as {
      search?: string;
      status?: 'active' | 'disabled' | 'all';
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '25', 10)));
    const offset = (page - 1) * limit;

    const db = getDatabase();
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (query.search) {
      const searchParam = `%${query.search.trim()}%`;
      whereClauses.push('(slug LIKE ? OR destination_url LIKE ? OR description LIKE ?)');
      params.push(searchParam, searchParam, searchParam);
    }

    if (query.status === 'active') {
      whereClauses.push('is_active = 1');
    } else if (query.status === 'disabled') {
      whereClauses.push('is_active = 0');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM links ${whereSql}`).get(...params) as {
      total: number;
    };

    const links = db
      .prepare(
        `SELECT id, slug, destination_url, description, is_active, click_count, created_at, updated_at, last_accessed_at
         FROM links
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    return {
      links,
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit),
      },
    };
  });

  // POST /api/links - Create short link
  fastify.post('/api/links', async (req, reply) => {
    const body = createLinkSchema.parse(req.body);
    const db = getDatabase();

    let finalSlug: string;

    if (body.slug) {
      finalSlug = body.slug.toLowerCase().trim();

      if (RESERVED_SLUGS.has(finalSlug)) {
        return reply.status(400).send({
          error: {
            code: 'RESERVED_SLUG',
            message: `The slug "${finalSlug}" is reserved by the system.`,
          },
        });
      }

      // Check collision
      const existing = db.prepare('SELECT id FROM links WHERE slug = ?').get(finalSlug);
      if (existing) {
        return reply.status(409).send({
          error: {
            code: 'SLUG_ALREADY_EXISTS',
            message: `The slug "${finalSlug}" is already in use.`,
          },
        });
      }
    } else {
      // Auto-generate slug with collision retry
      let attempts = 0;
      let generated = '';
      while (attempts < 5) {
        generated = generateSlug().toLowerCase();
        if (RESERVED_SLUGS.has(generated)) {
          attempts++;
          continue;
        }
        const existing = db.prepare('SELECT id FROM links WHERE slug = ?').get(generated);
        if (!existing) {
          break;
        }
        attempts++;
      }

      if (attempts >= 5) {
        return reply.status(500).send({
          error: {
            code: 'SLUG_GENERATION_FAILED',
            message: 'Failed to generate a unique short slug. Please specify a custom slug.',
          },
        });
      }
      finalSlug = generated;
    }

    const stmt = db.prepare(`
      INSERT INTO links (slug, destination_url, description, is_active)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      finalSlug,
      body.url,
      body.description || null,
      body.is_active ? 1 : 0
    );

    const created = db.prepare('SELECT * FROM links WHERE id = ?').get(result.lastInsertRowid);
    return reply.status(201).send({ link: created });
  });

  // GET /api/links/:id - Details and recent click history
  fastify.get<{ Params: { id: string } }>('/api/links/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID must be an integer' } });
    }

    const db = getDatabase();
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
    if (!link) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }

    const recentClicks = db
      .prepare(
        `SELECT id, clicked_at, country, referrer, user_agent
         FROM click_events
         WHERE link_id = ?
         ORDER BY clicked_at DESC
         LIMIT 50`
      )
      .all(id);

    return { link, recentClicks };
  });

  // PUT /api/links/:id - Update link
  fastify.put<{ Params: { id: string } }>('/api/links/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID must be an integer' } });
    }

    const body = updateLinkSchema.parse(req.body);
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM links WHERE id = ?').get(id) as
      | { id: number; slug: string; destination_url: string; description: string; is_active: number }
      | undefined;

    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }

    let finalSlug = existing.slug;
    if (body.slug && body.slug.toLowerCase() !== existing.slug) {
      finalSlug = body.slug.toLowerCase().trim();
      if (RESERVED_SLUGS.has(finalSlug)) {
        return reply.status(400).send({
          error: { code: 'RESERVED_SLUG', message: `The slug "${finalSlug}" is reserved.` },
        });
      }
      const collision = db.prepare('SELECT id FROM links WHERE slug = ? AND id != ?').get(finalSlug, id);
      if (collision) {
        return reply.status(409).send({
          error: { code: 'SLUG_ALREADY_EXISTS', message: `The slug "${finalSlug}" is already in use.` },
        });
      }
    }

    const finalUrl = body.url ?? existing.destination_url;
    const finalDesc = body.description !== undefined ? body.description : existing.description;
    const finalActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

    db.prepare(`
      UPDATE links
      SET slug = ?, destination_url = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalSlug, finalUrl, finalDesc, finalActive, id);

    const updated = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
    return { link: updated };
  });

  // DELETE /api/links/:id - Delete link
  fastify.delete<{ Params: { id: string } }>('/api/links/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'ID must be an integer' } });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM links WHERE id = ?').get(id);
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }

    db.prepare('DELETE FROM links WHERE id = ?').run(id);
    return reply.status(200).send({ success: true, message: 'Link deleted' });
  });

  // GET /api/stats - Aggregate dashboard statistics
  fastify.get('/api/stats', async () => {
    const db = getDatabase();

    const counts = db
      .prepare(
        `SELECT
           COUNT(*) as total_links,
           SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_links,
           SUM(click_count) as total_clicks
         FROM links`
      )
      .get() as { total_links: number; active_links: number; total_clicks: number };

    const clicksLast24h = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM click_events
         WHERE clicked_at >= datetime('now', '-24 hours')`
      )
      .get() as { count: number };

    const topLinks = db
      .prepare(
        `SELECT id, slug, destination_url, click_count, last_accessed_at
         FROM links
         WHERE click_count > 0
         ORDER BY click_count DESC
         LIMIT 5`
      )
      .all();

    return {
      stats: {
        totalLinks: counts.total_links || 0,
        activeLinks: counts.active_links || 0,
        totalClicks: counts.total_clicks || 0,
        clicksLast24h: clicksLast24h.count || 0,
      },
      topLinks,
    };
  });
};
