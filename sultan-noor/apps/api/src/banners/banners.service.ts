import { Injectable } from '@nestjs/common';
import { BannerPlacement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  async listActive(placement?: BannerPlacement) {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        placement,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { position: 'asc' },
    });
  }

  listAll() {
    return this.prisma.banner.findMany({ orderBy: { position: 'asc' } });
  }

  create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  update(id: string, dto: UpdateBannerDto) {
    return this.prisma.banner.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.banner.delete({ where: { id } });
    return { success: true };
  }
}
