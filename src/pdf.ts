import { nodeFromXmlString } from '@nodecfdi/cfdi-core';
import { CfdiData, RetencionesData, GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf';
import { PdfMakerBuilder } from '@nodecfdi/cfdi-to-pdf/node';
import { PdfServiceError } from './errors.js';
import { NominaCfdiTranslator } from './nomina.js';

let _ready = false;

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
  paperSize: 'LETTER' | 'A4' = 'LETTER',
): Promise<NodeJS.ReadableStream> {
  // 1. Parse XML — throws on malformed input
  let node: ReturnType<typeof nodeFromXmlString>;
  try {
    node = nodeFromXmlString(xmlBuffer.toString('utf8'));
  } catch {
    throw new PdfServiceError('XML is not parseable', 'INVALID_XML', 400);
  }

  // 2. Detect document type by root local name (strip namespace prefix)
  // nodeFromXmlString returns XmlNode with name() method, not a DOM node
  const rawName = node.name() ?? '';
  const localName = rawName.includes(':') ? rawName.split(':')[1]! : rawName;

  if (localName === 'Comprobante') {
    let data: CfdiData;
    try {
      data = new CfdiData(node);
    } catch (err) {
      throw new PdfServiceError(
        (err as Error).message,
        'MISSING_TIMBRE',
        400,
      );
    }
    try {
      const isNomina = node.getAttribute('TipoDeComprobante') === 'N';
      const translator = isNomina ? new NominaCfdiTranslator() : new GenericCfdiTranslator();
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
        'RENDER_ERROR',
        500,
      );
    }
  }

  if (localName === 'Retenciones') {
    let data: RetencionesData;
    try {
      data = new RetencionesData(node);
    } catch (err) {
      throw new PdfServiceError(
        (err as Error).message,
        'MISSING_TIMBRE',
        400,
      );
    }
    try {
      const builder = new PdfMakerBuilder(
        new GenericRetencionesTranslator(),
        { pageSize: paperSize },
      );
      const pdfDoc = builder.buildStream(data);
      (pdfDoc as unknown as { end(): void }).end();
      return pdfDoc;
    } catch (err) {
      throw new PdfServiceError(
        `PDF generation failed: ${(err as Error).message}`,
        'RENDER_ERROR',
        500,
      );
    }
  }

  throw new PdfServiceError(
    `Unsupported document type: ${rawName}`,
    'UNSUPPORTED_TYPE',
    400,
  );
}
