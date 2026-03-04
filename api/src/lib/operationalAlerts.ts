export type HandoffSlaLevel = "ok" | "warning" | "critical";

export const HANDOFF_WARNING_MINUTES = 15;
export const HANDOFF_CRITICAL_MINUTES = 30;

export const computeHandoffWaitMinutes = (
  startedAt: Date | string | null | undefined,
  now: Date = new Date(),
): number => {
  if (!startedAt) return 0;
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const diffMs = Math.max(0, now.getTime() - start.getTime());
  return Math.floor(diffMs / 60_000);
};

export const classifyHandoffSla = (
  waitMinutes: number,
  warningMinutes = HANDOFF_WARNING_MINUTES,
  criticalMinutes = HANDOFF_CRITICAL_MINUTES,
): HandoffSlaLevel => {
  if (waitMinutes >= criticalMinutes) return "critical";
  if (waitMinutes >= warningMinutes) return "warning";
  return "ok";
};
