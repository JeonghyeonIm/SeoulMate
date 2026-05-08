import type { RequestHandler } from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import pinoPretty from "pino-pretty";

import { env } from "../config/env";

const isDevelopment = env.NODE_ENV !== "production";

const stream = isDevelopment
  ? pinoPretty({
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      destination: process.stdout.fd,
      sync: true
    })
  : pino.destination({
      dest: process.stdout.fd,
      sync: false
    });

export const logger = pino(
  {
    level: env.LOG_LEVEL
  },
  stream
);

const attachHttpLogger = pinoHttp({
  logger
});

export const httpLogger: RequestHandler = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const url = req.originalUrl || req.url;

  attachHttpLogger(req, res, () => undefined);
  logger.info({ method: req.method, url }, "incoming request");

  res.on("finish", () => {
    const responseTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    const log = res.statusCode >= 500 ? logger.error.bind(logger) : logger.info.bind(logger);

    log(
      {
        method: req.method,
        url,
        statusCode: res.statusCode,
        responseTime
      },
      "request completed"
    );
  });

  next();
};

export default logger;
