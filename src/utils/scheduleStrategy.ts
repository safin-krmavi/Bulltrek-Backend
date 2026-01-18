import {
  scheduleOneTimeLambda,
  scheduleRecurringRateLambda,
  scheduleRecurringCronLambda,
  deleteSchedule,
} from "./awsScheduler";
import { Strategy } from "@prisma/client";

const getScheduleName = (strategyId: string) => `strategy-${strategyId}`;

interface ScheduleStrategyParams {
  strategy: Strategy;
  lambdaArn: string;
}

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

  const payload = { strategyId: strategy.id };

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

        // AWS cron: minute hour/interval * * ? *
        // Example: every 3 hours starting at 02:15 → "15 2/3 * * ? *"
        return scheduleRecurringCronLambda({
          scheduleName,
          cronExpression: `${startMinute} ${startHour}/${interval} * * ? *`,
          lambdaArn,
          payload,
        });
      } else {
        // no start time → simple rate expression
        return scheduleRecurringRateLambda({
          scheduleName,
          every: interval,
          unit: "hours",
          lambdaArn,
          payload,
        });
      }

    case "DAILY":
      if (!scheduleConfig.daily?.time) {
        throw new Error("time required for DAILY frequency");
      }
      // AWS cron: minutes hours * * *
      const [dailyHour, dailyMinute] = scheduleConfig.daily.time
        .split(":")
        .map(Number);
      return scheduleRecurringCronLambda({
        scheduleName,
        cronExpression: `${dailyMinute} ${dailyHour} * * ? *`, // AWS cron
        lambdaArn,
        payload,
      });

    case "WEEKLY":
      if (
        !scheduleConfig.weekly?.time ||
        !scheduleConfig.weekly?.daysOfWeek?.length
      ) {
        throw new Error("daysOfWeek and time required for WEEKLY frequency");
      }
      const [weekHour, weekMinute] = scheduleConfig.weekly.time
        .split(":")
        .map(Number);
      // AWS cron: minutes hours ? * MON,WED
      const days = scheduleConfig.weekly.daysOfWeek
        .map((d) => {
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
        cronExpression: `${weekMinute} ${weekHour} ? * ${days} *`,
        lambdaArn,
        payload,
      });

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
      const dates = scheduleConfig.monthly.dates.join(",");
      return scheduleRecurringCronLambda({
        scheduleName,
        cronExpression: `${monthMinute} ${monthHour} ${dates} * ? *`,
        lambdaArn,
        payload,
      });

    default:
      throw new Error(
        `[SCHEDULE_STRATEGY] Invalid frequency: ${scheduleConfig.frequency}`,
      );
  }
}
