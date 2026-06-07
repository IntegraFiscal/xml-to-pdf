import { type CfdiData, formatCurrency, GenericCfdiTranslator } from '@nodecfdi/cfdi-to-pdf';
import type { XmlNodeInterface } from '@nodecfdi/cfdi-core/types';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';

// ─── SAT catalogs ─────────────────────────────────────────────────────────────

const TIPOS_NOMINA: Record<string, string> = { O: 'Ordinaria', E: 'Extraordinaria' };

const TIPOS_PERCEPCION: Record<string, string> = {
  '001': 'Sueldos, salarios rayas y jornales',
  '002': 'Gratificación anual (aguinaldo)',
  '003': 'Participación de los trabajadores en las utilidades PTU',
  '004': 'Reembolso de gastos médicos, dentales y hospitalarios',
  '005': 'Fondo de ahorro',
  '006': 'Caja de ahorro',
  '007': 'Contribuciones a cargo del trabajador pagadas por el patrón',
  '008': 'Premios por puntualidad',
  '009': 'Prima dominical',
  '010': 'Horas extras',
  '011': 'Prima vacacional',
  '012': 'Prima de antigüedad',
  '013': 'Pagos por separación',
  '014': 'Seguro de vida',
  '015': 'Reembolso por funeral',
  '016': 'Cuotas sindicales pagadas por el patrón',
  '017': 'Subsidios por incapacidad',
  '018': 'Becas para trabajadores y/o hijos',
  '019': 'Horas extras (tiempo libre)',
  '020': 'Prima dominical (tiempo libre)',
  '021': 'Alimentación',
  '022': 'Habitación',
  '023': 'Premios por asistencia',
  '028': 'Seguro de gastos médicos mayores',
  '030': 'Plan de pensiones complementarios',
  '031': 'Seguro de retiro',
  '032': 'Viáticos (entregados al trabajador)',
  '034': 'Ayuda para renta',
  '035': 'Ayuda para artículos escolares y uniformes',
  '036': 'Ayuda para anteojos',
  '037': 'Ayuda para transporte',
  '038': 'Ayuda para gastos de funeral',
  '039': 'Otros ingresos por salarios',
  '044': 'Jubilaciones, pensiones o haberes de retiro en parcialidades',
  '045': 'Jubilaciones, pensiones o haberes de retiro en una sola exhibición',
  '046': 'Ingresos en acciones o títulos de valor',
  '047': 'Alimentación gravable',
  '048': 'Habitación gravable',
  '049': 'Gratificaciones, primas, compensaciones, recompensas u otros',
  '050': 'Viáticos (efectivamente erogados por el trabajador)',
};

const TIPOS_DEDUCCION: Record<string, string> = {
  '001': 'Seguridad social',
  '002': 'ISR',
  '003': 'Aportaciones a retiro, cesantía en edad avanzada y vejez',
  '004': 'Otros',
  '005': 'Aportaciones a Fondo de vivienda',
  '006': 'Descuento por incapacidad',
  '007': 'Pensión alimenticia',
  '008': 'Renta',
  '009': 'Préstamos INFONAVIT',
  '010': 'Pago por crédito de vivienda',
  '011': 'Pago de abonos INFONACOT',
  '012': 'Anticipo de salarios',
  '013': 'Pagos hechos con exceso al trabajador',
  '014': 'Errores',
  '015': 'Pérdidas',
  '016': 'Averías',
  '018': 'Cuotas para sociedades cooperativas y cajas de ahorro',
  '019': 'Cuotas sindicales',
  '020': 'Ausencias (Faltas)',
  '021': 'Cuotas obrero patronales',
  '022': 'Impuestos locales',
  '023': 'Aportaciones voluntarias',
  '099': 'Otros',
};

const METODOS_PAGO: Record<string, string> = {
  PUE: 'Pago en una sola exhibición',
  PPD: 'Pago en parcialidades o diferido',
};

const FORMAS_PAGO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '28': 'Tarjeta de débito',
  '99': 'Por definir',
};

// ─── Importe con letra (MXN) ──────────────────────────────────────────────────

const _U = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS',
  'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
];
const _T = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const _H = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

function _i2w(n: number): string {
  if (n === 0) return 'CERO';
  if (n <= 19) return _U[n];
  if (n === 20) return 'VEINTE';
  if (n < 30) return 'VEINTI' + _U[n - 20];
  if (n < 100) { const u = n % 10; return u ? `${_T[Math.floor(n / 10)]} Y ${_U[u]}` : _T[Math.floor(n / 10)]; }
  if (n === 100) return 'CIEN';
  if (n < 1000) { const r = n % 100; return r ? `${_H[Math.floor(n / 100)]} ${_i2w(r)}` : _H[Math.floor(n / 100)]; }
  if (n < 1_000_000) {
    const t = Math.floor(n / 1000); const r = n % 1000;
    const p = t === 1 ? 'MIL' : `${_i2w(t)} MIL`;
    return r ? `${p} ${_i2w(r)}` : p;
  }
  const m = Math.floor(n / 1_000_000); const r = n % 1_000_000;
  const p = m === 1 ? 'UN MILLON' : `${_i2w(m)} MILLONES`;
  return r ? `${p} ${_i2w(r)}` : p;
}

function numberToWords(amount: number): string {
  const intPart = Math.floor(amount);
  const cents = Math.round((amount - intPart) * 100);
  return `${intPart === 0 ? 'CERO' : _i2w(intPart)} PESOS ${String(cents).padStart(2, '0')}/100 M.N.`;
}

// ─── Cell / layout helpers ────────────────────────────────────────────────────

function a(node: XmlNodeInterface, name: string): string {
  return node.hasAttribute(name) ? node.getAttribute(name) : '';
}

function parseAntiguedad(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/);
  if (!m) return iso;
  const parts: string[] = [];
  if (m[1]) parts.push(`${m[1]} año(s)`);
  if (m[2]) parts.push(`${m[2]} mes(es)`);
  if (m[3]) parts.push(`${m[3]} semana(s)`);
  if (m[4]) parts.push(`${m[4]} día(s)`);
  return parts.join(', ') || iso;
}

function toNumber(value: string): number {
  return parseFloat(value) || 0;
}

function labelCell(text: string, primaryColor: string): TableCell {
  return { text, color: primaryColor, bold: true, fontSize: 7, margin: [0, 1, 2, 1] as [number, number, number, number] };
}

function valueCell(text: string, extra: Record<string, unknown> = {}): TableCell {
  return { text, fontSize: 7, margin: [0, 1, 0, 1] as [number, number, number, number], ...extra } as TableCell;
}

function headerCell(text: string, primaryColor: string): TableCell {
  return {
    text,
    style: 'tableHeader',
    fillColor: primaryColor,
    margin: [0, 2, 0, 2] as [number, number, number, number],
    fontSize: 7,
  };
}

function sectionTitle(text: string, primaryColor: string, marginTop = 0): Content {
  return {
    text,
    style: 'tableSubtitleHeader',
    color: primaryColor,
    margin: [0, marginTop, 0, 1] as [number, number, number, number],
  } as Content;
}

const compactLayout = {
  defaultBorder: false,
  hLineWidth: (i: number) => (i === 1 ? 2 : 1),
  hLineColor: () => '#cccccc',
  paddingTop: () => 1,
  paddingBottom: () => 1,
  paddingLeft: () => 2,
  paddingRight: () => 2,
};

const microLayout = {
  defaultBorder: false,
  paddingTop: () => 1,
  paddingBottom: () => 1,
  paddingLeft: () => 2,
  paddingRight: () => 2,
};

// ─── Section: Datos del empleado (mismo patrón visual que emisor/receptor) ───

function empleadoSection(
  nomina: XmlNodeInterface,
  cfdiReceptor: XmlNodeInterface,
  primaryColor: string,
  bgGrayColor: string,
): Content {
  const receptor = nomina.searchNode('nomina12:Receptor');
  const emisor = nomina.searchNode('nomina12:Emisor');
  const nombreEmpleado = a(cfdiReceptor, 'Nombre');

  // Columna izquierda: identidad del empleado
  const leftData: TableCell[][] = [];
  if (nombreEmpleado) {
    leftData.push([{ text: nombreEmpleado, style: ['subHeader'], color: primaryColor }]);
  }
  const addL = (label: string, value: string) => {
    if (value) leftData.push([{ text: [{ text: `${label} `, color: primaryColor }, { text: value }] }]);
  };
  addL('RFC', a(cfdiReceptor, 'Rfc'));
  addL('CURP', a(receptor!, 'Curp'));
  addL('NSS', a(receptor!, 'NumSeguridadSocial'));
  addL('No. Empleado', a(receptor!, 'NumEmpleado'));
  addL('Inicio rel. laboral', a(receptor!, 'FechaInicioRelLaboral'));
  addL('Antigüedad', parseAntiguedad(a(receptor!, 'Antiguedad')));
  addL('Tipo contrato', a(receptor!, 'TipoContrato'));
  addL('Tipo jornada', a(receptor!, 'TipoJornada'));
  if (leftData.length === 0) leftData.push([{ text: '' }]);

  // Columna derecha: datos laborales / nómina
  const rightData: TableCell[][] = [];
  const addR = (label: string, value: string) => {
    if (value) rightData.push([{ text: [{ text: `${label} `, color: primaryColor }, { text: value }] }]);
  };
  addR('Tipo nómina', TIPOS_NOMINA[a(nomina, 'TipoNomina')] ?? a(nomina, 'TipoNomina'));
  addR('Período', `${a(nomina, 'FechaInicialPago')} – ${a(nomina, 'FechaFinalPago')}`);
  addR('Días pagados', a(nomina, 'NumDiasPagados'));
  addR('Fecha de pago', a(nomina, 'FechaPago'));
  addR('Puesto', a(receptor!, 'Puesto'));
  addR('Departamento', a(receptor!, 'Departamento'));
  addR('Sal. base cot.', formatCurrency(a(receptor!, 'SalarioBaseCotApor')));
  addR('SDI', formatCurrency(a(receptor!, 'SalarioDiarioIntegrado')));
  if (emisor) addR('Reg. patronal', a(emisor, 'RegistroPatronal'));
  if (rightData.length === 0) rightData.push([{ text: '' }]);

  return {
    table: {
      widths: ['49.5%', '*', '49.5%'],
      body: [
        [
          { text: 'Datos del empleado', style: ['tableSubtitleHeader'], color: primaryColor },
          '',
          { text: 'Datos laborales', style: ['tableSubtitleHeader'], color: primaryColor },
        ],
        [
          {
            fillColor: bgGrayColor,
            table: { widths: ['*'], body: leftData },
            layout: 'tableLayout',
            border: [false, false, false, true],
          },
          '',
          {
            fillColor: bgGrayColor,
            table: { widths: ['*'], body: rightData },
            layout: 'tableLayout',
            border: [false, false, false, true],
          },
        ],
      ],
    },
    layout: 'tableLayout',
  } as Content;
}

// ─── Section: Percepciones | Deducciones en 2 columnas ───────────────────────

function buildPercepcionesTable(
  percepciones: XmlNodeInterface,
  primaryColor: string,
  bgGrayColor: string,
): Content {
  const list = percepciones.searchNodes('nomina12:Percepcion');
  const headers: TableCell[] = ['No.', 'Concepto', 'Gravado', 'Exento'].map((t) =>
    headerCell(t, primaryColor),
  );

  const dataRows: TableCell[][] = list.map((p: XmlNodeInterface) => [
    valueCell(a(p, 'Clave'), { alignment: 'center', fillColor: bgGrayColor }),
    valueCell(TIPOS_PERCEPCION[a(p, 'TipoPercepcion')] ?? a(p, 'Concepto'), { fillColor: bgGrayColor }),
    valueCell(formatCurrency(a(p, 'ImporteGravado')), { alignment: 'right', fillColor: bgGrayColor }),
    valueCell(formatCurrency(a(p, 'ImporteExento')), { alignment: 'right', fillColor: bgGrayColor }),
  ]);

  const totalRow: TableCell[] = [
    { text: 'Total', colSpan: 2, bold: true, color: primaryColor, alignment: 'right', fontSize: 7, border: [false, true, false, false] },
    {},
    { text: formatCurrency(a(percepciones, 'TotalGravado')), alignment: 'right', bold: true, fontSize: 7, border: [false, true, false, false] },
    { text: formatCurrency(a(percepciones, 'TotalExento')), alignment: 'right', bold: true, fontSize: 7, border: [false, true, false, false] },
  ];

  return {
    stack: [
      sectionTitle('Percepciones', primaryColor),
      {
        table: {
          widths: ['10%', '*', '22%', '18%'],
          body: [headers, ...dataRows, totalRow],
          dontBreakRows: true,
          headerRows: 1,
        },
        layout: compactLayout,
      },
    ],
  } as Content;
}

function buildDeduccionesTable(
  deducciones: XmlNodeInterface,
  primaryColor: string,
  bgGrayColor: string,
): Content {
  const list = deducciones.searchNodes('nomina12:Deduccion');
  const headers: TableCell[] = ['No.', 'Concepto', 'Importe'].map((t) =>
    headerCell(t, primaryColor),
  );

  let total = 0;
  const dataRows: TableCell[][] = list.map((d: XmlNodeInterface) => {
    total += toNumber(a(d, 'Importe'));
    return [
      valueCell(a(d, 'Clave'), { alignment: 'center', fillColor: bgGrayColor }),
      valueCell(TIPOS_DEDUCCION[a(d, 'TipoDeduccion')] ?? a(d, 'Concepto'), { fillColor: bgGrayColor }),
      valueCell(formatCurrency(a(d, 'Importe')), { alignment: 'right', fillColor: bgGrayColor }),
    ];
  });

  const totalRow: TableCell[] = [
    { text: 'Total', colSpan: 2, bold: true, color: primaryColor, alignment: 'right', fontSize: 7, border: [false, true, false, false] },
    {},
    { text: formatCurrency(total), alignment: 'right', bold: true, fontSize: 7, border: [false, true, false, false] },
  ];

  return {
    stack: [
      sectionTitle('Deducciones', primaryColor),
      {
        table: {
          widths: ['10%', '*', '28%'],
          body: [headers, ...dataRows, totalRow],
          dontBreakRows: true,
          headerRows: 1,
        },
        layout: compactLayout,
      },
    ],
  } as Content;
}

function percepcionesDeduccionesSection(
  nomina: XmlNodeInterface,
  primaryColor: string,
  bgGrayColor: string,
): Content | null {
  const percepciones = nomina.searchNode('nomina12:Percepciones');
  const deducciones = nomina.searchNode('nomina12:Deducciones');

  if (!percepciones) return null;

  const leftContent = buildPercepcionesTable(percepciones, primaryColor, bgGrayColor);

  if (deducciones && deducciones.searchNodes('nomina12:Deduccion').length > 0) {
    const rightContent = buildDeduccionesTable(deducciones, primaryColor, bgGrayColor);
    return {
      columns: [
        { width: '49%', stack: [leftContent] },
        { width: '2%', text: '' },
        { width: '49%', stack: [rightContent] },
      ],
      columnGap: 0,
    } as Content;
  }

  return leftContent;
}

// ─── Section: Totales de nómina ───────────────────────────────────────────────

function nominaTotalesSection(
  nomina: XmlNodeInterface,
  comprobante: XmlNodeInterface,
  primaryColor: string,
): Content {
  const totalPerc = toNumber(a(nomina, 'TotalPercepciones'));
  const totalOtros = toNumber(a(nomina, 'TotalOtrosPagos'));
  const totalDed = toNumber(a(nomina, 'TotalDeducciones'));
  const neto = toNumber(a(comprobante, 'Total'));

  const body: TableCell[][] = [
    [
      { text: '', border: [false, false, false, false] },
      { text: 'Total percepciones:', bold: true, color: primaryColor, fontSize: 7, alignment: 'right' },
      { text: formatCurrency(totalPerc), fontSize: 7, alignment: 'right' },
    ],
  ];

  if (totalOtros > 0) {
    body.push([
      { text: '', border: [false, false, false, false] },
      { text: 'Total otros pagos:', bold: true, color: primaryColor, fontSize: 7, alignment: 'right' },
      { text: formatCurrency(totalOtros), fontSize: 7, alignment: 'right' },
    ]);
  }

  body.push(
    [
      { text: '', border: [false, false, false, false] },
      { text: 'Total deducciones:', bold: true, color: primaryColor, fontSize: 7, alignment: 'right' },
      { text: formatCurrency(totalDed), fontSize: 7, alignment: 'right' },
    ],
    [
      { text: '', border: [false, false, false, false] },
      { text: 'NETO A PAGAR:', bold: true, color: 'white', fillColor: primaryColor, fontSize: 8, alignment: 'right' },
      { text: formatCurrency(neto), bold: true, color: 'white', fillColor: primaryColor, fontSize: 8, alignment: 'right' },
    ],
  );

  return {
    stack: [
      {
        table: { widths: ['*', '22%', '18%'], body, dontBreakRows: true },
        layout: compactLayout,
      },
    ],
    unbreakable: true,
  } as Content;
}

// ─── Section: Importe con letra + método / forma de pago ─────────────────────

function nominaInfoSection(
  comprobante: XmlNodeInterface,
  primaryColor: string,
  bgGrayColor: string,
): Content | null {
  const total = toNumber(a(comprobante, 'Total'));
  const metodoPago = a(comprobante, 'MetodoPago');
  const formaPago = a(comprobante, 'FormaPago');

  if (!total && !metodoPago && !formaPago) return null;

  const rows: TableCell[][] = [];

  if (total > 0) {
    rows.push([
      labelCell('Importe con letra:', primaryColor),
      {
        text: numberToWords(total),
        fontSize: 7,
        colSpan: 3,
        fillColor: bgGrayColor,
        margin: [0, 1, 0, 1] as [number, number, number, number],
      } as TableCell,
      {} as TableCell,
      {} as TableCell,
    ]);
  }

  const mpText = metodoPago ? `${metodoPago} – ${METODOS_PAGO[metodoPago] ?? metodoPago}` : '';
  const fpText = formaPago ? `${formaPago} – ${FORMAS_PAGO[formaPago] ?? formaPago}` : '';

  if (mpText || fpText) {
    rows.push([
      labelCell('Método de pago:', primaryColor),
      valueCell(mpText, { fillColor: bgGrayColor }),
      labelCell('Forma de pago:', primaryColor),
      valueCell(fpText, { fillColor: bgGrayColor }),
    ]);
  }

  if (!rows.length) return null;

  return {
    table: {
      widths: ['15%', '35%', '15%', '35%'],
      body: rows,
      dontBreakRows: true,
    },
    layout: microLayout,
  } as Content;
}

// ─── Translator ───────────────────────────────────────────────────────────────

export class NominaCfdiTranslator {
  private inner = new GenericCfdiTranslator();

  translate(
    data: CfdiData,
    documentOptions: unknown,
    catalogs: unknown,
    primaryColor: string,
    bgGrayColor: string,
  ): TDocumentDefinitions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = this.inner.translate(data, documentOptions as any, catalogs as any, primaryColor, bgGrayColor);

    const comprobante = data.comprobante();
    const nomina = comprobante.searchNode('cfdi:Complemento', 'nomina12:Nomina');
    if (!nomina) return doc;

    const content = doc.content as Content[];

    // Pop stamp (always last)
    const stamp = content.pop()!;

    // Remove CFDI totales + details section (4 items before stamp)
    content.splice(-4, 4);

    // Replace generic receptor section (index 4+5) with "Datos del empleado"
    const cfdiReceptor = comprobante.searchNode('cfdi:Receptor')!;
    content.splice(4, 2, empleadoSection(nomina, cfdiReceptor, primaryColor, bgGrayColor), '\n');

    // Percepciones | Deducciones in 2 columns
    const percDed = percepcionesDeduccionesSection(nomina, primaryColor, bgGrayColor);
    if (percDed) content.push('\n', percDed);

    // Nómina totals
    content.push('\n', nominaTotalesSection(nomina, comprobante, primaryColor));

    // Importe con letra + método/forma de pago
    const info = nominaInfoSection(comprobante, primaryColor, bgGrayColor);
    if (info) content.push('\n', info);

    // Stamp last
    content.push('\n', stamp);

    return doc;
  }
}
