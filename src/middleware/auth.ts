import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // 1. Check Cloudflare Access header if present
  const cfUserEmail = req.headers['cf-access-authenticated-user-email'];
  if (cfUserEmail && typeof cfUserEmail === 'string' && cfUserEmail.length > 0) {
    // Cloudflare Zero Trust authenticated the user
    return;
  }

  // 2. Check Bearer token or x-admin-key header
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-key'] && typeof req.headers['x-admin-key'] === 'string') {
    token = req.headers['x-admin-key'].trim();
  }

  if (token && token === config.ADMIN_API_KEY) {
    return;
  }

  reply.status(401).send({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Provide a valid Bearer token in the Authorization header or x-admin-key header.',
    },
  });
}
