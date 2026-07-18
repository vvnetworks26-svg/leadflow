/**
 * business-identity/repository/BusinessIdentityRepository.ts
 *
 * Repository abstraction for loading BusinessIdentity.
 * Consumers depend on IBusinessIdentityRepository, not the implementation.
 * Swap MongoDB for PostgreSQL, Redis, or an API without touching callers.
 */

import type { BusinessIdentity } from '../types';

/**
 * The repository contract.
 * Implementations must fulfill this interface.
 */
export interface IBusinessIdentityRepository {
  /** Load the BusinessIdentity for the given organizationId */
  loadByOrganizationId(organizationId: string): Promise<BusinessIdentity | null>;
}
