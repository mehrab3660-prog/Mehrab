import { AiActivityLogService } from './ai-activity-log.service';

describe('AiActivityLogService — real union of AiUsageLog + AuditLog, never a fabricated entry (§12)', () => {
  let prisma: any;
  let service: AiActivityLogService;

  beforeEach(() => {
    prisma = {
      aiUsageLog: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new AiActivityLogService(prisma);
  });

  it('reports a real AiUsageLog row with an honest null user — never guesses who triggered a call with no captured userId', async () => {
    prisma.aiUsageLog.findMany.mockResolvedValue([
      { id: 'u1', provider: 'seo-generation', operation: 'seo-generation', draftId: 'p1', costToman: 250, success: true, note: null, createdAt: new Date() },
    ]);

    const [entry] = await service.list();

    expect(entry.source).toBe('AI_USAGE');
    expect(entry.userId).toBeNull();
    expect(entry.userName).toBeNull();
    expect(entry.costToman).toBe(250);
    expect(entry.success).toBe(true);
  });

  it('reports a real AuditLog row with its real user and marks approval-related actions, including non-suffix forms like content.approved_as_draft', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        action: 'content.approved_as_draft',
        entityType: 'SalesRecommendation',
        entityId: 'r1',
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'APPROVED' },
        createdAt: new Date(),
        userId: 'admin1',
        user: { fullName: 'مدیر فروشگاه' },
      },
    ]);

    const [entry] = await service.list();

    expect(entry.source).toBe('AUDIT');
    expect(entry.userId).toBe('admin1');
    expect(entry.userName).toBe('مدیر فروشگاه');
    expect(entry.approvalRelated).toBe(true);
  });

  it('only queries AuditLog rows whose action matches a real known AI-related prefix', async () => {
    await service.list();

    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    const prefixes = where.OR.map((c: any) => c.action.startsWith);
    expect(prefixes).toEqual(expect.arrayContaining(['ai_', 'seo.', 'content.', 'sales.', 'news.', 'inventory.reorder']));
  });

  it('scrubs any sensitive-looking key from a real audit before/after payload as defense in depth', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        action: 'ai_something',
        entityType: 'X',
        entityId: 'x1',
        before: null,
        after: { note: 'ok', apiKey: 'sk-secret-value', nested: { password: 'p', keep: 'this' } },
        createdAt: new Date(),
        userId: null,
        user: null,
      },
    ]);

    const [entry] = await service.list();
    const after = (entry.what as any).after;

    expect(after.apiKey).toBeUndefined();
    expect(after.nested.password).toBeUndefined();
    expect(after.nested.keep).toBe('this');
    expect(after.note).toBe('ok');
  });

  it('merges both real sources and sorts by real createdAt, most recent first, capped at the requested limit', async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    prisma.aiUsageLog.findMany.mockResolvedValue([{ id: 'u1', provider: 'news-generation', operation: 'x', draftId: null, costToman: 100, success: true, note: null, createdAt: new Date(now.getTime() - 2 * day) }]);
    prisma.auditLog.findMany.mockResolvedValue([{ action: 'news.published', entityType: 'NewsItem', entityId: 'n1', before: null, after: null, createdAt: now, userId: 'admin1', user: { fullName: 'مدیر' } }]);

    const result = await service.list(10);

    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('AUDIT'); // most recent
    expect(result[1].source).toBe('AI_USAGE');
  });
});
