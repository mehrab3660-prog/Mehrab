import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  create(userId: string, dto: CreateAddressDto) {
    return this.prisma.address.create({ data: { ...dto, userId } });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    return this.prisma.address.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    await this.prisma.address.delete({ where: { id } });
    return { success: true };
  }
}
