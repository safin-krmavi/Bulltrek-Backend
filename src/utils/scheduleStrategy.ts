import {
  scheduleRecurringRateLambda,
  scheduleRecurringCronLambda,
  deleteSchedule,
} from "./awsScheduler";
import { Strategy } from "@prisma/client";
type Payload = {
  strategyId: string;
  delayMs?: number;
};

const getScheduleName = (strategyId: string) => `strategy-${strategyId}`;

interface ScheduleStrategyParams {
  strategy: Strategy;
  lambdaArn: string;
}
function minusOneMinute(hour: number, minute: number) {
  if (minute === 0) {
    return {
      hour: hour === 0 ? 23 : hour - 1,
      minute: 59,
    };
  }

  return {
    hour,
    minute: minute - 1,
  };
}
function assertNotNextMinute(targetHour: number, targetMinute: number) {
  const now = new Date();

  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);

  // If time already passed today, assume next occurrence
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 60000) {
    throw new Error(
      "Scheduling for the next minute is not allowed. Please choose a time at least 2 minutes ahead.",
    );
  }
}

const EXECUTION_DELAY_MS = 30000;
/**
 * Maps your strategy's frequency-based schedule to AWS Scheduler
 */
export async function scheduleStrategy({
  strategy,
  lambdaArn,
}: ScheduleStrategyParams) {
  if (!(strategy.config as any)?.schedule) {
    console.warn(
      `[SCHEDULE_STRATEGY] No schedule config for strategy ${strategy.id}`,
    );
    return;
  }

  const scheduleConfig = (strategy.config as any).schedule;
  const scheduleName = getScheduleName(strategy.id);

  // Delete existing schedule first (for updates)
  await deleteSchedule(scheduleName);

  const basePayload = { strategyId: strategy.id };
  const delayedPayload = {
    strategyId: strategy.id,
    delayMs: EXECUTION_DELAY_MS,
  };

  switch (scheduleConfig.frequency) {
    case "HOURLY":
      if (!scheduleConfig.hourly?.intervalHours) {
        throw new Error("hourInterval required for HOURLY frequency");
      }

      const interval = scheduleConfig.hourly.intervalHours;
      const startTime = scheduleConfig.hourly.startTime;

      if (startTime) {
        // Convert to cron with minutes and hours
        const [startHour, startMinute] = startTime.split(":").map(Number);
        assertNotNextMinute(startHour, startMinute);
        const { hour, minute } = minusOneMinute(startHour, startMinute);

        // minute hour/interval * * ? *
        const scheduleExpression = `${minute} ${hour}/${interval} * * ? *`;

        return scheduleRecurringCronLambda({
          scheduleName,
          cronExpression: scheduleExpression,
          lambdaArn,
          payload: delayedPayload,
        });
      } else {
        // no start time → simple rate expression
        return scheduleRecurringRateLambda({
          scheduleName,
          every: interval,
          unit: "hours",
          lambdaArn,
          payload: basePayload,
        });
      }

    case "DAILY": {
      if (!scheduleConfig.daily?.time) {
        throw new Error("time required for DAILY frequency");
      }
      // AWS cron: minutes hours * * *
      const [dailyHour, dailyMinute] = scheduleConfig.daily.time
        .split(":")
        .map(Number);
      assertNotNextMinute(dailyHour, dailyMinute);

      const { hour, minute } = minusOneMinute(dailyHour, dailyMinute);

      return scheduleRecurringCronLambda({
        scheduleName,

        cronExpression: `${minute} ${hour} * * ? *`,
        lambdaArn,
        payload: delayedPayload,
      });
    }

    case "WEEKLY": {
      if (
        !scheduleConfig.weekly?.time ||
        !scheduleConfig.weekly?.daysOfWeek?.length
      ) {
        throw new Error("daysOfWeek and time required for WEEKLY frequency");
      }
      const [weekHour, weekMinute] = scheduleConfig.weekly.time
        .split(":")
        .map(Number);
      assertNotNextMinute(weekHour, weekMinute);

      const { hour, minute } = minusOneMinute(weekHour, weekMinute);

      // AWS cron: minutes hours ? * MON,WED
      const days = scheduleConfig.weekly.daysOfWeek
        .map((d: number) => {
          const map: Record<number, string> = {
            0: "SUN",
            1: "MON",
            2: "TUE",
            3: "WED",
            4: "THU",
            5: "FRI",
            6: "SAT",
          };
          return map[d];
        })
        .join(",");
      return scheduleRecurringCronLambda({
        scheduleName,
        cronExpression: `${minute} ${hour} ? * ${days} *`,
        lambdaArn,
        payload: delayedPayload,
      });
    }

    case "MONTHLY":
      if (
        !scheduleConfig.monthly?.time ||
        !scheduleConfig.monthly?.dates?.length
      ) {
        throw new Error("datesOfMonth and time required for MONTHLY frequency");
      }
      const [monthHour, monthMinute] = scheduleConfig.monthly.time
        .split(":")
        .map(Number);

      assertNotNextMinute(monthHour, monthMinute);

      const { hour, minute } = minusOneMinute(monthHour, monthMinute);
      const dates = scheduleConfig.monthly.dates.join(",");

      return scheduleRecurringCronLambda({
        scheduleName,
        cronExpression: `${minute} ${hour} ${dates} * ? *`,
        lambdaArn,
        payload: delayedPayload,
      });

    default:
      throw new Error(
        `[SCHEDULE_STRATEGY] Invalid frequency: ${scheduleConfig.frequency}`,
      );
  }
}
