import type { PrismaClient } from "@prisma/client";

export interface DashboardOverview {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalContacts: number;
}

export interface DashboardConversation {
  phone: string;
  name: string | null;
  messagesCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
}

export interface ConversationTurnView {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const toPreview = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 100) return normalized;
  return `${normalized.slice(0, 100)}...`;
};

export class DashboardService {
  async getOverview(prisma: PrismaClient): Promise<DashboardOverview> {
    const [totalMessages, userMessages, assistantMessages, contacts] =
      await Promise.all([
        prisma.message.count(),
        prisma.message.count({ where: { direction: "in" } }),
        prisma.message.count({ where: { direction: "out" } }),
        prisma.contact.count(),
      ]);

    return {
      totalMessages,
      userMessages,
      assistantMessages,
      totalContacts: contacts,
    };
  }

  async getConversations(
    prisma: PrismaClient,
    limit: number,
  ): Promise<DashboardConversation[]> {
    const grouped = await prisma.message.groupBy({
      by: ["contactId"],
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: limit,
    });

    const contactIds = grouped.map((item) => item.contactId);
    if (!contactIds.length) return [];

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        waId: true,
        name: true,
      },
    });
    const contactById = new Map<number, { waId: string; name: string | null }>();
    for (const contact of contacts) {
      contactById.set(contact.id, { waId: contact.waId, name: contact.name });
    }

    const latestTurns = await prisma.message.findMany({
      where: { contactId: { in: contactIds } },
      orderBy: { createdAt: "desc" },
      select: {
        contactId: true,
        body: true,
      },
    });

    const previewMap = new Map<number, string>();
    for (const turn of latestTurns) {
      if (!previewMap.has(turn.contactId)) {
        previewMap.set(turn.contactId, toPreview(turn.body));
      }
    }

    return grouped.flatMap((item) => {
      const contact = contactById.get(item.contactId);
      if (!contact) return [];

      return [
        {
          phone: contact.waId,
          name: contact.name,
          messagesCount: item._count._all,
          lastMessageAt: (item._max.createdAt ?? new Date(0)).toISOString(),
          lastMessagePreview: previewMap.get(item.contactId) ?? "",
        },
      ];
    });
  }

  async getConversationTurns(
    prisma: PrismaClient,
    phone: string,
    limit: number,
  ): Promise<ConversationTurnView[]> {
    const contact = await prisma.contact.findUnique({
      where: { waId: phone },
      select: { id: true },
    });
    if (!contact) return [];

    const turns = await prisma.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
      },
    });

    return turns.map((turn) => ({
      id: String(turn.id),
      role: turn.direction === "in" ? "user" : "assistant",
      content: turn.body,
      createdAt: turn.createdAt.toISOString(),
    }));
  }
}
