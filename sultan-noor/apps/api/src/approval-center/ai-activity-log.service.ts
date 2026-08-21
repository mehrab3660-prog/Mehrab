import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 50;

// Real actions performed by / about an AI feature across every Sprint —
// same action-prefix convention already used by DashboardService's
// aiControlCenter recentAiActivity feed, extended with Sprint 8's own
// prefixes (inventory.reorder_*, so reorder approve/reject show up here too).
const AI_ACTION_PREFIXES = ['ai_', 'seo.', 'content.', 'sales.', 'news.', 'inventory.reorder'];

// Fields that must never be persisted or surfaced even if a future AI
// feature's payload accidentally included them — defense in depth for
// Sprint 8 §12 ("OTP، رمز عبور، توکن، اطلاعات پرداخت هرگز نباید ذخیره شوند").
// None of today's AuditLog before/after payloads for AI actions contain
// these, but every entry is scrubbed on the way out regardless.
const SENSITIVE_KEYS = ['otp', 'password', 'token', 'accessToken', 'refreshToken', 'cardNumber', 'cvv', 'paymentToken', 'secret', 'apiKey'];

function scrub(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) continue;
    out[key] = scrub(val);
  }
  return out;
}

export interface AiActivityEntry {
  source: 'AI_USAGE' | 'AUDIT';
  label: string;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  success: boolean | null;
  costToman: number | null;
  approvalRelated: boolean;
  what: unknown;
}

// Sprint 8 §12 — a real, unified AI Activity Log built ONLY from two
// existing, already-audited tables (AiUsageLog for cost/success/time,
// AuditLog for who-did-what/what-changed) — never a new parallel logging
// table, and never a fabricated entry. AiUsageLog rows carry no userId
// (recorded from several already-shipped features whose record() calls
// were never given one), so those entries honestly report userName: null
// ("سیستم") rather than guessing who triggered them.
@Injectable()
export class AiActivityLogService {
  constructor(private prisma: PrismaService) {}

  async list(limit = DEFAULT_LIMIT): Promise<AiActivityEntry[]> {
    const [usageRows, auditRows] = await Promise.all([
      this.prisma.aiUsageLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.auditLog.findMany({
        where: { OR: AI_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })) },
        select: { action: true, entityType: true, entityId: true, before: true, after: true, createdAt: true, userId: true, user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const usageEntries: AiActivityEntry[] = usageRows.map((u) => ({
      source: 'AI_USAGE',
      label: `${u.provider} — ${u.operation}`,
      createdAt: u.createdAt,
      userId: null,
      userName: null,
      success: u.success,
      costToman: u.costToman ? Number(u.costToman) : 0,
      approvalRelated: false,
      what: null,
    }));

    const auditEntries: AiActivityEntry[] = auditRows.map((a) => ({
      source: 'AUDIT',
      label: `${a.action} — ${a.entityType}${a.entityId ? ` (${a.entityId})` : ''}`,
      createdAt: a.createdAt,
      userId: a.userId,
      userName: a.user?.fullName ?? null,
      success: null,
      costToman: null,
      approvalRelated: /approv|reject|generat|publish|auto_fix/i.test(a.action),
      what: { before: scrub(a.before), after: scrub(a.after) },
    }));

    return [...usageEntries, ...auditEntries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }
}
