import pino from "pino";

/**
 * Shared application logger. In development we route through `pino-pretty` so
 * logs stay human-readable; in production the output is structured JSON for
 * machine ingestion (e.g. Datadog/CloudWatch/Grafana).
 *
 * Child loggers carry contextual bindings (runId, step, scraper, …) so related
 * log lines can be correlated without threading state through every call site.
 */
const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
});

/** Create a child logger with the given context bindings. */
export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
