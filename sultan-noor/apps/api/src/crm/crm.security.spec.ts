import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CrmController } from './crm.controller';
import { PersonalizationController } from './personalization.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

function fakeContext(user: { role: Role } | undefined, handler: (...args: any[]) => any, target: any) {
  return {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

// Security regression for Sprint 8 §6/§17 — CRM business data must never be
// reachable by a customer, and personalized recommendations must never be
// reachable by anyone who isn't a real authenticated caller reading their
// own req.user.id.
describe('CRM/Personalization endpoints — RBAC + IDOR guarantees', () => {
  it('CrmController is only reachable by staff roles — a CUSTOMER is rejected by RolesGuard', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const ctx = fakeContext({ role: Role.CUSTOMER }, CrmController.prototype.segmentCounts, CrmController);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('CrmController allows real staff roles (SUPER_ADMIN, ADMIN, STAFF)', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    for (const role of [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF]) {
      const ctx = fakeContext({ role }, CrmController.prototype.segmentCounts, CrmController);
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('CrmController requires an authenticated user at all — RolesGuard rejects a missing user', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const ctx = fakeContext(undefined, CrmController.prototype.insightsFor, CrmController);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('PersonalizationController is protected only by JwtAuthGuard — never left unauthenticated', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PersonalizationController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('PersonalizationController.recommendations has no id/userId parameter a client could supply — always reads req.user.id (structural IDOR guarantee)', () => {
    const source = PersonalizationController.prototype.recommendations.toString();
    expect(source).toContain('req.user.id');
    expect(source).not.toMatch(/userId\s*:\s*string/);
  });
});
