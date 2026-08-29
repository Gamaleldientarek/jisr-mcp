/**
 * jisr_capabilities_get (spec FR-014, FR-016).
 *
 * Reports four INDEPENDENT facts per tool. Keeping them separate is the whole
 * value: "you cannot do this" is nearly useless, while "the connected key does
 * not permit it, and a Jisr administrator can change that" is actionable.
 */

import { resolveAllCapabilities } from '../../authorization/capabilities.js';
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry.js';

export const capabilitiesTool: ToolDefinition<Record<string, never>> = {
  name: 'jisr_capabilities_get',
  title: 'Jisr capabilities',
  description:
    'Lists every documented Jisr operation and, for each, four independent facts: whether the specification supports it, whether the connected API key permits it, whether your role allows it, and whether the operator enabled it. Explains why anything unavailable is unavailable, and who can change that.',
  inputShape: {},
  annotations: READ_ONLY_ANNOTATIONS,
  declaredFieldGroups: ['internal_operational'],
  fieldGroupPurpose: 'Capability metadata only. Returns no record data of any kind.',
  handler: async (_input, context) => {
    const capabilities = resolveAllCapabilities(context.principal, context.flags, context.observed);
    const available = capabilities.filter((c) => c.available);

    return await Promise.resolve({
      structuredContent: {
        organizationId: context.principal.organizationId,
        roleProfile: context.principal.profile,
        capabilities,
      },
      summary: `${available.length} of ${capabilities.length} operations are available to you. Each unavailable entry names the gate that declined it and who can change it.`,
    });
  },
};
