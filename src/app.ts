import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { initPdf } from "./pdf.js";
import { generateRoute } from "./routes/generate.js";
import { healthRoute } from "./routes/health.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
	readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { version: string };

export async function buildApp(): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	// Parse XML/binary body as raw Buffer
	const bufferParser = (
		_req: unknown,
		body: Buffer,
		done: (err: null, body: Buffer) => void,
	) => done(null, body);
	app.addContentTypeParser(
		"application/xml",
		{ parseAs: "buffer" },
		bufferParser,
	);
	app.addContentTypeParser(
		"application/octet-stream",
		{ parseAs: "buffer" },
		bufferParser,
	);

	await initPdf();

	await app.register(healthRoute, { version });
	await app.register(generateRoute);

	return app;
}
