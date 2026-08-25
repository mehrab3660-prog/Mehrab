import { classifySegment, CustomerSegmentationService } from './customer-segmentation.service';

describe('classifySegment — deterministic, never a guess (§3/§16)', () => {
  const now = new Date();
  function daysAgoDate(days: number) {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  it('always classifies a WHOLESALE customer as B2B regardless of order history', () => {
    expect(classifySegment({ customerType: 'WHOLESALE', orderCount: 0, totalSpend: 0, lastOrderAt: null, firstOrderAt: null })).toBe('B2B');
  });

  it('classifies a customer with zero real orders as NO_ORDERS — never NEW or INACTIVE by guesswork', () => {
    expect(classifySegment({ customerType: 'RETAIL', orderCount: 0, totalSpend: 0, lastOrderAt: null, firstOrderAt: null })).toBe('NO_ORDERS');
  });

  it('classifies a single recent real order as NEW', () => {
    const d = daysAgoDate(5);
    expect(classifySegment({ customerType: 'RETAIL', orderCount: 1, totalSpend: 100000, lastOrderAt: d, firstOrderAt: d })).toBe('NEW');
  });

  it('classifies a real order older than the inactive window as INACTIVE', () => {
    const d = daysAgoDate(200);
    expect(classifySegment({ customerType: 'RETAIL', orderCount: 2, totalSpend: 200000, lastOrderAt: d, firstOrderAt: daysAgoDate(400) })).toBe('INACTIVE');
  });

  it('classifies a real order between the active and inactive windows as LOW_ACTIVITY', () => {
    const d = daysAgoDate(90);
    expect(classifySegment({ customerType: 'RETAIL', orderCount: 2, totalSpend: 200000, lastOrderAt: d, firstOrderAt: daysAgoDate(200) })).toBe('LOW_ACTIVITY');
  });

  it('classifies a real recent customer with many real orders as LOYAL', () => {
    const d = daysAgoDate(10);
    expect(classifySegment({ customerType: 'RETAIL', orderCount: 6, totalSpend: 1000000, lastOrderAt: d, firstOrderAt: daysAgoDate(300) })).toBe('LOYAL');
  });

  it('classifies a real recent customer with few real orders as ACTIVE', () => {
    const d = daysAgoDate(10);
    expect(classifySegment({ customerType: 'RETAIL', orderCount: 2, totalSpend: 200000, lastOrderAt: d, firstOrderAt: daysAgoDate(50) })).toBe('ACTIVE');
  });
});

describe('CustomerSegmentationService — bulk, N+1-free real aggregation (§18)', () => {
  let prisma: any;
  let service: CustomerSegmentationService;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CustomerSegmentationService(prisma);
  });

  it('computes real order aggregates from a single bulk query, never per-customer', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', fullName: 'کاربر یک', phone: '0912', customerType: 'RETAIL' }]);
    prisma.order.findMany.mockResolvedValue([
      { userId: 'u1', grandTotal: 100000, createdAt: new Date() },
      { userId: 'u1', grandTotal: 50000, createdAt: new Date() },
    ]);

    const [summary] = await service.summarize();

    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(summary.orderCount).toBe(2);
    expect(summary.totalSpend).toBe(150000);
  });

  it('only ever counts real, paid/shipped/delivered order statuses toward spend', async () => {
    await service.summarize();
    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['PROCESSING', 'SHIPPED', 'DELIVERED']);
  });

  it('filters a segment list to exactly the requested real segment', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', fullName: 'وفادار', phone: '1', customerType: 'WHOLESALE' },
      { id: 'u2', fullName: 'بدون سفارش', phone: '2', customerType: 'RETAIL' },
    ]);
    prisma.order.findMany.mockResolvedValue([]);

    const result = await service.list('B2B' as any);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].userId).toBe('u1');
  });
});
