import type { FastifyPluginAsync } from "fastify";
import { PdfServiceError } from "../errors.js";
import { generatePdf } from "../pdf.js";

export const generateRoute: FastifyPluginAsync = async (app) => {
	app.post<{ Querystring: { paper?: string } }>(
		"/generate",
		async (req, reply) => {
			const paperSize = req.query.paper === "a4" ? "A4" : "LETTER";

			try {
				const stream = await generatePdf(req.body as Buffer, paperSize);
				return reply.type("application/pdf").send(stream);
			} catch (err) {
				if (err instanceof PdfServiceError) {
					return reply.code(err.statusCode).send({
						error: err.message,
						code: err.code,
					});
				}
				return reply
					.code(500)
					.send({ error: "Internal server error", code: "RENDER_ERROR" });
			}
		},
	);
};
