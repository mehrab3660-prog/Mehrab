import { NotFoundException } from '@nestjs/common';
import { AiAdvisorService } from './ai-advisor.service';

describe('AiAdvisorService', () => {
  let prisma: any;
  let search: any;
  let settings: any;
  let notifications: any;
  let service: AiAdvisorService;

  beforeEach(() => {
    prisma = {
      aiConversation: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      aiMessage: { create: jest.fn().mockResolvedValue({}) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    search = { searchProducts: jest.fn().mockResolvedValue({ hits: [] }) };
    settings = { resolve: jest.fn().mockResolvedValue(null) }; // no LLM key → rule-based fallback
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new AiAdvisorService(prisma, search, settings, notifications);
  });

  describe('ask', () => {
    it('creates a new conversation and generates a reply when no conversationId is given', async () => {
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv1', escalatedAt: null, resolvedAt: null, messages: [] });
      search.searchProducts.mockResolvedValue({ hits: [{ name: 'لامپ LED' }] });

      const result = await service.ask('u1', { message: 'دنبال لامپ می‌گردم' } as any);

      expect(prisma.aiConversation.create).toHaveBeenCalledWith({ data: { userId: 'u1' }, include: { messages: true } });
      expect(prisma.aiMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv1', role: 'USER', content: 'دنبال لامپ می‌گردم' },
      });
      expect(result.reply).toContain('لامپ LED');
      expect(result.awaitingStaff).toBe(false);
    });

    it('does not generate a bot reply once the conversation is escalated and unresolved', async () => {
      prisma.aiConversation.findUniqueOrThrow.mockResolvedValue({
        id: 'conv1',
        escalatedAt: new Date(),
        resolvedAt: null,
        messages: [],
      });

      const result = await service.ask('u1', { conversationId: 'conv1', message: 'کسی هست؟' } as any);

      expect(search.searchProducts).not.toHaveBeenCalled();
      expect(result).toEqual({ conversationId: 'conv1', reply: null, suggestedProducts: [], awaitingStaff: true });
      // The user's message is still recorded even though the bot stays quiet.
      expect(prisma.aiMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv1', role: 'USER', content: 'کسی هست؟' },
      });
    });

    it('resumes generating bot replies once an escalated conversation is resolved', async () => {
      prisma.aiConversation.findUniqueOrThrow.mockResolvedValue({
        id: 'conv1',
        escalatedAt: new Date(),
        resolvedAt: new Date(),
        messages: [],
      });

      await service.ask('u1', { conversationId: 'conv1', message: 'سوال دیگری دارم' } as any);

      expect(search.searchProducts).toHaveBeenCalled();
    });
  });

  describe('escalate', () => {
    it('rejects when the conversation does not exist', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(null);
      await expect(service.escalate('missing')).rejects.toThrow(NotFoundException);
    });

    it('marks the conversation escalated, logs a system message, and notifies staff once', async () => {
      prisma.aiConversation.findUnique
        .mockResolvedValueOnce({ id: 'conv1', escalatedAt: null })
        .mockResolvedValueOnce({ id: 'conv1', messages: [] }); // re-fetched by getConversation() at the end
      prisma.user.findMany.mockResolvedValue([{ id: 'staff1' }, { id: 'staff2' }]);

      await service.escalate('conv1');

      expect(prisma.aiConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv1' },
        data: { escalatedAt: expect.any(Date), resolvedAt: null },
      });
      expect(prisma.aiMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv1', role: 'SYSTEM', content: expect.stringContaining('پشتیبان انسانی') },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] } },
        select: { id: true },
      });
      expect(notifications.notify).toHaveBeenCalledTimes(2);
    });

    it('does not re-notify staff when escalating an already-escalated, unresolved conversation', async () => {
      prisma.aiConversation.findUnique
        .mockResolvedValueOnce({ id: 'conv1', escalatedAt: new Date(), resolvedAt: null })
        .mockResolvedValueOnce({ id: 'conv1', messages: [] });

      await service.escalate('conv1');

      expect(prisma.aiConversation.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('allows reopening a previously resolved conversation, clearing resolvedAt and notifying staff again', async () => {
      prisma.aiConversation.findUnique
        .mockResolvedValueOnce({ id: 'conv1', escalatedAt: new Date(), resolvedAt: new Date() })
        .mockResolvedValueOnce({ id: 'conv1', messages: [] });
      prisma.user.findMany.mockResolvedValue([{ id: 'staff1' }]);

      await service.escalate('conv1');

      expect(prisma.aiConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv1' },
        data: { escalatedAt: expect.any(Date), resolvedAt: null },
      });
      expect(notifications.notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('staffReply', () => {
    it('rejects when the conversation does not exist', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(null);
      await expect(service.staffReply('missing', { message: 'سلام' } as any)).rejects.toThrow(NotFoundException);
    });

    it('records the reply with role STAFF', async () => {
      prisma.aiConversation.findUnique.mockResolvedValueOnce({ id: 'conv1' }).mockResolvedValueOnce({ id: 'conv1', messages: [] });

      await service.staffReply('conv1', { message: 'سلام، چطور می‌تونم کمکتون کنم؟' } as any);

      expect(prisma.aiMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv1', role: 'STAFF', content: 'سلام، چطور می‌تونم کمکتون کنم؟' },
      });
    });
  });

  describe('resolve', () => {
    it('rejects when the conversation does not exist', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(null);
      await expect(service.resolve('missing')).rejects.toThrow(NotFoundException);
    });

    it('sets resolvedAt on an existing conversation', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue({ id: 'conv1' });
      prisma.aiConversation.update.mockResolvedValue({ id: 'conv1', resolvedAt: new Date() });

      await service.resolve('conv1');

      expect(prisma.aiConversation.update).toHaveBeenCalledWith({ where: { id: 'conv1' }, data: { resolvedAt: expect.any(Date) } });
    });
  });
});
