function applyTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}
function nextMonthly(
  monthly: { dates: number[]; time: string },
  from: Date
): Date {
  const dates = [...monthly.dates].sort((a, b) => a - b);

  const year = from.getFullYear();
  const month = from.getMonth();

  for (const d of dates) {
    const candidate = new Date(year, month, d);
    const withTime = applyTime(candidate, monthly.time);

    if (withTime > from) {
      return withTime;
    }
  }

  // move to next month
  const nextMonth = new Date(year, month + 1, 1);
  return applyTime(
    new Date(nextMonth.getFullYear(), nextMonth.getMonth(), dates[0]),
    monthly.time
  );
}
function nextWeekly(
  weekly: { daysOfWeek: number[]; time: string },
  from: Date
): Date {
  const sortedDays = [...weekly.daysOfWeek].sort();

  for (let i = 0; i < 7; i++) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + i);

    if (sortedDays.includes(candidate.getDay())) {
      const withTime = applyTime(candidate, weekly.time);
      if (withTime > from) {
        return withTime;
      }
    }
  }

  // fallback to next week
  const nextWeek = new Date(from);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return applyTime(nextWeek, weekly.time);
}
function nextDaily(
  daily: { time: string },
  from: Date
): Date {
  const next = applyTime(from, daily.time);

  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}
function nextHourly(
  hourly: { intervalHours: number; startTime?: string },
  from: Date
): Date {
  const base = hourly.startTime
    ? applyTime(from, hourly.startTime)
    : from;

  let next = new Date(base);

  while (next <= from) {
    next.setHours(next.getHours() + hourly.intervalHours);
  }

  return next;
}
export function computeNextRunAt(schedule: any, from: Date = new Date()): Date {
  switch (schedule.frequency) {
    case "HOURLY":
      return nextHourly(schedule.hourly, from);

    case "DAILY":
      return nextDaily(schedule.daily, from);

    case "WEEKLY":
      return nextWeekly(schedule.weekly, from);

    case "MONTHLY":
      return nextMonthly(schedule.monthly, from);

    default:
      throw new Error("Invalid schedule frequency");
  }
}
