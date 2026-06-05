import { PdfMakerBuilder } from '@nodecfdi/cfdi-to-pdf/node';
import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf';

let _ready = false;

export async function initPdf(): Promise<void> {
  // Instantiate both builders to detect missing peer deps at startup.
  // Catalogs load lazily on first PDF request via Node.js module cache.
  new PdfMakerBuilder(new GenericCfdiTranslator());
  new PdfMakerBuilder(new GenericRetencionesTranslator());
  _ready = true;
}

export function isReady(): boolean {
  return _ready;
}

export async function generatePdf(
  _xmlBuffer: Buffer,
  _paperSize: 'LETTER' | 'A4',
): Promise<NodeJS.ReadableStream> {
  throw new Error('not implemented');
}
