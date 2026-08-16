import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService.updateRole', () => {
  let prisma: any;
  let auditLog: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new UsersService(prisma, auditLog);
  });

  it('throws NotFoundException for a non-existent target user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.updateRole('admin1', Role.SUPER_ADMIN, 'ghost', Role.STAFF)).rejects.toThrow(NotFoundException);
  });

  it('lets a plain ADMIN promote a CUSTOMER to STAFF', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.CUSTOMER });
    prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.STAFF });

    const result = await service.updateRole('admin1', Role.ADMIN, 'u1', Role.STAFF);
    expect(result.role).toBe(Role.STAFF);
  });

  it('blocks a plain ADMIN from promoting a CUSTOMER to ADMIN (self-escalation surface)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.CUSTOMER });
    await expect(service.updateRole('admin1', Role.ADMIN, 'u1', Role.ADMIN)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks a plain ADMIN from promoting a CUSTOMER to SUPER_ADMIN', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.CUSTOMER });
    await expect(service.updateRole('admin1', Role.ADMIN, 'u1', Role.SUPER_ADMIN)).rejects.toThrow(ForbiddenException);
  });

  it('blocks a plain ADMIN from demoting an existing ADMIN, even to CUSTOMER', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.ADMIN });
    await expect(service.updateRole('admin1', Role.ADMIN, 'u1', Role.CUSTOMER)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks a plain ADMIN from touching an existing SUPER_ADMIN account at all', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.SUPER_ADMIN });
    await expect(service.updateRole('admin1', Role.ADMIN, 'u1', Role.STAFF)).rejects.toThrow(ForbiddenException);
  });

  it('allows SUPER_ADMIN to grant ADMIN and to touch existing admin-tier accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.ADMIN });
    prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.SUPER_ADMIN });

    const result = await service.updateRole('super1', Role.SUPER_ADMIN, 'u1', Role.SUPER_ADMIN);
    expect(result.role).toBe(Role.SUPER_ADMIN);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.role_update', entityId: 'u1' }),
    );
  });
});
