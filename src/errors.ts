export type PdfErrorCode =
	| "INVALID_XML"
	| "MISSING_TIMBRE"
	| "UNSUPPORTED_TYPE"
	| "RENDER_ERROR";

export class PdfServiceError extends Error {
	constructor(
		message: string,
		public readonly code: PdfErrorCode,
		public readonly statusCode: number,
	) {
		super(message);
		this.name = "PdfServiceError";
	}
}
