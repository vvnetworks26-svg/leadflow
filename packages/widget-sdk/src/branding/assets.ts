/**
 * branding/assets.ts — Assets Manager.
 *
 * Stores and validates brand assets (logo, launcher icon, avatar).
 * No uploads, no networking — only validation of already-provided values.
 *
 * Accepts:
 *   - https:// URLs
 *   - data: URIs (base64 images)
 *   - SVG strings (for launcherIcon)
 */

import type { BrandAssets, AssetType, AssetValidation, IAssetsManager } from './types';

// ─── Validators ───────────────────────────────────────────────────────────────

const URL_RE  = /^https?:\/\/.+/i;
const DATA_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i;
const SVG_RE  = /^\s*<svg[\s>]/i;

function validateAsset(type: AssetType, value: string): AssetValidation {
  if (!value || value.trim() === '') {
    return { valid: false, asset: type, reason: 'Empty value' };
  }

  // launcherIcon accepts SVG strings in addition to URLs and data URIs
  if (type === 'launcherIcon' && SVG_RE.test(value)) {
    return { valid: true, asset: type };
  }

  if (URL_RE.test(value)) {
    return { valid: true, asset: type };
  }

  if (DATA_RE.test(value)) {
    return { valid: true, asset: type };
  }

  return {
    valid:  false,
    asset:  type,
    reason: `Invalid asset format for "${type}". Expected https:// URL, data: URI, or SVG string.`,
  };
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export function createAssetsManager(): IAssetsManager {
  const _assets: BrandAssets = {};

  return {
    set(type: AssetType, value: string): AssetValidation {
      const result = validateAsset(type, value);
      if (result.valid) {
        _assets[type] = value;
      }
      return result;
    },

    get(type: AssetType): string | null {
      return _assets[type] ?? null;
    },

    clear(type: AssetType): void {
      delete _assets[type];
    },

    clearAll(): void {
      for (const key of Object.keys(_assets) as AssetType[]) {
        delete _assets[key];
      }
    },

    validate(type: AssetType, value: string): AssetValidation {
      return validateAsset(type, value);
    },

    getAll(): Readonly<BrandAssets> {
      return Object.freeze({ ..._assets });
    },
  };
}
