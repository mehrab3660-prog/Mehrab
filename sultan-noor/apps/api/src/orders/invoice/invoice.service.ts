import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OrderWithInvoiceRelations = Prisma.OrderGetPayload<{ include: { items: true; address: true } }>;

const INVOICE_DIR = process.env.INVOICE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'invoices');

// NOTE: pdfkit's built-in fonts don't shape Arabic/Persian glyphs. For
// production, register a Persian font (e.g. Vazirmatn) via doc.registerFont()
// and reverse/shape the text (e.g. with `bidi-js`) before writing RTL lines.

@Injectable()
export class InvoiceService {
  constructor(private prisma: PrismaService) {}

  async generateForOrder(orderId: string): Promise<{ invoiceNumber: string; pdfUrl: string }> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, address: true },
    });

    const invoiceNumber = `INV-${order.orderNumber}`;
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
    const filePath = this.getFilePath(invoiceNumber);

    await this.renderPdf(filePath, order, invoiceNumber);

    // Not a directly browsable path — /orders/:id/invoice/download enforces
    // ownership/staff auth before streaming the file (see OrdersController).
    const pdfUrl = `/api/orders/${orderId}/invoice/download`;
    await this.prisma.invoice.upsert({
      where: { orderId },
      create: { orderId, invoiceNumber, pdfUrl },
      update: { pdfUrl },
    });

    return { invoiceNumber, pdfUrl };
  }

  getFilePath(invoiceNumber: string): string {
    return path.join(INVOICE_DIR, `${invoiceNumber}.pdf`);
  }

  private renderPdf(filePath: string, order: OrderWithInvoiceRelations, invoiceNumber: string) {
    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(20).text('فروشگاه سلطان نور', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`فاکتور: ${invoiceNumber}`);
      doc.text(`شماره سفارش: ${order.orderNumber}`);
      doc.text(`تاریخ: ${new Date().toLocaleDateString('fa-IR')}`);
      doc.text(`گیرنده: ${order.address.receiverName} - ${order.address.receiverPhone}`);
      doc.text(`آدرس: ${order.address.province}، ${order.address.city}، ${order.address.line1}`);
      doc.moveDown();

      doc.fontSize(13).text('اقلام سفارش:', { underline: true });
      order.items.forEach((item) => {
        doc
          .fontSize(11)
          .text(`${item.nameSnapshot} × ${item.quantity} — ${item.lineTotal.toString()} تومان`);
      });

      doc.moveDown();
      doc.fontSize(12).text(`جمع جزء: ${order.subtotal.toString()} تومان`);
      doc.text(`تخفیف: ${order.discountTotal.toString()} تومان`);
      doc.text(`هزینه ارسال: ${order.shippingTotal.toString()} تومان`);
      doc.fontSize(14).text(`مبلغ نهایی: ${order.grandTotal.toString()} تومان`, { underline: true });

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
  }
}
