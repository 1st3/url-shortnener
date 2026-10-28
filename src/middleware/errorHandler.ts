import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply): void {
  req.log.error(error);

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  const statusCode = (error as FastifyError).statusCode || 500;
  reply.status(statusCode).send({
    error: {
      code: (error as FastifyError).code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
    },
  });
}
