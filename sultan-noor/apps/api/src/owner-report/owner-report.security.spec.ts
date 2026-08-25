import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { OwnerReportController } from './owner-report.controller';

function fakeContext(user: { role: Role } | undefined, handler: (...args: any[]) => any, target: any) {
  return {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

// Security regression for Sprint 8 §6/§17 — owner sales/inventory/AI-cost
// reports are sensitive business data that must never be reachable by a
// customer.
describe('OwnerReportController — staff-only RBAC', () => {
  it('rejects a CUSTOMER role from reading the daily report', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = fakeContext({ role: Role.CUSTOMER }, OwnerReportController.prototype.daily, OwnerReportController);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated caller (no user on the request) from any owner-report route', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = fakeContext(undefined, OwnerReportController.prototype.weekly, OwnerReportController);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows real staff roles (SUPER_ADMIN, ADMIN, STAFF)', () => {
    const guard = new RolesGuard(new Reflector());
    for (const role of [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF]) {
      const ctx = fakeContext({ role }, OwnerReportController.prototype.daily, OwnerReportController);
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });
});
