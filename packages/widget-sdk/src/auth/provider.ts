/**
 * auth/provider.ts
 *
 * Public barrel for the credentials provider architecture.
 *
 * Import from here for all auth-related types and classes:
 *   import { NullProvider, AnonymousProvider, StaticTokenProvider } from './auth/provider';
 *   import type { CredentialsProvider } from './auth/provider';
 */

export type {
  CredentialsProvider,
  CredentialHeaders,
  AuthenticationState,
  CredentialMetadata,
  CredentialDiagnostics,
} from './types';

export type { AnonymousProviderOptions }    from './anonymous';
export type { StaticTokenProviderOptions }  from './static';

export { NullProvider }           from './null';
export { AnonymousProvider }      from './anonymous';
export { StaticTokenProvider }    from './static';
export { CredentialsManager, createCredentialsManager } from './manager';
