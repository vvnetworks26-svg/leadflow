/**
 * integration/loader.ts — Integration entry point.
 *
 * Creates the LifecycleManager for a given config and wires it into the
 * runtime. Called once by src/loader.ts during the SDK bootstrap.
 *
 * Exposes:
 *   createIntegrationManager(config, initFn, destroyFn) → ILifecycleManager
 */

import { createLifecycleManager } from './lifecycle';
import type { ILifecycleManager } from './types';
import type { WidgetConfig }      from '../types';
import type { EmbedConfig }       from './types';

export function createIntegrationManager(
  config:    WidgetConfig & EmbedConfig,
  initFn:    (cfg: WidgetConfig) => Promise<'mounted' | 'already-initialized' | 'error'>,
  destroyFn: () => void,
  alreadyInstalled = false
): ILifecycleManager {
  return createLifecycleManager(initFn, destroyFn, config, alreadyInstalled);
}
