import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
} from "@aws-sdk/client-scheduler";
import * as dotenv from "dotenv";

dotenv.config();

/* -------------------------------------------------------------------------- */
/*                                AWS CLIENT                                  */
/* -------------------------------------------------------------------------- */
if (
  !process.env.S3BUCKET_REGION ||
  !process.env.S3BUCKET_ACCESS_KEY ||
  !process.env.S3BUCKET_SECRET_KEY ||
  !process.env.AWS_LAMBDA_ROLE_ARN
) {
  throw new Error("Missing required AWS environment variables");
}

const schedulerClient = new SchedulerClient({
  region: process.env.S3BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.S3BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.S3BUCKET_SECRET_KEY,
  },
});

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

interface BaseScheduleOptions {
  scheduleName: string;
  lambdaArn: string;
  payload: Record<string, any>;
}

interface OneTimeSchedule extends BaseScheduleOptions {
  type: "ONCE";
  runAt: Date;
}

interface RateSchedule extends BaseScheduleOptions {
  type: "RATE";
  rateValue: number;
  rateUnit: "minutes" | "hours" | "days";
}

interface CronSchedule extends BaseScheduleOptions {
  type: "CRON";
  cronExpression: string; // AWS cron format
}

type ScheduleOptions = OneTimeSchedule | RateSchedule | CronSchedule;

/* -------------------------------------------------------------------------- */
/*                               UTIL HELPERS                                  */
/* -------------------------------------------------------------------------- */

function formatAtDate(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, "");
}
function subtractSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() - seconds * 1000);
}
function buildScheduleExpression(options: ScheduleOptions): string {
  switch (options.type) {
    case "ONCE": {
      const adjustedRunAt = subtractSeconds(options.runAt, 30); // 👈 30s early
      return `at(${formatAtDate(adjustedRunAt)})`;
    }

    case "RATE":
      return `rate(${options.rateValue} ${options.rateUnit})`;

    case "CRON":
      return `cron(${options.cronExpression})`;

    default:
      throw new Error("Invalid schedule type");
  }
}
/* -------------------------------------------------------------------------- */
/*                            CREATE / UPSERT SCHEDULE                         */
/* -------------------------------------------------------------------------- */

export async function createSchedule(options: ScheduleOptions) {
  const scheduleExpression = buildScheduleExpression(options);

  const input = {
    Name: options.scheduleName,
    ScheduleExpression: scheduleExpression,
    ScheduleExpressionTimezone: "Asia/Kolkata",
    Target: {
      Arn: options.lambdaArn,
      RoleArn: process.env.AWS_LAMBDA_ROLE_ARN,
      Input: JSON.stringify({
        ...options.payload,
        mode: process.env.NODE_ENV,
      }),
    },
    FlexibleTimeWindow: {
      Mode: FlexibleTimeWindowMode.OFF,
    },
  };

  try {
    const command = new CreateScheduleCommand(input);
    const response = await schedulerClient.send(command);

    console.log(
      `✅ Schedule created: ${options.scheduleName} → ${scheduleExpression}`,
    );

    return response;
  } catch (error) {
    console.error("❌ Failed to create schedule:", error);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                               DELETE SCHEDULE                               */
/* -------------------------------------------------------------------------- */

export async function deleteSchedule(scheduleName: string) {
  if (!scheduleName) {
    throw new Error("deleteSchedule: scheduleName is required");
  }

  try {
    const command = new DeleteScheduleCommand({ Name: scheduleName });
    const response = await schedulerClient.send(command);

    console.log(`✅ Deleted schedule: ${scheduleName}`);
    return response;
  } catch (error: any) {
    if (error.name === "ResourceNotFoundException") {
      console.warn(`⚠️ Schedule not found: ${scheduleName}`);
      return;
    }

    console.error(`❌ Error deleting schedule ${scheduleName}`, error);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                          OPTIONAL CONVENIENCE WRAPPERS                      */
/* -------------------------------------------------------------------------- */

export function scheduleOneTimeLambda(params: {
  scheduleName: string;
  runAt: Date;
  lambdaArn: string;
  payload: Record<string, any>;
}) {
  return createSchedule({
    type: "ONCE",
    scheduleName: params.scheduleName,
    runAt: params.runAt,
    lambdaArn: params.lambdaArn,
    payload: params.payload,
  });
}

export function scheduleRecurringRateLambda(params: {
  scheduleName: string;
  every: number;
  unit: "minutes" | "hours" | "days";
  lambdaArn: string;
  payload: Record<string, any>;
}) {
  return createSchedule({
    type: "RATE",
    scheduleName: params.scheduleName,
    rateValue: params.every,
    rateUnit: params.unit,
    lambdaArn: params.lambdaArn,
    payload: params.payload,
  });
}

export function scheduleRecurringCronLambda(params: {
  scheduleName: string;
  cronExpression: string;
  lambdaArn: string;
  payload: Record<string, any>;
}) {
  return createSchedule({
    type: "CRON",
    scheduleName: params.scheduleName,
    cronExpression: params.cronExpression,
    lambdaArn: params.lambdaArn,
    payload: params.payload,
  });
}
