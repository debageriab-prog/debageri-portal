export type VacationBucket = "normal" | "saved" | "advance";

export interface VacationBalanceInput {
  /** Days granted to the period, in minutes. */
  grantedMinutes: number;
  /** Sum of the period's adjustments per bucket, in minutes. */
  normalAdjustMinutes: number;
  savedAdjustMinutes: number;
  /** Sum of every advance adjustment for the person, in minutes. */
  advanceAdjustMinutes: number;
  /** Vacation from approved time reports inside the period, in minutes. */
  usedMinutes: number;
}

export interface VacationBalance {
  normal: number;
  saved: number;
  advance: number;
  used: number;
  usedFrom: Record<VacationBucket, number>;
  /** True when usage went past every bucket; `normal` is then negative. */
  overdrawn: boolean;
}

/** Applies usage to saved days first, then normal days, then advance days. */
export function computeVacationBalance(
  input: VacationBalanceInput,
): VacationBalance {
  const available = {
    saved: input.savedAdjustMinutes,
    normal: input.grantedMinutes + input.normalAdjustMinutes,
    advance: input.advanceAdjustMinutes,
  };
  const usedFrom: Record<VacationBucket, number> = {
    saved: 0,
    normal: 0,
    advance: 0,
  };
  let remaining = Math.max(0, input.usedMinutes);
  for (const bucket of ["saved", "normal", "advance"] as const) {
    const take = Math.min(remaining, Math.max(0, available[bucket]));
    usedFrom[bucket] = take;
    remaining -= take;
  }
  usedFrom.normal += remaining;
  return {
    saved: available.saved - usedFrom.saved,
    normal: available.normal - usedFrom.normal,
    advance: available.advance - usedFrom.advance,
    used: input.usedMinutes,
    usedFrom,
    overdrawn: remaining > 0,
  };
}

/**
 * Adjustments that move a closing balance into the next period: leftover
 * normal and saved days become saved days, a negative normal balance stays
 * negative, and advance days used in the period are taken off for good.
 */
export function carryOverAdjustments(closing: VacationBalance) {
  const leftover = Math.max(0, closing.normal) + Math.max(0, closing.saved);
  return {
    saved: leftover,
    normal: Math.min(0, closing.normal),
    advance: closing.usedFrom.advance ? -closing.usedFrom.advance : 0,
  };
}

export interface VacationTargets {
  normal: number;
  saved: number;
  advance: number;
}

/**
 * Bucket totals (before usage) that leave exactly `targets` once
 * `usedMinutes` is applied in the order saved, normal, advance. Usage is
 * placed on the first bucket that keeps days; targets are never negative.
 */
export function availableForTargets(
  targets: VacationTargets,
  usedMinutes: number,
): VacationTargets {
  const used = Math.max(0, usedMinutes);
  if (targets.saved > 0) return { ...targets, saved: targets.saved + used };
  if (targets.normal > 0) return { ...targets, normal: targets.normal + used };
  return { ...targets, advance: targets.advance + used };
}
