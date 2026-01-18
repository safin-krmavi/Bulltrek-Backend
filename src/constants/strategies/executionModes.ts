export const EXECUTION_MODES = {
  TIME_BASED: "TIME_BASED",
  SIGNAL_BASED: "SIGNAL_BASED",
} as const;

export type ExecutionMode =
  (typeof EXECUTION_MODES)[keyof typeof EXECUTION_MODES];
