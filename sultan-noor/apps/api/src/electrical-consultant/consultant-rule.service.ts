import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateConsultantItemRuleDto, UpdateConsultantItemRuleDto } from './dto/consultant.dto';

// Admin control over the Smart Electrical Consultant's calculation rules
// (§12): which real category/keywords/curated product ids each shopping-
// list item type is allowed to match against, plus its min/max quantity and
// priority brands. If no active rule exists for an item type, the
// consultant simply omits that item — it never invents a category mapping.
@Injectable()
export class ConsultantRuleService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.consultantItemRule.findMany({ orderBy: { itemKey: 'asc' } });
  }

  async getById(id: string) {
    const rule = await this.prisma.consultantItemRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('قانون محاسبه یافت نشد');
    return rule;
  }

  async create(dto: CreateConsultantItemRuleDto, userId?: string) {
    const rule = await this.prisma.consultantItemRule.create({
      data: {
        itemKey: dto.itemKey,
        label: dto.label,
        categoryId: dto.categoryId,
        keywords: dto.keywords,
        minQuantity: dto.minQuantity ?? 0,
        maxQuantity: dto.maxQuantity,
        priorityBrandIds: dto.priorityBrandIds,
        allowedProductIdsJson: dto.allowedProductIdsJson,
        isActive: dto.isActive ?? true,
      },
    });
    await this.auditLog.record({ userId, action: 'consultant.rule_created', entityType: 'ConsultantItemRule', entityId: rule.id, after: rule });
    return rule;
  }

  async update(id: string, dto: UpdateConsultantItemRuleDto, userId?: string) {
    const before = await this.getById(id);
    const rule = await this.prisma.consultantItemRule.update({ where: { id }, data: dto });
    await this.auditLog.record({ userId, action: 'consultant.rule_updated', entityType: 'ConsultantItemRule', entityId: id, before, after: rule });
    return rule;
  }

  async remove(id: string, userId?: string) {
    const before = await this.getById(id);
    await this.prisma.consultantItemRule.delete({ where: { id } });
    await this.auditLog.record({ userId, action: 'consultant.rule_removed', entityType: 'ConsultantItemRule', entityId: id, before });
    return { success: true };
  }
}
