/**
 * Service base (spec FR-022, Constitution Principle IV).
 *
 * Organization context is a CONSTRUCTOR ARGUMENT, not a parameter and not
 * ambient state. A service cannot be built without it, so no call site can
 * forget it and no default can silently apply.
 *
 * This release serves one organization, which makes the requirement look like
 * ceremony. It is not. It is the seam that makes tenancy enforceable the moment
 * a second organization exists -- and the principle's storage clauses activate
 * the moment anything is persisted (spec Assumptions).
 */

import type { JisrClient } from '../jisr/client.js';

export interface ServiceContext {
  readonly organizationId: string;
  readonly client: JisrClient;
}

export abstract class BaseService {
  protected readonly organizationId: string;
  protected readonly client: JisrClient;

  constructor(context: ServiceContext) {
    if (context.organizationId.length === 0) {
      throw new Error(
        'A service cannot be constructed without organization context (spec FR-022).',
      );
    }
    this.organizationId = context.organizationId;
    this.client = context.client;
  }

  /**
   * Refuses an identifier or cursor bearing a different organization.
   * Cursors carry their own binding; this covers everything else.
   */
  protected assertSameOrganization(candidate: string): void {
    if (candidate !== this.organizationId) {
      throw new Error('Cross-organization access attempt.');
    }
  }
}
