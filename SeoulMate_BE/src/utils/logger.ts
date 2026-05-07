import pino from "pino";
import pinoHttp from "pino-http";

import { env } from "../config/env";

const transport =
  env.NODE_ENV !== "production"
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname"
        }
      })
    : undefined;

export const logger = pino(
  {
    level: env.LOG_LEVEL
  },
  transport
);

export const httpLogger = pinoHttp({
  logger
});

export default logger;
