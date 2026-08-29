/**
 * Configuration loading and validation (spec FR-006).
 *
 * Two rules govern everything here:
 *   1. A failure names the specific setting and the corrective action.
 *   2. No failure -- and no log line, ever -- echoes a credential value.
 */

import { z } from 'zod';
import { ROLE_PROFILES, type RoleProfile } from '../core/authorization/role-profiles.js';
import { createFeatureFlags, type FeatureFlags } from './feature-flags.js';

/**
 * The only two hosting patterns Jisr documents. A base URL is validated against
 * this list at startup and never inferred from tool input (spec FR-006).
 */
export const APPROVED_JISR_HOSTS = ['apis.jisr.net', 'api.jisr.net.sa'] as const;

export type JisrHostType = 'aws' | 'local';

const CREDENTIAL_KEYS = new Set([
  'JISR_API_KEY',
  'JISR_API_SECRET',
  'JISR_FINANCE_API_KEY',
  'JISR_FINANCE_API_SECRET',
]);

export class ConfigurationError extends Error {
  readonly setting: string;
  readonly action: string;

  constructor(setting: string, problem: string, action: string) {
    super(`${setting}: ${problem}`);
    this.name = 'ConfigurationError';
    this.setting = setting;
    this.action = action;
  }

  /**
   * The operator-facing message. Deliberately does not include the offending
   * value: for a credential that would print the secret, and for everything
   * else the setting name is enough to act on.
   */
  format(): string {
    return [`Configuration problem in ${this.setting}.`, this.message, `Fix: ${this.action}`].join(
      '\n',
    );
  }
}

const baseUrlSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'is not a valid URL' });
      return z.NEVER;
    }
    if (url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'must use https' });
      return z.NEVER;
    }
    if (!(APPROVED_JISR_HOSTS as readonly string[]).includes(url.hostname)) {
      ctx.addIssue({
        code: 'custom',
        message: `host "${url.hostname}" is not an approved Jisr host`,
      });
      return z.NEVER;
    }
    return url.toString();
  });

const environmentSchema = z.object({
  JISR_BASE_URL: baseUrlSchema,
  JISR_SLUG: z.string().min(1),
  JISR_API_KEY: z.string().min(1),
  JISR_API_SECRET: z.string().min(1),
  JISR_ROLE_PROFILE: z.enum(ROLE_PROFILES),
  JISR_FINANCE_SURFACE: z.enum(['enabled', 'disabled']).default('disabled'),
  JISR_FINANCE_API_KEY: z.string().min(1).optional(),
  JISR_FINANCE_API_SECRET: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export interface JisrCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
}

export interface AppConfig {
  readonly organizationId: string;
  readonly baseUrl: string;
  readonly hostType: JisrHostType;
  readonly slug: string;
  readonly credentials: JisrCredentials;
  readonly financeCredentials: JisrCredentials | undefined;
  readonly roleProfile: RoleProfile;
  readonly featureFlags: FeatureFlags;
  readonly logLevel: 'error' | 'warn' | 'info' | 'debug';
}

/** Guidance per setting, so a failure tells the operator what to do next. */
const REMEDIES: Readonly<Record<string, string>> = {
  JISR_BASE_URL: `set it to https://apis.jisr.net/api (AWS-hosted) or https://api.jisr.net.sa/api/ (locally hosted). If your Jisr web address ends in .jisr.net.sa you are locally hosted.`,
  JISR_SLUG: 'set it to your organization slug, available from your Jisr administrator.',
  JISR_API_KEY:
    'create an API key in Jisr under Settings > Webhook & API Keys > API Keys > Add New API Key.',
  JISR_API_SECRET:
    'the secret is shown once when the key is created. If it was not captured, create a new key.',
  JISR_ROLE_PROFILE: `set it to one of: ${ROLE_PROFILES.join(', ')}.`,
  JISR_FINANCE_SURFACE: `set it to "enabled" or "disabled". Financial tools do not exist unless it is "enabled", even if your Jisr key permits financial access.`,
  LOG_LEVEL: 'set it to one of: error, warn, info, debug.',
};

/**
 * A stable internal identifier for the connected organization.
 *
 * Deliberately derived rather than set to the slug: the slug is organization
 * identity that connection status must not leak by default (spec FR-013). The
 * derivation is deterministic so the same connection keeps the same id across
 * restarts, and one-way so the id discloses nothing.
 */
async function deriveOrganizationId(baseUrl: string, slug: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(`${baseUrl}|${slug}`).digest('hex').slice(0, 24);
}

function hostTypeOf(baseUrl: string): JisrHostType {
  return new URL(baseUrl).hostname === 'api.jisr.net.sa' ? 'local' : 'aws';
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  const parsed = environmentSchema.safeParse(env);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const setting = String(issue?.path[0] ?? 'configuration');
    const problem =
      issue?.code === 'invalid_type' && !(setting in env)
        ? 'is required but was not set'
        : CREDENTIAL_KEYS.has(setting)
          ? 'is missing or empty'
          : (issue?.message ?? 'is invalid');
    throw new ConfigurationError(
      setting,
      problem,
      REMEDIES[setting] ?? 'see .env.example for the expected value.',
    );
  }

  const value = parsed.data;
  const financeEnabled = value.JISR_FINANCE_SURFACE === 'enabled';

  // A separate finance credential is recommended, not required. Requiring it
  // would block operators whose Jisr plan issues a single key; the field policy
  // protects the data either way (research R2).
  const hasFinanceKey =
    value.JISR_FINANCE_API_KEY !== undefined && value.JISR_FINANCE_API_SECRET !== undefined;
  if (
    !financeEnabled &&
    (value.JISR_FINANCE_API_KEY !== undefined || value.JISR_FINANCE_API_SECRET !== undefined)
  ) {
    throw new ConfigurationError(
      'JISR_FINANCE_SURFACE',
      'a finance credential is configured but the finance surface is disabled',
      'set JISR_FINANCE_SURFACE=enabled to use it, or remove the finance credential.',
    );
  }
  if (
    (value.JISR_FINANCE_API_KEY === undefined) !==
    (value.JISR_FINANCE_API_SECRET === undefined)
  ) {
    throw new ConfigurationError(
      'JISR_FINANCE_API_KEY / JISR_FINANCE_API_SECRET',
      'only one half of the finance credential is set',
      'set both, or neither.',
    );
  }

  return {
    organizationId: await deriveOrganizationId(value.JISR_BASE_URL, value.JISR_SLUG),
    baseUrl: value.JISR_BASE_URL,
    hostType: hostTypeOf(value.JISR_BASE_URL),
    slug: value.JISR_SLUG,
    credentials: { apiKey: value.JISR_API_KEY, apiSecret: value.JISR_API_SECRET },
    financeCredentials:
      financeEnabled && hasFinanceKey
        ? {
            apiKey: value.JISR_FINANCE_API_KEY as string,
            apiSecret: value.JISR_FINANCE_API_SECRET as string,
          }
        : undefined,
    roleProfile: value.JISR_ROLE_PROFILE,
    featureFlags: createFeatureFlags({ financeSurfaceEnabled: financeEnabled }),
    logLevel: value.LOG_LEVEL,
  };
}
