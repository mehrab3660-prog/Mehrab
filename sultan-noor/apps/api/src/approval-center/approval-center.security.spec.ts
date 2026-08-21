import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApprovalCenterController } from './approval-center.controller';

function fakeContext(user: { role: Role } | undefined, handler: (...args: any[]) => any, target: any) {
  return {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

// Security regression for Sprint 8 §6/§17 — the Approval Center is the
// single hub that can trigger every domain's approve()/reject(); a customer
// or unauthenticated caller must never reach it.
describe('ApprovalCenterController — staff-only RBAC', () => {
  it('rejects a CUSTOMER role from reading the aggregated list', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = fakeContext({ role: Role.CUSTOMER }, ApprovalCenterController.prototype.list, ApprovalCenterController);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a CUSTOMER role from approving an item', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = fakeContext({ role: Role.CUSTOMER }, ApprovalCenterController.prototype.approve, ApprovalCenterController);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated caller from the AI activity log', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = fakeContext(undefined, ApprovalCenterController.prototype.activity, ApprovalCenterController);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows real staff roles (SUPER_ADMIN, ADMIN, STAFF)', () => {
    const guard = new RolesGuard(new Reflector());
    for (const role of [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF]) {
      const ctx = fakeContext({ role }, ApprovalCenterController.prototype.list, ApprovalCenterController);
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });
});
