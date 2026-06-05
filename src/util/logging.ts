import winston from "winston";
import path from "path";

const logDir = path.resolve(__dirname, "../../state/logs");

const fmt = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

export const appLogger = winston.createLogger({
  level: "info",
  format: fmt,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, "app.log") }),
  ],
});

export const executorLogger = winston.createLogger({
  level: "info",
  format: fmt,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, "executor.log"),
    }),
  ],
});
