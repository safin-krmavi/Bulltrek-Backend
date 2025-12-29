// utils/strategySchedule.ts

import { computeNextRunAt } from "./scheduler/computeNextRunAt";

// export function isStrategyDue(
//   schedule: any,
//   lastExecutionAt: number | null,
//   now: number
// ): boolean {
//   if (!schedule) return true;

//   // First execution should always run
//   if (!lastExecutionAt) return true;

//   switch (schedule.frequency) {
//     case "HOURLY":
//       return (
//         now - lastExecutionAt >=
//         schedule.hourly.intervalHours * 60 * 60 * 1000
//       );

//     case "DAILY":
//       return isNewDay(lastExecutionAt, now);

//     case "WEEKLY":
//       return isAllowedWeekly(schedule.weekly, now);

//     case "MONTHLY":
//       return isAllowedMonthly(schedule.monthly, now);

//     default:
//       return false;
//   }
// }

export function isStrategyDue(
  schedule: any,
  lastExecutionAt: number | null,
  now: number
): boolean {
  const from = lastExecutionAt ? new Date(lastExecutionAt) : new Date(0);
  const nextRunAt = computeNextRunAt(schedule, from);

  return now >= nextRunAt.getTime();
}
/* ---------- helpers ---------- */

function isNewDay(last: number, now: number) {
  const lastDate = new Date(last);
  const nowDate = new Date(now);

  return (
    lastDate.getFullYear() !== nowDate.getFullYear() ||
    lastDate.getMonth() !== nowDate.getMonth() ||
    lastDate.getDate() !== nowDate.getDate()
  );
}

function isAllowedWeekly(
  weekly: { daysOfWeek: number[]; time: string },
  now: number
) {
  const nowDate = new Date(now);
  const day = nowDate.getDay(); // 0–6

  return weekly.daysOfWeek.includes(day);
}

function isAllowedMonthly(
  monthly: { dates: number[]; time: string },
  now: number
) {
  const date = new Date(now).getDate(); // 1–31
  return monthly.dates.includes(date);
}
