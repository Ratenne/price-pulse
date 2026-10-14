export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function write(
  level: "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>
) {
  console[level](JSON.stringify({ level, message, ...context }));
}

export const consoleLogger: Logger = {
  info: (message, context) => write("info", message, context),
  warn: (message, context) => write("warn", message, context),
  error: (message, context) => write("error", message, context),
};
