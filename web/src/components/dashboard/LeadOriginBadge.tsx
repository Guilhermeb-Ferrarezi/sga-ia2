import { Instagram, MessageCircle, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type LeadOriginChannel = "WHATSAPP" | "INSTAGRAM";

type LeadOriginMeta = {
  label: string;
  Icon: LucideIcon;
  badgeClass: string;
  panelClass: string;
  railClass: string;
  iconWrapClass: string;
};

const leadOriginMeta: Record<LeadOriginChannel, LeadOriginMeta> = {
  WHATSAPP: {
    label: "WhatsApp",
    Icon: MessageCircle,
    badgeClass: "border-emerald-400/40 bg-emerald-500/12 text-emerald-100",
    panelClass:
      "border-emerald-400/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_55%),linear-gradient(135deg,rgba(5,150,105,0.08),rgba(6,182,212,0.03))]",
    railClass: "from-emerald-400 via-teal-400 to-cyan-400",
    iconWrapClass: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20",
  },
  INSTAGRAM: {
    label: "Instagram",
    Icon: Instagram,
    badgeClass: "border-fuchsia-400/40 bg-fuchsia-500/12 text-fuchsia-100",
    panelClass:
      "border-fuchsia-400/25 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.18),transparent_55%),linear-gradient(135deg,rgba(249,115,22,0.08),rgba(217,70,239,0.03))]",
    railClass: "from-fuchsia-400 via-pink-400 to-orange-400",
    iconWrapClass: "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-400/20",
  },
};

const normalizeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const resolveLeadOriginChannel = (
  channel: string | null | undefined,
  waId?: string | null,
): LeadOriginChannel => {
  const normalizedChannel = normalizeText(channel)?.toUpperCase();
  if (normalizedChannel === "INSTAGRAM") return "INSTAGRAM";
  if (normalizedChannel === "WHATSAPP") return "WHATSAPP";
  return normalizeText(waId)?.startsWith("ig:") ? "INSTAGRAM" : "WHATSAPP";
};

export const getLeadOriginMeta = (
  channel: string | null | undefined,
  waId?: string | null,
): LeadOriginMeta => leadOriginMeta[resolveLeadOriginChannel(channel, waId)];

export const getLeadOriginHint = ({
  channel,
  waId,
  source,
  platformHandle,
}: {
  channel?: string | null;
  waId?: string | null;
  source?: string | null;
  platformHandle?: string | null;
}): string => {
  const registeredSource = normalizeText(source);
  if (registeredSource) return registeredSource;

  const handle = normalizeText(platformHandle);
  const resolvedChannel = resolveLeadOriginChannel(channel, waId);
  if (resolvedChannel === "INSTAGRAM") {
    if (!handle) return "DM no Instagram";
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return "Conversa no WhatsApp";
};

type LeadOriginBadgeProps = {
  channel?: string | null;
  waId?: string | null;
  source?: string | null;
  platformHandle?: string | null;
  className?: string;
  showHint?: boolean;
  compact?: boolean;
};

export function LeadOriginBadge({
  channel,
  waId,
  source,
  platformHandle,
  className,
  showHint = false,
  compact = false,
}: LeadOriginBadgeProps) {
  const meta = getLeadOriginMeta(channel, waId);
  const Icon = meta.Icon;
  const hint = getLeadOriginHint({ channel, waId, source, platformHandle });
  const shouldShowHint =
    showHint && hint.trim().toLowerCase() !== meta.label.trim().toLowerCase();

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Badge
        variant="outline"
        className={cn(
          "rounded-full border font-semibold uppercase tracking-[0.14em]",
          compact ? "h-5 gap-1 px-2 text-[10px]" : "h-6 gap-1.5 px-2.5 text-[10px]",
          meta.badgeClass,
        )}
      >
        <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {meta.label}
      </Badge>
      {shouldShowHint && (
        <Badge
          variant="outline"
          className={cn(
            "rounded-full border-white/10 bg-white/[0.03] text-muted-foreground",
            compact ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[10px]",
          )}
        >
          {hint}
        </Badge>
      )}
    </div>
  );
}
