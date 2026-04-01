import type { PrismaClient } from "@prisma/client";
import { sanitizeMessageBodyForPreview } from "../lib/messageContent";

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
  source: string | null;
  content: string;
  createdAt: string;
  sentBy: { email: string; name: string | null } | null;
}

export interface ConversationTurnsPage {
  items: ConversationTurnView[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const toPreview = (text: string): string => {
  const normalized = sanitizeMessageBodyForPreview(text);
  if (normalized.length <= 100) return normalized;
  return `${normalized.slice(0, 100)}...`;
};

const buildInstagramFallbackName = (externalId: string | null): string | null => {
  const normalized = externalId?.trim();
  if (!normalized) return null;
  const suffix = normalized.slice(-6);
  return `Instagram ${suffix || normalized}`;
};

const resolveConversationDisplayName = (contact: {
  name: string | null;
  platformHandle: string | null;
  channel: "WHATSAPP" | "INSTAGRAM";
  externalId: string | null;
}): string | null => {
  const explicitName = contact.name?.trim();
  if (explicitName) return explicitName;

  const normalizedHandle = contact.platformHandle?.trim();
  if (normalizedHandle) {
    return normalizedHandle.startsWith("@")
      ? normalizedHandle
      : `@${normalizedHandle}`;
  }

  if (contact.channel === "INSTAGRAM") {
    const fallbackLabel = buildInstagramFallbackName(contact.externalId);
    if (fallbackLabel) return fallbackLabel;

    const fallbackExternalId = contact.externalId?.trim();
    if (fallbackExternalId) return `@${fallbackExternalId}`;
  }

  return null;
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
        platformHandle: true,
        channel: true,
        externalId: true,
      },
    });
    const contactById = new Map<number, { waId: string; name: string | null }>();
    for (const contact of contacts) {
      contactById.set(contact.id, {
        waId: contact.waId,
        name: resolveConversationDisplayName({
          name: contact.name,
          platformHandle: contact.platformHandle,
          channel: contact.channel,
          externalId: contact.externalId,
        }),
      });
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
    offset: number,
  ): Promise<ConversationTurnsPage> {
    const contact = await prisma.contact.findUnique({
      where: { waId: phone },
      select: { id: true },
    });
    if (!contact) {
      return { items: [], total: 0, limit, offset: 0, hasMore: false };
    }

    const total = await prisma.message.count({
      where: { contactId: contact.id },
    });
    const maxOffset = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;
    const safeOffset = Math.max(0, Math.min(offset, maxOffset));

    const latestTurns = await prisma.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      skip: safeOffset,
      take: limit,
      select: {
        id: true,
        direction: true,
        source: true,
        body: true,
        createdAt: true,
        sentByUser: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    const turns = [...latestTurns].reverse();

    return {
      items: turns.map((turn) => ({
        id: String(turn.id),
        role: turn.direction === "in" ? "user" : "assistant",
        source: turn.source,
        content: turn.body,
        createdAt: turn.createdAt.toISOString(),
        sentBy: turn.sentByUser,
      })),
      total,
      limit,
      offset: safeOffset,
      hasMore: safeOffset + latestTurns.length < total,
    };
  }
}
