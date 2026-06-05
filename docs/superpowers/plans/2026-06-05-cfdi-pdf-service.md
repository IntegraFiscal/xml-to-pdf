# CFDI PDF Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Fastify microservice that receives a CFDI XML (any type: 4.0, 3.3, Retenciones, Nómina) and returns its PDF representation as a byte stream.

**Architecture:** Flat ESM TypeScript project. A `pdf.ts` module owns all PDF-generation logic (XML parsing, document-type detection, error mapping, stream output). Two Fastify route plugins (`health.ts`, `generate.ts`) are thin HTTP adapters. Catalogs from `@nodecfdi/sat-micro-catalogs` are loaded lazily by the library on first use; Node.js module caching makes subsequent requests fast.

**Tech Stack:** Node.js 20, TypeScript (ESM / NodeNext), Fastify 4.x, `@nodecfdi/cfdi-to-pdf` (pdfmake-based, no Chromium), Vitest.

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | deps, scripts |
| `tsconfig.json` | TypeScript ESM/NodeNext config |
| `vitest.config.ts` | test runner config |
| `src/errors.ts` | `PdfServiceError` domain type |
| `src/pdf.ts` | `initPdf()`, `isReady()`, `generatePdf()` |
| `src/app.ts` | `buildApp()` — Fastify factory, exported for tests |
| `src/server.ts` | entry point, listens on `PORT` |
| `src/routes/health.ts` | `GET /health` Fastify plugin |
| `src/routes/generate.ts` | `POST /generate` Fastify plugin |
| `tests/fixtures/cfdi40-valid.xml` | CFDI 4.0 fixture with mock timbrado |
| `tests/fixtures/cfdi33-valid.xml` | CFDI 3.3 fixture with mock timbrado |
| `tests/fixtures/retenciones-valid.xml` | Retenciones 1.0 fixture |
| `tests/fixtures/nomina-valid.xml` | CFDI 4.0 + Nómina 1.2 complement |
| `tests/fixtures/cfdi-invalid.xml` | Non-parseable XML (plain garbage) |
| `tests/health.test.ts` | health route integration tests |
| `tests/generate.test.ts` | generate route integration tests |
| `Dockerfile` | multi-stage build, `node:20-alpine` |

---

## Task 1: Project scaffold

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/routes tests/fixtures
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "cfdi-pdf-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@nodecfdi/cfdi-core": ">=0.6.2",
    "@nodecfdi/cfdi-expresiones": "^3.0.4",
    "@nodecfdi/cfdi-to-pdf": "^3.0.0",
    "fastify": "^4.28.0",
    "pdfmake": "^0.2.17"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/pdfmake": "^0.2.10",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
  },
});
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/@nodecfdi/cfdi-to-pdf` present, no peer dependency errors.

- [ ] **Step 6: Verify translator import path**

```bash
node --input-type=module <<'EOF'
import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf/templates';
console.log('barrel OK:', !!GenericCfdiTranslator, !!GenericRetencionesTranslator);
EOF
```

If this prints `barrel OK: true true`, use:
```typescript
import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf/templates';
```

If it throws, use the direct paths (replace in all subsequent tasks):
```typescript
import GenericCfdiTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_cfdi_translator.js';
import GenericRetencionesTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_retenciones_translator.js';
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts
git commit -m "feat: project scaffold — package.json, tsconfig, vitest"
```

---

## Task 2: XML test fixtures

**Files:** `tests/fixtures/*.xml` (5 files)

- [ ] **Step 1: Write `tests/fixtures/cfdi40-valid.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"
  Serie="A"
  Folio="1"
  Fecha="2024-01-15T10:00:00"
  Sello="MockSello"
  FormaPago="01"
  NoCertificado="00001000000504465028"
  Certificado="MockCertificado"
  SubTotal="1000.00"
  Moneda="MXN"
  Total="1160.00"
  TipoDeComprobante="I"
  Exportacion="01"
  MetodoPago="PUE"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMPRESA DEMO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor
    Rfc="XAXX010101000"
    Nombre="PUBLICO EN GENERAL"
    DomicilioFiscalReceptor="06600"
    RegimenFiscalReceptor="616"
    UsoCFDI="S01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="01010101"
      Cantidad="1"
      ClaveUnidad="ACT"
      Descripcion="Servicio de prueba"
      ValorUnitario="1000.00"
      Importe="1000.00"
      ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1"
      UUID="6A3D5FE0-5B0C-4F5A-B6B7-8D9E0F1A2B3C"
      FechaTimbrado="2024-01-15T10:05:00"
      RfcProvCertif="SAT970701NN3"
      SelloCFD="MockSelloCFD40"
      NoCertificadoSAT="20001000000300022323"
      SelloSAT="MockSelloSAT40"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

- [ ] **Step 2: Write `tests/fixtures/cfdi33-valid.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv33.xsd"
  Version="3.3"
  Serie="A"
  Folio="1"
  Fecha="2024-01-15T10:00:00"
  Sello="MockSello"
  FormaPago="01"
  NoCertificado="00001000000504465028"
  Certificado="MockCertificado"
  SubTotal="1000.00"
  Moneda="MXN"
  Total="1160.00"
  TipoDeComprobante="I"
  MetodoPago="PUE"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMPRESA DEMO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" UsoCFDI="P01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="01010101"
      Cantidad="1"
      ClaveUnidad="ACT"
      Descripcion="Servicio de prueba"
      ValorUnitario="1000.00"
      Importe="1000.00">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1"
      UUID="7B4E6CF1-6C1D-4G6B-C7C8-9E0F1G2B4D5E"
      FechaTimbrado="2024-01-15T10:05:00"
      RfcProvCertif="SAT970701NN3"
      SelloCFD="MockSelloCFD33"
      NoCertificadoSAT="20001000000300022323"
      SelloSAT="MockSelloSAT33"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

- [ ] **Step 3: Write `tests/fixtures/retenciones-valid.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<retenciones:Retenciones
  xmlns:retenciones="http://www.sat.gob.mx/esquemas/retencionpago/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/esquemas/retencionpago/1 http://www.sat.gob.mx/sitio_internet/cfd/retenciones/retenciones.xsd"
  Version="1.0"
  FolioInt="1"
  Descripcion="Retencion de intereses"
  FechaExp="2024-01-15T10:00:00"
  CveRetenc="14">
  <retenciones:Emisor RFCEmisor="AAA010101AAA" NomDenRazSocE="EMPRESA DEMO SA DE CV"/>
  <retenciones:Receptor>
    <retenciones:Nacional RFCRecep="XAXX010101000" NomDenRazSocR="PUBLICO EN GENERAL"/>
  </retenciones:Receptor>
  <retenciones:Periodo MesIni="1" MesFin="1" Ejerc="2024"/>
  <retenciones:Totales
    MontoTotOperacion="10000.00"
    MontoTotGrav="10000.00"
    MontoTotExent="0.00"
    MontoTotRet="1000.00"/>
  <retenciones:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1"
      UUID="8C5F7AF2-7D2E-5H7C-D8D9-0F1G2H3C5E6F"
      FechaTimbrado="2024-01-15T10:05:00"
      RfcProvCertif="SAT970701NN3"
      SelloCFD="MockSelloCFDRet"
      NoCertificadoSAT="20001000000300022323"
      SelloSAT="MockSelloSATRet"/>
  </retenciones:Complemento>
</retenciones:Retenciones>
```

- [ ] **Step 4: Write `tests/fixtures/nomina-valid.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:nomina12="http://www.sat.gob.mx/nomina12"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd"
  Version="4.0"
  Fecha="2024-01-15T10:00:00"
  Sello="MockSello"
  NoCertificado="00001000000504465028"
  Certificado="MockCertificado"
  SubTotal="10000.00"
  Descuento="0.00"
  Moneda="MXN"
  Total="10000.00"
  TipoDeComprobante="N"
  Exportacion="01"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMPRESA DEMO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor
    Rfc="XEXX010101000"
    Nombre="EMPLEADO DEMO"
    DomicilioFiscalReceptor="06600"
    RegimenFiscalReceptor="605"
    UsoCFDI="CN01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="84111505"
      Cantidad="1"
      ClaveUnidad="ACT"
      Descripcion="Pago de nomina"
      ValorUnitario="10000.00"
      Importe="10000.00"
      ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <nomina12:Nomina
      Version="1.2"
      TipoNomina="O"
      FechaPago="2024-01-15"
      FechaInicialPago="2024-01-01"
      FechaFinalPago="2024-01-15"
      NumDiasPagados="15"
      TotalPercepciones="10000.00"
      TotalDeducciones="0.00"
      TotalOtrosPagos="0.00">
      <nomina12:Emisor RegistroPatronal="A1234567890"/>
      <nomina12:Receptor
        Curp="XEXX010101HXXXXXX01"
        NumSeguridadSocial="12345678901"
        FechaInicioRelLaboral="2020-01-01"
        Antiguedad="P4Y"
        TipoContrato="01"
        Sindicalizado="No"
        TipoJornada="01"
        TipoRegimen="02"
        NumEmpleado="001"
        Departamento="General"
        Puesto="Empleado"
        RiesgoPuesto="1"
        PeriodicidadPago="04"
        Banco="002"
        CuentaBancaria="1234567890123456"
        SalarioBaseCotApor="333.33"
        SalarioDiarioIntegrado="333.33"
        ClaveEntFed="CMX"/>
      <nomina12:Percepciones
        TotalSueldos="10000.00"
        TotalSeparacionIndemnizacion="0.00"
        TotalJubilacionPensionRetiro="0.00"
        TotalGravado="10000.00"
        TotalExento="0.00">
        <nomina12:Percepcion
          TipoPercepcion="001"
          Clave="001"
          Concepto="Sueldos"
          ImporteGravado="10000.00"
          ImporteExento="0.00"/>
      </nomina12:Percepciones>
    </nomina12:Nomina>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1"
      UUID="9D6G8BH3-8E3F-6I8D-E9E0-1G2H3I4D6F7G"
      FechaTimbrado="2024-01-15T10:05:00"
      RfcProvCertif="SAT970701NN3"
      SelloCFD="MockSelloCFDNomina"
      NoCertificadoSAT="20001000000300022323"
      SelloSAT="MockSelloSATNomina"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

- [ ] **Step 5: Write `tests/fixtures/cfdi-invalid.xml`**

```
this is not valid xml content
```

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/
git commit -m "test: add XML fixtures for CFDI 4.0, 3.3, retenciones, nomina, and invalid"
```

---

## Task 3: Domain error type

**Files:** `src/errors.ts`

- [ ] **Step 1: Write `src/errors.ts`**

```typescript
export type PdfErrorCode =
  | 'INVALID_XML'
  | 'MISSING_TIMBRE'
  | 'UNSUPPORTED_TYPE'
  | 'RENDER_ERROR';

export class PdfServiceError extends Error {
  constructor(
    message: string,
    public readonly code: PdfErrorCode,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'PdfServiceError';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/errors.ts
git commit -m "feat: add PdfServiceError domain type"
```

---

## Task 4: Health route (TDD)

**Files:** `tests/health.test.ts`, `src/pdf.ts` (stubs), `src/routes/health.ts`, `src/app.ts`

- [ ] **Step 1: Write `tests/health.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('returns 200 with status ok and a semver version', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; version: string }>();
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (app.ts doesn't exist)**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: `Error: Cannot find module '../src/app.js'`

- [ ] **Step 3: Write `src/pdf.ts` (stubs — full implementation comes in Task 5)**

```typescript
import { PdfMakerBuilder } from '@nodecfdi/cfdi-to-pdf/node';
import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf/templates';

// Use the import path determined in Task 1 Step 6.
// If the barrel fails, replace the import above with:
//   import GenericCfdiTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_cfdi_translator.js';
//   import GenericRetencionesTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_retenciones_translator.js';

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
```

- [ ] **Step 4: Write `src/routes/health.ts`**

```typescript
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
```

- [ ] **Step 5: Write `src/app.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { initPdf } from './pdf.js';
import { healthRoute } from './routes/health.js';
import { generateRoute } from './routes/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string };

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Parse XML/binary body as raw Buffer
  const bufferParser = (
    _req: unknown,
    body: Buffer,
    done: (err: null, body: Buffer) => void,
  ) => done(null, body);
  app.addContentTypeParser('application/xml', { parseAs: 'buffer' }, bufferParser);
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, bufferParser);

  await initPdf();

  await app.register(healthRoute, { version });
  await app.register(generateRoute);

  return app;
}
```

- [ ] **Step 6: Write `src/routes/generate.ts` (stub — enough for app.ts to compile)**

```typescript
import type { FastifyPluginAsync } from 'fastify';

export const generateRoute: FastifyPluginAsync = async (_app) => {
  // implemented in Task 5
};
```

- [ ] **Step 7: Run — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: `✓ GET /health > returns 200 with status ok and a semver version`

- [ ] **Step 8: Commit**

```bash
git add src/ tests/health.test.ts
git commit -m "feat: health route with initPdf startup verification"
```

---

## Task 5: Generate route — error cases (TDD)

**Files:** `tests/generate.test.ts` (error cases), `src/pdf.ts` (full implementation), `src/routes/generate.ts` (full implementation)

- [ ] **Step 1: Write `tests/generate.test.ts` with error cases only**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL (generateRoute is a stub)**

```bash
npm test -- --reporter=verbose tests/generate.test.ts 2>&1 | tail -30
```

Expected: tests fail because `/generate` returns 404.

- [ ] **Step 3: Implement `src/pdf.ts` (full implementation, replace stub)**

```typescript
import { nodeFromXmlString } from '@nodecfdi/cfdi-core';
import { CfdiData, RetencionesData } from '@nodecfdi/cfdi-to-pdf';
import { PdfMakerBuilder } from '@nodecfdi/cfdi-to-pdf/node';
import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf/templates';
import { PdfServiceError } from './errors.js';

// Use the import path determined in Task 1 Step 6.
// If the barrel fails, replace with direct paths:
//   import GenericCfdiTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_cfdi_translator.js';
//   import GenericRetencionesTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_retenciones_translator.js';

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
  // 1. Parse XML
  // nodeFromXmlString throws on malformed XML.
  // If your version of @nodecfdi/cfdi-core does not throw (returns error doc instead),
  // you will see MISSING_TIMBRE rather than INVALID_XML for malformed input — adjust as needed.
  let node: ReturnType<typeof nodeFromXmlString>;
  try {
    node = nodeFromXmlString(xmlBuffer.toString('utf8'));
  } catch {
    throw new PdfServiceError('XML is not parseable', 'INVALID_XML', 400);
  }

  // 2. Detect document type by root local name (strip namespace prefix)
  const rawName = node.nodeName ?? '';
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
      const builder = new PdfMakerBuilder(
        new GenericCfdiTranslator(),
        { pageSize: paperSize },
      );
      return await builder.buildStream(data);
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
      return await builder.buildStream(data);
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
```

- [ ] **Step 4: Implement `src/routes/generate.ts` (replace stub)**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { generatePdf } from '../pdf.js';
import { PdfServiceError } from '../errors.js';

export const generateRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Querystring: { paper?: string } }>('/generate', async (req, reply) => {
    const paperSize = req.query.paper === 'a4' ? 'A4' : 'LETTER';

    try {
      const stream = await generatePdf(req.body as Buffer, paperSize);
      return reply.type('application/pdf').send(stream);
    } catch (err) {
      if (err instanceof PdfServiceError) {
        return reply.code(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }
      return reply.code(500).send({ error: 'Internal server error', code: 'RENDER_ERROR' });
    }
  });
};
```

- [ ] **Step 5: Run — expect error cases to PASS**

```bash
npm test -- --reporter=verbose tests/generate.test.ts 2>&1 | tail -30
```

Expected:
```
✓ POST /generate — error cases > returns 400 INVALID_XML for malformed XML
✓ POST /generate — error cases > returns 400 MISSING_TIMBRE for valid XML without TimbreFiscalDigital
✓ POST /generate — error cases > returns 400 UNSUPPORTED_TYPE for unknown root element
```

- [ ] **Step 6: Commit**

```bash
git add src/pdf.ts src/routes/generate.ts tests/generate.test.ts
git commit -m "feat: generate route with XML parsing, type detection, and error mapping"
```

---

## Task 6: Generate route — happy paths (TDD)

**Files:** `tests/generate.test.ts` (add happy path tests)

- [ ] **Step 1: Add happy path tests to `tests/generate.test.ts`**

Add this `describe` block after the existing error-cases block (same file, same imports):

```typescript
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
```

- [ ] **Step 2: Run all tests — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | tail -40
```

Expected: all 9 tests pass (3 error + 6 happy path).

If any happy path test fails with a render error, the fixture XML may be missing required fields for the translator. Inspect the error message and add the missing attribute to the fixture — do NOT change the test assertion.

- [ ] **Step 3: Run full suite including health**

```bash
npm test 2>&1 | tail -10
```

Expected: `Test Files 2 passed`, `Tests 10 passed`

- [ ] **Step 4: Commit**

```bash
git add tests/generate.test.ts
git commit -m "test: add happy path tests for CFDI 4.0, 3.3, retenciones, nomina, paper=a4"
```

---

## Task 7: Server entry point

**Files:** `src/server.ts`

- [ ] **Step 1: Write `src/server.ts`**

```typescript
import { buildApp } from './app.js';

const PORT = Number(process.env['PORT'] ?? 3000);

const app = await buildApp();

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`cfdi-pdf-service listening on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npm run build 2>&1
```

Expected: no errors, `dist/` directory created with compiled JS.

- [ ] **Step 3: Smoke test the server**

```bash
node dist/server.js &
sleep 2
curl -s http://localhost:3000/health
kill %1
```

Expected: `{"status":"ok","version":"1.0.0"}`

- [ ] **Step 4: Commit**

```bash
git add src/server.ts dist/
git commit -m "feat: server entry point with PORT env var support"
```

> **Note:** If you prefer not to commit `dist/`, add it to `.gitignore` and omit it from the commit. The Dockerfile builds from source.

---

## Task 8: Dockerfile

**Files:** `Dockerfile`, `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
dist
.git
tests
*.md
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Build the image**

```bash
docker build -t cfdi-pdf-service:local .
```

Expected: build completes, two stages shown (`builder`, `runner`).

- [ ] **Step 4: Verify the health endpoint inside the container**

```bash
docker run --rm -d -p 3000:3000 --name cfdi-test cfdi-pdf-service:local
sleep 2
curl -s http://localhost:3000/health
docker stop cfdi-test
```

Expected: `{"status":"ok","version":"1.0.0"}`

- [ ] **Step 5: Verify a PDF generate inside the container**

```bash
docker run --rm -d -p 3000:3000 --name cfdi-test cfdi-pdf-service:local
sleep 2
curl -s -X POST http://localhost:3000/generate \
  -H "Content-Type: application/xml" \
  --data-binary @tests/fixtures/cfdi40-valid.xml \
  -o /tmp/test.pdf
file /tmp/test.pdf
docker stop cfdi-test
```

Expected: `test.pdf: PDF document, version ...`

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: multi-stage Dockerfile on node:20-alpine"
```

---

## Self-review: spec coverage checklist

| Spec requirement | Covered by |
|---|---|
| POST /generate accepts `application/xml` and `application/octet-stream` | Task 4 (content-type parsers), Task 6 (octet-stream test) |
| Returns PDF stream on 200 | Task 5 (generateRoute sends stream) |
| `?paper=letter\|a4` | Task 5 (paperSize logic), Task 6 (a4 test) |
| CFDI 3.3 support | Task 2 (fixture), Task 6 (test) |
| CFDI 4.0 support | Task 2 (fixture), Task 6 (test) |
| Nómina 1.2 (auto via GenericCfdiTranslator) | Task 2 (fixture), Task 6 (test) |
| Retenciones support | Task 2 (fixture), Task 6 (test) |
| 400 INVALID_XML | Task 5 (error mapping + test) |
| 400 MISSING_TIMBRE | Task 5 (error mapping + test) |
| 400 UNSUPPORTED_TYPE | Task 5 (error mapping + test) |
| 500 RENDER_ERROR | Task 5 (catch in generate route) |
| GET /health returns `{ status, version }` | Task 4 (test + implementation) |
| Health 503 if init fails | Task 3 (`isReady()` guards response) |
| VERSION from package.json | Task 4 (`app.ts` reads package.json at startup) |
| PORT env var | Task 7 (`server.ts`) |
| Dockerfile node:20-alpine, multi-stage | Task 8 |
| No Chromium | Architecture (pdfmake, no browser dep) |
| No external assets | Architecture (built-in PDF fonts) |
| `?locale` not implemented | Intentionally omitted (not in scope) |
