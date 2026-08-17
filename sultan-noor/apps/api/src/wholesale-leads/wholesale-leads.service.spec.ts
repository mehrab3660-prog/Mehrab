import { NotFoundException } from '@nestjs/common';
import { WholesaleLeadsService } from './wholesale-leads.service';

describe('WholesaleLeadsService', () => {
  let prisma: any;
  let notifications: any;
  let service: WholesaleLeadsService;

  beforeEach(() => {
    prisma = {
      wholesaleLead: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new WholesaleLeadsService(prisma, notifications);
  });

  describe('create', () => {
    const dto = { companyName: 'شرکت الف', contactName: 'رضا احمدی', phone: '09121234567', message: 'به دنبال خرید عمده لامپ LED هستیم.' };

    it('persists the lead and returns a confirmation message', async () => {
      prisma.wholesaleLead.create.mockResolvedValue({ id: 'lead1', ...dto });

      const result = await service.create(dto as any);

      expect(prisma.wholesaleLead.create).toHaveBeenCalledWith({ data: dto });
      expect(result.message).toMatch(/ثبت شد/);
    });

    it('notifies every SUPER_ADMIN and ADMIN user about the new lead', async () => {
      prisma.wholesaleLead.create.mockResolvedValue({ id: 'lead1', ...dto });
      prisma.user.findMany.mockResolvedValue([{ id: 'admin1' }, { id: 'admin2' }]);

      await service.create(dto as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
        select: { id: true },
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        'admin1',
        'SYSTEM',
        'درخواست همکاری عمده‌فروشی جدید',
        expect.stringContaining('شرکت الف'),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        'admin2',
        'SYSTEM',
        'درخواست همکاری عمده‌فروشی جدید',
        expect.stringContaining('شرکت الف'),
      );
    });
  });

  describe('listAll', () => {
    it('returns paginated items alongside the total count', async () => {
      prisma.wholesaleLead.findMany.mockResolvedValue([{ id: 'lead1' }]);
      prisma.wholesaleLead.count.mockResolvedValue(1);

      const result = await service.listAll(0, 20);

      expect(prisma.wholesaleLead.findMany).toHaveBeenCalledWith({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } });
      expect(result).toEqual({ items: [{ id: 'lead1' }], total: 1 });
    });
  });

  describe('updateStatus', () => {
    it('rejects when the lead does not exist', async () => {
      prisma.wholesaleLead.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('missing', { status: 'CONTACTED' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.wholesaleLead.update).not.toHaveBeenCalled();
    });

    it('updates the status and admin note for an existing lead', async () => {
      prisma.wholesaleLead.findUnique.mockResolvedValue({ id: 'lead1' });
      prisma.wholesaleLead.update.mockResolvedValue({ id: 'lead1', status: 'CONTACTED' });

      await service.updateStatus('lead1', { status: 'CONTACTED', adminNote: 'تماس گرفته شد' } as any);

      expect(prisma.wholesaleLead.update).toHaveBeenCalledWith({
        where: { id: 'lead1' },
        data: { status: 'CONTACTED', adminNote: 'تماس گرفته شد' },
      });
    });
  });
});
