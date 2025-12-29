// utils/scheduler/computeNextRunAt.ts - FIXED VERSION

/**
 * Computes the next scheduled run time based on schedule config
 * @param schedule - The schedule configuration
 * @param from - Optional starting point (defaults to now)
 * @returns The next scheduled Date
 */
export function computeNextRunAt(schedule: any, from?: Date): Date {
  // **FIX 1**: Use `from` if provided, otherwise use current time
  const baseTime = from ? new Date(from) : new Date();
  
  switch (schedule.frequency) {
    case "DAILY":
      return computeNextDaily(schedule, baseTime);
    
    case "HOURLY":
      return computeNextHourly(schedule, baseTime);
    
    case "WEEKLY":
      return computeNextWeekly(schedule, baseTime);
    
    case "MONTHLY":
      return computeNextMonthly(schedule, baseTime);
    
    default:
      throw new Error(`Unknown schedule frequency: ${schedule.frequency}`);
  }
}

/**
 * Compute next daily run
 */
function computeNextDaily(schedule: any, from: Date): Date {
  // **FIX 2**: Access time from schedule.daily.time, not schedule.time
  const timeStr = schedule.daily?.time || schedule.time;
  if (!timeStr) {
    throw new Error("Daily schedule must have `time` field");
  }

  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  if (isNaN(hour) || isNaN(minute)) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  // Create candidate for today at the specified time
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);

  // **FIX 3**: If the time has already passed today, move to tomorrow
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Compute next hourly run
 */
function computeNextHourly(schedule: any, from: Date): Date {
  const intervalHours = schedule.hourly?.intervalHours;
  if (!intervalHours || intervalHours < 1) {
    throw new Error("Hourly schedule must have intervalHours >= 1");
  }

  // **FIX 4**: Handle startTime if provided
  if (schedule.hourly.startTime) {
    const [hourStr, minStr] = schedule.hourly.startTime.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);

    // Find the base time (first occurrence of startTime)
    const baseTime = new Date(from);
    baseTime.setHours(hour, minute, 0, 0);

    // If base time is in the future, that's our next run
    if (baseTime > from) {
      return baseTime;
    }

    // Otherwise, calculate how many intervals have passed
    const msSinceBase = from.getTime() - baseTime.getTime();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const intervalsPassed = Math.floor(msSinceBase / intervalMs);
    
    // Next run is base + (intervals + 1) * interval
    const next = new Date(baseTime.getTime() + (intervalsPassed + 1) * intervalMs);
    return next;
  } else {
    // Simple interval from 'from' time
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const next = new Date(from.getTime() + intervalMs);
    return next;
  }
}

/**
 * Compute next weekly run
 */
function computeNextWeekly(schedule: any, from: Date): Date {
  const daysOfWeek: number[] = schedule.weekly?.daysOfWeek;
  const timeStr = schedule.weekly?.time;

  if (!daysOfWeek || daysOfWeek.length === 0) {
    throw new Error("Weekly schedule missing daysOfWeek");
  }
  if (!timeStr) {
    throw new Error("Weekly schedule missing time");
  }

  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  if (isNaN(hour) || isNaN(minute)) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  // Sort days for consistent behavior
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

  // **FIX 5**: Check up to 14 days to ensure we find the next occurrence
  for (let daysAhead = 0; daysAhead < 14; daysAhead++) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + daysAhead);
    candidate.setHours(hour, minute, 0, 0);

    const dayOfWeek = candidate.getDay(); // 0 = Sunday, 6 = Saturday

    if (sortedDays.includes(dayOfWeek) && candidate > from) {
      return candidate;
    }
  }

  // Fallback (should never reach here with 14-day lookahead)
  throw new Error("Failed to compute next weekly run");
}

/**
 * Compute next monthly run
 */
function computeNextMonthly(schedule: any, from: Date): Date {
  const dates: number[] = schedule.monthly?.dates;
  const timeStr = schedule.monthly?.time;

  if (!dates || dates.length === 0) {
    throw new Error("Monthly schedule missing dates");
  }
  if (!timeStr) {
    throw new Error("Monthly schedule missing time");
  }

  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  if (isNaN(hour) || isNaN(minute)) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  // Sort dates for consistent behavior
  const sortedDates = [...dates].sort((a, b) => a - b);

  // **FIX 6**: Search within current month first, then next months
  const currentYear = from.getFullYear();
  const currentMonth = from.getMonth();

  // Try current month
  for (const date of sortedDates) {
    const candidate = new Date(currentYear, currentMonth, date, hour, minute, 0, 0);
    
    // Check if date is valid (e.g., Feb 30 becomes Mar 2)
    if (candidate.getDate() === date && candidate > from) {
      return candidate;
    }
  }

  // Try next 12 months
  for (let monthsAhead = 1; monthsAhead <= 12; monthsAhead++) {
    for (const date of sortedDates) {
      const candidate = new Date(
        currentYear,
        currentMonth + monthsAhead,
        date,
        hour,
        minute,
        0,
        0
      );

      // Check if date is valid in this month
      if (candidate.getDate() === date) {
        return candidate;
      }
    }
  }

  // Fallback (should never reach here)
  throw new Error("Failed to compute next monthly run");
}

// ============================================================================
// HELPER FUNCTIONS (Optional, for testing/debugging)
// ============================================================================

/**
 * Format next run time for logging
 */
export function formatNextRun(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Validate schedule configuration
 */
export function validateSchedule(schedule: any): boolean {
  if (!schedule || !schedule.frequency) {
    throw new Error("Schedule must have a frequency");
  }

  switch (schedule.frequency) {
    case "DAILY":
      if (!schedule.daily?.time && !schedule.time) {
        throw new Error("Daily schedule requires time");
      }
      return true;

    case "HOURLY":
      if (!schedule.hourly?.intervalHours) {
        throw new Error("Hourly schedule requires intervalHours");
      }
      if (schedule.hourly.intervalHours < 1) {
        throw new Error("intervalHours must be >= 1");
      }
      return true;

    case "WEEKLY":
      if (!schedule.weekly?.daysOfWeek?.length) {
        throw new Error("Weekly schedule requires daysOfWeek array");
      }
      if (!schedule.weekly?.time) {
        throw new Error("Weekly schedule requires time");
      }
      return true;

    case "MONTHLY":
      if (!schedule.monthly?.dates?.length) {
        throw new Error("Monthly schedule requires dates array");
      }
      if (!schedule.monthly?.time) {
        throw new Error("Monthly schedule requires time");
      }
      return true;

    default:
      throw new Error(`Invalid frequency: ${schedule.frequency}`);
  }
}