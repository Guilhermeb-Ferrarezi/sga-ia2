import type { PrismaClient } from "@prisma/client";
import { config } from "../config";

const AI_SETTINGS_ID = 1;

export interface AiSettingsSnapshot {
  model: string;
  language: string;
  personality: string;
  style: string;
  systemPrompt: string | null;
  botEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  source: "environment" | "database";
}

export interface AiSettingsInput {
  model: string;
  language: string;
  personality: string;
  style: string;
  systemPrompt: string | null;
}

const buildFallbackAiSettings = (): AiSettingsSnapshot => ({
  model: config.openaiModel,
  language: config.assistantLanguage,
  personality: config.assistantPersonality,
  style: config.assistantStyle,
  systemPrompt: config.assistantSystemPrompt ?? null,
  botEnabled: true,
  createdAt: null,
  updatedAt: null,
  source: "environment",
});

export const getFallbackAiSettings = (): AiSettingsSnapshot =>
  buildFallbackAiSettings();

export const resolveAiSettings = async (
  prisma?: PrismaClient | null,
): Promise<AiSettingsSnapshot> => {
  const fallback = buildFallbackAiSettings();
  if (!prisma) return fallback;

  const saved = await prisma.aiSettings.findUnique({
    where: { id: AI_SETTINGS_ID },
  });

  if (!saved) return fallback;

  return {
    model: saved.model.trim() || fallback.model,
    language: saved.language.trim() || fallback.language,
    personality: saved.personality.trim() || fallback.personality,
    style: saved.style.trim() || fallback.style,
    systemPrompt: saved.systemPrompt?.trim() || null,
    botEnabled: saved.botEnabled,
    createdAt: saved.createdAt.toISOString(),
    updatedAt: saved.updatedAt.toISOString(),
    source: "database",
  };
};

export const setAiBotEnabled = async (
  prisma: PrismaClient,
  enabled: boolean,
): Promise<AiSettingsSnapshot> => {
  const fallback = buildFallbackAiSettings();
  const saved = await prisma.aiSettings.upsert({
    where: { id: AI_SETTINGS_ID },
    update: { botEnabled: enabled },
    create: {
      id: AI_SETTINGS_ID,
      model: fallback.model,
      language: fallback.language,
      personality: fallback.personality,
      style: fallback.style,
      systemPrompt: fallback.systemPrompt,
      botEnabled: enabled,
    },
  });

  return {
    model: saved.model,
    language: saved.language,
    personality: saved.personality,
    style: saved.style,
    systemPrompt: saved.systemPrompt,
    botEnabled: saved.botEnabled,
    createdAt: saved.createdAt.toISOString(),
    updatedAt: saved.updatedAt.toISOString(),
    source: "database",
  };
};

export const saveAiSettings = async (
  prisma: PrismaClient,
  input: AiSettingsInput,
): Promise<AiSettingsSnapshot> => {
  const saved = await prisma.aiSettings.upsert({
    where: { id: AI_SETTINGS_ID },
    update: {
      model: input.model,
      language: input.language,
      personality: input.personality,
      style: input.style,
      systemPrompt: input.systemPrompt,
    },
    create: {
      id: AI_SETTINGS_ID,
      model: input.model,
      language: input.language,
      personality: input.personality,
      style: input.style,
      systemPrompt: input.systemPrompt,
    },
  });

  return {
    model: saved.model,
    language: saved.language,
    personality: saved.personality,
    style: saved.style,
    systemPrompt: saved.systemPrompt,
    botEnabled: saved.botEnabled,
    createdAt: saved.createdAt.toISOString(),
    updatedAt: saved.updatedAt.toISOString(),
    source: "database",
  };
};
