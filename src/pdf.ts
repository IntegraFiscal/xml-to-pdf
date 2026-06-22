import { nodeFromXmlString } from "@nodecfdi/cfdi-core";
import {
	CfdiData,
	GenericCfdiTranslator,
	GenericRetencionesTranslator,
	RetencionesData,
} from "@nodecfdi/cfdi-to-pdf";
import { PdfMakerBuilder } from "@nodecfdi/cfdi-to-pdf/node";
import { PdfServiceError } from "./errors.js";
import { NominaCfdiTranslator } from "./nomina.js";

let _ready = false;

/**
 * Decode raw request bytes into a clean XML string before parsing.
 *
 * SAT/PAC-emitted CFDIs are not always pristine UTF-8:
 *  - Some are encoded as Windows-1252 / Latin-1. The accented nomina12 attribute
 *    name "Antigüedad" then arrives as a single 0xFC byte; decoding as UTF-8
 *    corrupts the attribute NAME and the strict xmldom parser rejects the doc.
 *  - Some carry a leading UTF-8 BOM or whitespace before the "<?xml" declaration,
 *    which xmldom (onErrorStopParsing) treats as content outside the root.
 *
 * Decode strictly as UTF-8 first; fall back to Windows-1252 (a Latin-1 superset
 * that maps 0xFC → ü) only when the bytes are not valid UTF-8. Then strip any
 * BOM and leading whitespace so the document begins at "<".
 */
function decodeXmlBuffer(buf: Buffer): string {
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
	} catch {
		text = new TextDecoder("windows-1252").decode(buf);
	}
	return text.replace(/^﻿/, "").replace(/^\s+(?=<)/, "");
}

export async function initPdf(): Promise<void> {
	new PdfMakerBuilder(new GenericCfdiTranslator());
	new PdfMakerBuilder(new GenericRetencionesTranslator());
	_ready = true;
}

export function isReady(): boolean {
	return _ready;
}

export async function generatePdf(
	xmlBuffer: Buffer,
	paperSize: "LETTER" | "A4" = "LETTER",
): Promise<NodeJS.ReadableStream> {
	// 1. Parse XML — throws on malformed input
	let node: ReturnType<typeof nodeFromXmlString>;
	try {
		node = nodeFromXmlString(decodeXmlBuffer(xmlBuffer));
	} catch {
		throw new PdfServiceError("XML is not parseable", "INVALID_XML", 400);
	}

	// 2. Detect document type by root local name (strip namespace prefix)
	// nodeFromXmlString returns XmlNode with name() method, not a DOM node
	const rawName = node.name() ?? "";
	const localName = rawName.includes(":") ? rawName.split(":")[1]! : rawName;

	if (localName === "Comprobante") {
		let data: CfdiData;
		try {
			data = new CfdiData(node);
		} catch (err) {
			throw new PdfServiceError((err as Error).message, "MISSING_TIMBRE", 400);
		}
		try {
			const isNomina = node.getAttribute("TipoDeComprobante") === "N";
			const translator = isNomina
				? new NominaCfdiTranslator()
				: new GenericCfdiTranslator();
			const builder = new PdfMakerBuilder(
				translator as unknown as GenericCfdiTranslator,
				{ pageSize: paperSize },
			);
			const pdfDoc = builder.buildStream(data);
			(pdfDoc as unknown as { end(): void }).end();
			return pdfDoc;
		} catch (err) {
			throw new PdfServiceError(
				`PDF generation failed: ${(err as Error).message}`,
				"RENDER_ERROR",
				500,
			);
		}
	}

	if (localName === "Retenciones") {
		let data: RetencionesData;
		try {
			data = new RetencionesData(node);
		} catch (err) {
			throw new PdfServiceError((err as Error).message, "MISSING_TIMBRE", 400);
		}
		try {
			const builder = new PdfMakerBuilder(new GenericRetencionesTranslator(), {
				pageSize: paperSize,
			});
			const pdfDoc = builder.buildStream(data);
			(pdfDoc as unknown as { end(): void }).end();
			return pdfDoc;
		} catch (err) {
			throw new PdfServiceError(
				`PDF generation failed: ${(err as Error).message}`,
				"RENDER_ERROR",
				500,
			);
		}
	}

	throw new PdfServiceError(
		`Unsupported document type: ${rawName}`,
		"UNSUPPORTED_TYPE",
		400,
	);
}
