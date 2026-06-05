import type { FastifyPluginAsync } from 'fastify';
import { isReady } from '../pdf.js';

interface HealthPluginOptions {
  version: string;
}

export const healthRoute: FastifyPluginAsync<HealthPluginOptions> = async (app, opts) => {
  app.get('/health', async (_req, reply) => {
    if (!isReady()) {
      return reply.code(503).send({ status: 'error' });
    }
    return { status: 'ok', version: opts.version };
  });
};
