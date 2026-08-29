/**
 * Structured logging (spec FR-029).
 *
 * Everything goes to STDERR. On a stdio MCP server stdout carries protocol
 * traffic, so a stray log line on stdout corrupts the session -- this is a
 * correctness constraint, not a convention.
 */

import { assertNoSecrets, redact } from './redaction.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  error(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(
  level: LogLevel = 'info',
  sink: NodeJS.WriteStream = process.stderr,
): Logger {
  const emit = (entryLevel: LogLevel, message: string, fields?: Record<string, unknown>): void => {
    if (ORDER[entryLevel] > ORDER[level]) return;

    const entry = {
      level: entryLevel,
      time: new Date().toISOString(),
      message: String(redact(message)),
      ...(fields === undefined ? {} : { fields: redact(fields) }),
    };

    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      // Unserializable payload: drop the entry rather than emit something
      // unexamined.
      return;
    }

    // Final gate. If a credential survived field-level redaction, the whole
    // line is suppressed (spec FR-029, fail closed).
    if (!assertNoSecrets(line)) {
      sink.write(
        `${JSON.stringify({ level: 'warn', time: entry.time, message: 'A log entry was suppressed because it could not be safely redacted.' })}\n`,
      );
      return;
    }

    sink.write(`${line}\n`);
  };

  return {
    error: (m, f) => {
      emit('error', m, f);
    },
    warn: (m, f) => {
      emit('warn', m, f);
    },
    info: (m, f) => {
      emit('info', m, f);
    },
    debug: (m, f) => {
      emit('debug', m, f);
    },
  };
}
