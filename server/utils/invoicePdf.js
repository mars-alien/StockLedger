import PDFDocument from 'pdfkit';
import { REPORTING_TIME_ZONE } from '../config/constants.js';
import { formatPaise } from './money.js';

const stamp = new Intl.DateTimeFormat('en-IN', {
  timeZone: REPORTING_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const PAGE_MARGIN = 50;
const COLUMNS = { item: 50, sku: 250, quantity: 350, price: 410, total: 490 };

// Returns a live document. The controller pipes it straight to the response, so
// nothing is ever buffered in memory waiting to be big.
export function renderInvoice({ order, organization }) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });

  header(doc, organization, order);
  lines(doc, order);
  totals(doc, order);
  footer(doc, order);

  doc.end();
  return doc;
}

function header(doc, organization, order) {
  doc.fontSize(18).text(organization.name);
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor('#666').text('Tax invoice');
  doc.fillColor('#000');

  doc.moveDown(1.5);
  doc.fontSize(10);
  doc.text(`Invoice ${order.orderNumber}`);
  doc.text(`Date ${stamp.format(order.createdAt)}`);
  doc.text(`Billed to ${order.customerName}`);
  if (order.customerPhone) {
    doc.text(`Phone ${order.customerPhone}`);
  }
  doc.text(`Payment ${order.paymentStatus.toLowerCase()}`);

  doc.moveDown(1.5);
}

function lines(doc, order) {
  const top = doc.y;

  doc.fontSize(9).fillColor('#666');
  doc.text('Item', COLUMNS.item, top);
  doc.text('SKU', COLUMNS.sku, top);
  doc.text('Qty', COLUMNS.quantity, top, { width: 40, align: 'right' });
  doc.text('Price', COLUMNS.price, top, { width: 70, align: 'right' });
  doc.text('Total', COLUMNS.total, top, { width: 70, align: 'right' });
  doc.fillColor('#000');

  rule(doc, top + 14);
  doc.y = top + 22;

  doc.fontSize(10);
  for (const line of order.lines) {
    const row = doc.y;
    doc.text(`${line.variant.product.name} — ${line.variant.name}`, COLUMNS.item, row, {
      width: 190,
    });
    doc.text(line.variant.sku, COLUMNS.sku, row, { width: 90 });
    doc.text(String(line.quantity), COLUMNS.quantity, row, { width: 40, align: 'right' });
    doc.text(formatPaise(line.unitPriceCents), COLUMNS.price, row, { width: 70, align: 'right' });
    doc.text(formatPaise(line.lineTotalCents), COLUMNS.total, row, { width: 70, align: 'right' });
    doc.moveDown(0.6);
  }

  rule(doc, doc.y + 4);
  doc.y += 14;
}

function totals(doc, order) {
  const amount = (label, cents, bold) => {
    const row = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, COLUMNS.price - 90, row, { width: 150, align: 'right' });
    doc.text(formatPaise(cents), COLUMNS.total, row, { width: 70, align: 'right' });
    doc.moveDown(0.5);
  };

  amount('Subtotal', order.subtotalCents);
  amount('Tax', order.taxCents);
  amount('Total', order.totalCents, true);
  doc.font('Helvetica');
}

function footer(doc, order) {
  doc.moveDown(3);
  doc.fontSize(8).fillColor('#666');
  doc.text(`Placed by ${order.placedByUser.name}.`, COLUMNS.item);
  doc.text('Amounts are in Indian rupees and include tax where shown.', COLUMNS.item);
}

function rule(doc, y) {
  doc
    .strokeColor('#dddddd')
    .moveTo(PAGE_MARGIN, y)
    .lineTo(doc.page.width - PAGE_MARGIN, y)
    .stroke()
    .strokeColor('#000000');
}
