/**
 * jisr_connection_status_get (spec FR-013).
 *
 * Reports whether the connection works, without returning anything that would
 * help attack it. No slug, no key identifier, no token, no base URL -- the
 * organization identifier here is the one-way derived internal id, and the host
 * type is a category, not an address.
 */

import { z } from 'zod';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const connectionStatusTool: ToolDefinition<Record<string, never>> = {
  name: 'jisr_connection_status_get',
  title: 'Jisr connection status',
  description:
    'Reports whether this server can reach Jisr, when it last authenticated, and the last authentication error if any. Returns no credentials or organization identifiers.',
  inputShape: {},
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose:
    'Connection health only. No employee, financial, or authentication data is reachable through this tool.',
  handler: async (_input, context) => {
    const status = context.client.authenticationStatus();
    return await Promise.resolve({
      structuredContent: {
        organizationId: context.principal.organizationId,
        status: status.lastAuthenticationError === null ? 'connected' : 'error',
        jisrHostType: context.connection.hostType,
        lastSuccessfulAuthentication: status.lastSuccessfulAuthentication,
        lastAuthenticationError: status.lastAuthenticationError,
      },
      summary:
        status.lastAuthenticationError === null
          ? `Connected to a ${context.connection.hostType}-hosted Jisr organization.`
          : `Connection problem: ${status.lastAuthenticationError}. Check the configured credentials.`,
    });
  },
};

export const connectionStatusInputSchema = z.object({});
