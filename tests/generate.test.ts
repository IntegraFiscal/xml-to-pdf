import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Buffer =>
  readFileSync(join(__dirname, 'fixtures', name));

describe('POST /generate — error cases', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('returns 400 INVALID_XML for malformed XML', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: fixture('cfdi-invalid.xml'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('INVALID_XML');
  });

  it('returns 400 MISSING_TIMBRE for valid XML without TimbreFiscalDigital', async () => {
    const xml = Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Test" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="Test"
    DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="616" UsoCFDI="S01"/>
  <cfdi:Conceptos/>
  <cfdi:Complemento/>
</cfdi:Comprobante>`,
      'utf8',
    );
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('MISSING_TIMBRE');
  });

  it('returns 400 UNSUPPORTED_TYPE for unknown root element', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><foo/>', 'utf8'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('UNSUPPORTED_TYPE');
  });
});
