# CFDI PDF Microservice — Design Spec

**Date:** 2026-06-05
**Status:** Approved

---

## Context

This service is part of the SAT Bulk Downloader system (Python + FastAPI + Celery). The Python API downloads CFDI XMLs from the SAT and stores them in MinIO. This microservice receives a CFDI XML and returns the PDF of its printed representation. The Python service is responsible for fetching the XML from MinIO and storing the resulting PDF. **This service has no access to MinIO or any external storage — it is purely functional.**

---

## Library Research: `@nodecfdi/cfdi-to-pdf`

Findings verified against the GitHub source and official documentation before design:

| Question | Finding |
|---|---|
| Chromium required? | **No.** Uses pdfmake / PDFKit — pure Node.js |
| CFDI 3.3 + 4.0? | **Yes**, both versions supported |
| Retenciones? | **Yes** — `RetencionesData` + `GenericRetencionesTranslator` (1.0 and 2.0) |
| Nómina 1.2? | **Yes** — handled automatically by `GenericCfdiTranslator` |
| External assets (fonts, logo)? | **No** — standard PDF fonts (Helvetica) are built-in; logo is optional and omitted in this scope |
| Paper size option? | Yes — via `documentOptions.pageSize: 'LETTER' \| 'A4'` in `PdfMakerBuilder` constructor |
| Locale option? | **Not supported by the library** — always Spanish; `?locale` param will not be implemented |
| Getting a stream? | `builder.buildStream(data): Promise<NodeJS.ReadableStream>` |

**Key correction from original spec:** Retenciones is fully supported — there is no 422 case. The `UNSUPPORTED_TYPE` code is reserved for unknown XML root elements only.

**Imports used:**
```typescript
import { nodeFromXmlString } from '@nodecfdi/cfdi-core';
import { CfdiData, RetencionesData } from '@nodecfdi/cfdi-to-pdf';
import { PdfMakerBuilder } from '@nodecfdi/cfdi-to-pdf/node';
import GenericCfdiTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_cfdi_translator.js';
import GenericRetencionesTranslator from '@nodecfdi/cfdi-to-pdf/templates/generic_retenciones_translator.js';
```

> **Implementation note:** The translator paths above are derived from the library's internal test suite. The package exports `./templates` as a subpath — verify the exact import path after installing the package (e.g. it may be `@nodecfdi/cfdi-to-pdf/templates` as a barrel that re-exports both translators).

---

## Stack

- Node.js 20 + TypeScript (ESM, `"type": "module"`)
- Fastify 4.x
- `@nodecfdi/cfdi-to-pdf` + `@nodecfdi/cfdi-core` + `pdfmake` (peer dep)
- Vitest for tests
- Docker image: `node:20-alpine` (no Chromium needed)

---

## Project Structure

```
/                           ← repo root
├── src/
│   ├── app.ts              # Fastify factory — exported for tests
│   ├── server.ts           # Entry point: builds app, listens on PORT
│   ├── pdf.ts              # PDF generation logic: type detection, builders, error mapping
│   ├── errors.ts           # Domain error types
│   └── routes/
│       ├── generate.ts     # POST /generate
│       └── health.ts       # GET /health
├── tests/
│   ├── fixtures/
│   │   ├── cfdi40-valid.xml
│   │   ├── cfdi33-valid.xml
│   │   ├── retenciones-valid.xml
│   │   ├── nomina-valid.xml
│   │   └── cfdi-invalid.xml
│   ├── generate.test.ts
│   └── health.test.ts
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## API Contract

### POST /generate

**Request:**
- `Content-Type: application/xml` or `application/octet-stream`
- Body: UTF-8 XML bytes
- Query param `?paper=letter|a4` (default: `letter`) — mapped to `'LETTER'|'A4'` for pdfmake

**Response 200:**
- `Content-Type: application/pdf`
- Body: PDF stream

**Error responses:**

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_XML` | XML is not parseable |
| 400 | `MISSING_TIMBRE` | Constructor throws due to missing `TimbreFiscalDigital` |
| 400 | `UNSUPPORTED_TYPE` | Root element is not `cfdi:Comprobante` or `retenciones:Retenciones` |
| 500 | `RENDER_ERROR` | Unexpected failure in `buildStream()` |

Error body shape:
```json
{ "error": "Human-readable message", "code": "INVALID_XML" }
```

### GET /health

**Response 200:**
```json
{ "status": "ok", "version": "1.0.0" }
```
- `version` is read from `package.json` at startup, not per-request
- If builders failed to initialize at startup → `503`

---

## PDF Generation Logic (`pdf.ts`)

### Startup (once)

1. Pre-load SAT catalogs → `CatalogsData` (~100ms, done once)
2. Expose `generatePdf(xmlBuffer, paperSize)` function — builds the appropriate `PdfMakerBuilder` per request (builders are cheap to construct; the expensive part is the catalogs, which are cached)

### Per request

```
1. nodeFromXmlString(xmlBuffer.toString('utf8'))
   → throws: INVALID_XML

2. Detect root element:
   cfdi:Comprobante          → CfdiData + GenericCfdiTranslator
   retenciones:Retenciones   → RetencionesData + GenericRetencionesTranslator
   anything else             → UNSUPPORTED_TYPE

3. new CfdiData(node) or new RetencionesData(node)
   → throws (missing timbre, emisor, etc.): MISSING_TIMBRE

4. new PdfMakerBuilder(translator, { pageSize }, catalogs)
5. builder.buildStream(data) → ReadableStream
6. reply.type('application/pdf').send(stream)
```

**Why per-request builder with cached catalogs:** `pageSize` is a constructor argument of `PdfMakerBuilder`. Rather than maintaining a builder singleton per paper size, the builder is constructed per request. Construction cost is negligible once catalogs are cached.

### Error classification

Errors from `nodeFromXmlString` and data class constructors are caught and mapped to domain error types defined in `errors.ts`. Anything else propagates as `RENDER_ERROR`.

---

## Dockerfile

Multi-stage build. Final image contains only compiled JS and production dependencies.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
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

`PORT` is configurable via environment variable (default `3000`).

---

## Tests

**Strategy:** Vitest + Fastify's `app.inject()` (in-memory HTTP, no real port). XML fixtures contain fictitious data with structurally valid CFDIs and mock `TimbreFiscalDigital` nodes (invented UUIDs and seals — the library validates presence, not cryptographic correctness).

### `tests/generate.test.ts`

| Test | Fixture | Expected |
|---|---|---|
| Valid CFDI 4.0 | `cfdi40-valid.xml` | 200, `Content-Type: application/pdf`, non-empty body |
| Valid CFDI 3.3 | `cfdi33-valid.xml` | 200, `Content-Type: application/pdf` |
| Nómina 1.2 (CFDI 4.0 with Nómina complement) | `nomina-valid.xml` | 200, `Content-Type: application/pdf` |
| Valid Retenciones | `retenciones-valid.xml` | 200, `Content-Type: application/pdf` |
| Malformed XML | `cfdi-invalid.xml` | 400, `{ code: "INVALID_XML" }` |
| Valid XML missing TimbreFiscalDigital | Inline XML | 400, `{ code: "MISSING_TIMBRE" }` |
| Unknown root element | Inline XML (`<foo/>`) | 400, `{ code: "UNSUPPORTED_TYPE" }` |
| `?paper=a4` | `cfdi40-valid.xml` | 200, valid PDF |

### `tests/health.test.ts`

| Test | Expected |
|---|---|
| GET /health | 200, `{ status: "ok", version: "<semver>" }` |

---

## Out of Scope (Future Stages)

- Custom PDF templates / multiple layout versions
- Logo injection via HTTP header
- `?locale` parameter (library has no locale support)
- MinIO integration (handled by the Python caller)
