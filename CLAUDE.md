# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # tsc compile → dist/
npm start            # node dist/server.js
npm run dev          # tsx src/server.ts (no compile step)
npm test             # vitest run (all tests)
npm run test:watch   # vitest watch mode

# Run a single test file
npx vitest run tests/generate.test.ts

# Run a single test by name
npx vitest run --reporter=verbose -t "returns 200 PDF for valid CFDI 4.0"
```

## Architecture

Stateless Fastify microservice: receives a CFDI XML body, returns a PDF stream. No database, no storage — purely functional.

```
src/
  server.ts       # Entry point — reads PORT/HOST from env, starts listener
  app.ts          # Fastify factory exported for tests; registers content-type parsers,
                  # calls initPdf(), registers routes
  pdf.ts          # Core logic: XML parsing → type detection → PDF stream
  errors.ts       # PdfServiceError(message, code, statusCode)
  routes/
    health.ts     # GET /health → { status, version }
    generate.ts   # POST /generate?paper=letter|a4 → PDF stream
```

**Request flow:** `generate.ts` calls `generatePdf(buffer, paperSize)` in `pdf.ts`, which:
1. Parses XML with `nodeFromXmlString` (returns `XmlNode`, not a DOM node — use `.name()` not `.nodeName`)
2. Detects root element local name (`Comprobante` → CFDI, `Retenciones` → Retenciones)
3. Constructs `CfdiData` or `RetencionesData` (throws if `tfd:TimbreFiscalDigital` is absent)
4. Builds PDF via `PdfMakerBuilder.buildStream()` — **must call `.end()` on the returned PDFDocument** or the stream never closes

## Key library constraints

- `@nodecfdi/cfdi-to-pdf` v2.2.1 (no v3 on npm)
- Translators import from the main entry: `import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf'` — there is no `./templates` subpath in this version
- `PdfMakerBuilder` from `@nodecfdi/cfdi-to-pdf/node`
- `buildStream()` returns a PDFKit `PDFDocument` (synchronously, not a Promise). Always call `.end()` on it before returning — without it the stream never emits `end` and Fastify hangs
- No Chromium — PDF generation is pure Node.js via pdfmake/PDFKit

## ESM / TypeScript

- `"type": "module"` — all local imports need `.js` extension (e.g. `import { foo } from './pdf.js'`)
- `module: NodeNext`, `moduleResolution: NodeNext`
- `tsconfig.json` `include` covers only `src/` — TypeScript diagnostics in test files are expected and harmless (vitest handles test compilation independently)

## Tests

Vitest + `app.inject()` (in-memory, no real port). Fixtures in `tests/fixtures/`:

| File | Type |
|---|---|
| `cfdi40-valid.xml` | CFDI 4.0 with mock `tfd:TimbreFiscalDigital` |
| `cfdi33-valid.xml` | CFDI 3.3 |
| `retenciones-valid.xml` | Retenciones 1.0 — note `montoTotOperacion` must be **camelCase** (the SAT QR extractor is case-sensitive; `MontoTotOperacion` causes silent extraction failure → empty QR → pdfmake error) |
| `nomina-valid.xml` | CFDI 4.0 + Nómina 1.2 complement (same `cfdi:Comprobante` root, same translator) |
| `cfdi-invalid.xml` | Malformed XML for error-case testing |
