import { NotFoundException } from '@nestjs/common';
import { ConsultantRuleService } from './consultant-rule.service';

describe('ConsultantRuleService', () => {
  let prisma: any;
  let auditLog: any;
  let service: ConsultantRuleService;

  beforeEach(() => {
    prisma = { consultantItemRule: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() } };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ConsultantRuleService(prisma, auditLog);
  });

  it('throws NotFoundException for a rule that does not exist', async () => {
    prisma.consultantItemRule.findUnique.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('creates a rule with real defaults and records a real audit entry', async () => {
    prisma.consultantItemRule.create.mockResolvedValue({ id: 'r1', itemKey: 'LAMP' });
    await service.create({ itemKey: 'LAMP', label: 'لامپ' } as any, 'admin1');
    expect(prisma.consultantItemRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemKey: 'LAMP', label: 'لامپ', minQuantity: 0, isActive: true }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'consultant.rule_created' }));
  });

  it('updates a rule and records before/after in the audit entry', async () => {
    prisma.consultantItemRule.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.consultantItemRule.update.mockResolvedValue({ id: 'r1', isActive: false });
    await service.update('r1', { isActive: false }, 'admin1');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consultant.rule_updated', before: { id: 'r1', isActive: true }, after: { id: 'r1', isActive: false } }),
    );
  });

  it('removes a rule and records a real audit entry', async () => {
    prisma.consultantItemRule.findUnique.mockResolvedValue({ id: 'r1' });
    await service.remove('r1', 'admin1');
    expect(prisma.consultantItemRule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'consultant.rule_removed' }));
  });
});
