import PDFDocument from 'pdfkit';
import { REPORTING_TIME_ZONE, TAX_RATE_BASIS_POINTS } from '../config/constants.js';

const stamp = new Intl.DateTimeFormat('en-IN', {
  timeZone: REPORTING_TIME_ZONE,
  dateStyle: 'medium',
});

const clock = new Intl.DateTimeFormat('en-IN', {
  timeZone: REPORTING_TIME_ZONE,
  timeStyle: 'short',
});

// Indian digit grouping: 12,34,567.89 rather than 1,234,567.89. The rupee sign
// is written as "Rs." because the built-in fonts are WinAnsi encoded and have no
// glyph for it; embedding a font for one character is not worth the file size.
const rupees = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = (cents) => `Rs. ${rupees.format(cents / 100)}`;

const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN;

const LINE = '#333333';
const MUTED = '#666666';
const SHADE = '#f2f2f2';

// Widths total CONTENT exactly, so the grid closes on the right margin.
const COLUMNS = [
  { label: 'S. No.', width: 40, align: 'center' },
  { label: 'Particulars', width: 184, align: 'left' },
  { label: 'SKU', width: 78, align: 'left' },
  { label: 'Qty', width: 38, align: 'center' },
  { label: 'Rate', width: 80, align: 'right' },
  { label: 'Amount', width: 95.28, align: 'right' },
];

const PADDING = 6;

// Returns a live document. The controller pipes it straight to the response, so
// nothing is ever buffered in memory waiting to be big.
export function renderInvoice({ order, organization }) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });

  let y = titleBlock(doc, organization);
  y = partyBlock(doc, order, y);
  y = itemsTable(doc, order, y);
  y = totalsBlock(doc, order, y);
  closingBlock(doc, order, organization, y);

  doc.end();
  return doc;
}

function box(doc, x, y, width, height, fill) {
  if (fill) doc.rect(x, y, width, height).fill(fill);
  doc.lineWidth(0.7).strokeColor(LINE).rect(x, y, width, height).stroke();
  doc.fillColor('#000000');
}

function titleBlock(doc, organization) {
  const top = MARGIN;
  const height = 74;

  box(doc, MARGIN, top, CONTENT, height);

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(MUTED)
    .text('TAX INVOICE', MARGIN, top + 10, { width: CONTENT, align: 'center', characterSpacing: 2 });

  doc
    .font('Times-Bold')
    .fontSize(24)
    .fillColor('#000000')
    .text(organization.name, MARGIN, top + 26, { width: CONTENT, align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text('Inventory and order management', MARGIN, top + 56, {
      width: CONTENT,
      align: 'center',
    });

  doc.fillColor('#000000');
  return top + height;
}

// Two panes sharing one border: who the invoice is for, and what identifies it.
function partyBlock(doc, order, top) {
  const height = 76;
  const half = CONTENT / 2;

  box(doc, MARGIN, top, half, height);
  box(doc, MARGIN + half, top, half, height);

  const pane = (x, rows) => {
    let cursor = top + 9;
    for (const [label, value] of rows) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x + PADDING + 2, cursor, {
        width: 70,
      });
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#000000')
        .text(value, x + PADDING + 74, cursor - 1, { width: half - 84, ellipsis: true });
      cursor += 16;
    }
  };

  pane(MARGIN, [
    ['Billed to', order.customerName],
    ['Phone', order.customerPhone || '—'],
    ['Payment', order.paymentStatus.toLowerCase()],
    ['Status', order.status.toLowerCase()],
  ]);

  pane(MARGIN + half, [
    ['Invoice no.', order.orderNumber],
    ['Date', stamp.format(order.createdAt)],
    ['Time', clock.format(order.createdAt)],
    ['Placed by', order.placedByUser.name],
  ]);

  return top + height;
}

function tableHeader(doc, top) {
  const height = 22;
  let x = MARGIN;

  for (const column of COLUMNS) {
    box(doc, x, top, column.width, height, SHADE);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#000000')
      .text(column.label, x + PADDING, top + 7, {
        width: column.width - PADDING * 2,
        align: column.align,
      });
    x += column.width;
  }

  return top + height;
}

function itemsTable(doc, order, start) {
  let y = tableHeader(doc, start);

  order.lines.forEach((line, index) => {
    const name = `${line.variant.product.name} — ${line.variant.name}`;
    const nameWidth = COLUMNS[1].width - PADDING * 2;

    doc.font('Helvetica').fontSize(9.5);
    const height = Math.max(24, doc.heightOfString(name, { width: nameWidth }) + 12);

    // A long order runs onto a second page with the column headings repeated,
    // otherwise the rows after the break have nothing naming them.
    if (y + height > BOTTOM - 120) {
      doc.addPage();
      y = tableHeader(doc, MARGIN);
    }

    const cells = [
      String(index + 1),
      name,
      line.variant.sku,
      String(line.quantity),
      money(line.unitPriceCents),
      money(line.lineTotalCents),
    ];

    let x = MARGIN;
    cells.forEach((value, column) => {
      const { width, align } = COLUMNS[column];
      box(doc, x, y, width, height);
      doc
        .font('Helvetica')
        // The SKU column is monospaced in spirit if not in font: it is reference
        // data, so it is set smaller than the words a reader actually reads.
        .fontSize(column === 2 ? 8.5 : 9.5)
        .fillColor('#000000')
        .text(value, x + PADDING, y + 7, { width: width - PADDING * 2, align });
      x += width;
    });

    y += height;
  });

  return y;
}

function totalsBlock(doc, order, start) {
  const labelWidth = COLUMNS[0].width + COLUMNS[1].width + COLUMNS[2].width + COLUMNS[3].width;
  const valueWidth = COLUMNS[4].width + COLUMNS[5].width;
  const rate = (TAX_RATE_BASIS_POINTS / 100).toFixed(TAX_RATE_BASIS_POINTS % 100 === 0 ? 0 : 2);

  let y = start;

  // The three totals rows and the closing block travel together. Splitting a
  // total from the table it totals, or stranding the signature alone on a page,
  // both read as a mistake.
  if (y + 66 + 110 > BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  const row = (label, value, emphasis) => {
    const height = emphasis ? 26 : 20;
    box(doc, MARGIN, y, labelWidth, height, emphasis ? SHADE : undefined);
    box(doc, MARGIN + labelWidth, y, valueWidth, height, emphasis ? SHADE : undefined);

    doc
      .font(emphasis ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(emphasis ? 11 : 9.5)
      .fillColor('#000000')
      .text(label, MARGIN + PADDING, y + (emphasis ? 8 : 6), {
        width: labelWidth - PADDING * 2,
        align: 'right',
      });

    doc.text(value, MARGIN + labelWidth + PADDING, y + (emphasis ? 8 : 6), {
      width: valueWidth - PADDING * 2,
      align: 'right',
    });

    y += height;
  };

  row('Subtotal', money(order.subtotalCents));
  row(`Tax (${rate}%)`, money(order.taxCents));
  row('Total', money(order.totalCents), true);

  return y;
}

function closingBlock(doc, order, organization, start) {
  const top = start + 18;
  const height = 92;
  const termsWidth = CONTENT * 0.62;
  const signWidth = CONTENT - termsWidth;

  box(doc, MARGIN, top, termsWidth, height);
  box(doc, MARGIN + termsWidth, top, signWidth, height);

  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor('#000000')
    .text('Terms and notes', MARGIN + PADDING + 2, top + 8);

  const notes = [
    'Amounts are in Indian rupees.',
    `Tax is charged at ${(TAX_RATE_BASIS_POINTS / 100).toFixed(0)}% on the subtotal, rounded once.`,
    'Cancelling this order returns every line to stock as a ledger movement.',
    'This invoice is generated from the order record and needs no signature to be valid.',
  ];

  let cursor = top + 22;
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  for (const note of notes) {
    doc.text(`•  ${note}`, MARGIN + PADDING + 2, cursor, { width: termsWidth - PADDING * 3 });
    cursor += 14;
  }

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text('For', MARGIN + termsWidth + PADDING, top + 10, {
      width: signWidth - PADDING * 2,
      align: 'center',
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#000000')
    .text(organization.name, MARGIN + termsWidth + PADDING, top + 22, {
      width: signWidth - PADDING * 2,
      align: 'center',
      ellipsis: true,
    });

  doc
    .lineWidth(0.7)
    .strokeColor(LINE)
    .moveTo(MARGIN + termsWidth + PADDING * 3, top + height - 24)
    .lineTo(MARGIN + CONTENT - PADDING * 3, top + height - 24)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text('Authorised signatory', MARGIN + termsWidth + PADDING, top + height - 18, {
      width: signWidth - PADDING * 2,
      align: 'center',
    });

  doc.fillColor('#000000');
}
