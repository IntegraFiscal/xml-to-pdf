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

describe('POST /generate — happy paths', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('returns 200 PDF for valid CFDI 4.0', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: fixture('cfdi40-valid.xml'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.length).toBeGreaterThan(100);
  });

  it('returns 200 PDF for valid CFDI 3.3', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: fixture('cfdi33-valid.xml'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.length).toBeGreaterThan(100);
  });

  it('returns 200 PDF for Retenciones', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: fixture('retenciones-valid.xml'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.length).toBeGreaterThan(100);
  });

  it('returns 200 PDF for CFDI 4.0 with Nomina 1.2 complement', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload: fixture('nomina-valid.xml'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.length).toBeGreaterThan(100);
  });

  it('returns 200 PDF with ?paper=a4', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate?paper=a4',
      headers: { 'content-type': 'application/xml' },
      payload: fixture('cfdi40-valid.xml'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.length).toBeGreaterThan(100);
  });

  it('returns 200 PDF when Content-Type is application/octet-stream', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/octet-stream' },
      payload: fixture('cfdi40-valid.xml'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });
});

describe('POST /generate — byte-level input quirks', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  // Real SAT nómina XMLs use the accented attribute name "Antigüedad" on
  // nomina12:Receptor. When a PAC emits the file as Windows-1252 / Latin-1, the
  // "ü" arrives as a single 0xFC byte; decoding it as UTF-8 corrupts the
  // attribute NAME and the strict xmldom parser rejects the whole document.
  it('returns 200 PDF for a nómina encoded as Windows-1252 (accented attr name)', async () => {
    const utf8 = fixture('nomina-valid.xml')
      .toString('utf8')
      .replace(/Antiguedad=/g, 'Antigüedad=');
    // Re-encode as latin1 so "ü" becomes the single byte 0xFC, as a PAC would.
    const payload = Buffer.from(utf8, 'latin1');
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });

  it('returns 200 PDF for valid CFDI prefixed with a UTF-8 BOM', async () => {
    const payload = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      fixture('cfdi40-valid.xml'),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });

  it('returns 200 PDF for valid CFDI with leading whitespace before <?xml', async () => {
    const payload = Buffer.concat([
      Buffer.from('\n  ', 'utf8'),
      fixture('cfdi40-valid.xml'),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'content-type': 'application/xml' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });
});
