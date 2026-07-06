/**
 * branding/controller.ts — Branding Controller.
 *
 * Single entry point for all branding operations.
 * Owns: color engine, typography engine, assets manager, white label manager.
 * Integrates with: Theme Engine, Renderer.
 *
 * Exposed on:
 *   runtime.branding
 *   window.__LEADFLOW__.branding
 */

import { createColorEngine }        from './colors';
import { createTypographyEngine }   from './typography';
import { createAssetsManager }      from './assets';
import { createWhiteLabelManager, CORNER_RADIUS_MAP, SHADOW_MAP } from './whiteLabel';
import { injectBrandingVars, syncThemeMode } from './theme';
import { eventBus }                 from '../eventBus';
import { WidgetEvent }              from '../events';
import { LOG_PREFIX }               from '../constants';
import type { IRenderer }           from '../rendering/types';
import type { IUIFoundation }       from '../ui/types';
import type {
  BrandConfig,
  ActiveBrand,
  BrandingDiagnostics,
  BrandPalette,
  ResolvedTypography,
  IBrandingController,
  IColorEngine,
  ITypographyEngine,
  IAssetsManager,
  IWhiteLabelManager,
} from './types';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_BRAND: ActiveBrand = {
  companyName:       'LeadFlow Chat',
  themeMode:         'auto',
  palette:           {} as BrandPalette,   // filled on first apply
  typography:        {} as ResolvedTypography,
  cornerRadius:      '12px',
  shadow:            '0 8px 32px rgba(0,0,0,0.14)',
  animationPreset:   'normal',
  whiteLabelEnabled: false,
  hidePoweredBy:     false,
  poweredByText:     'Powered by LeadFlow',
  assets:            {},
};

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createBrandingController(
  renderer: IRenderer,
  ui:       IUIFoundation,
): IBrandingController {

  const _colorEngine:    IColorEngine      = createColorEngine();
  const _typEngine:      ITypographyEngine = createTypographyEngine();
  const _assetsManager:  IAssetsManager    = createAssetsManager();
  const _wlManager:      IWhiteLabelManager = createWhiteLabelManager();

  // Initialise with defaults
  let _palette:    BrandPalette       = _colorEngine.getDefaults('light');
  let _typography: ResolvedTypography = _typEngine.getDefaults();
  let _active:     ActiveBrand        = {
    ...DEFAULT_BRAND,
    palette:    _palette,
    typography: _typography,
  };
  let _enabled = false;

  function _applyToDOM(): void {
    const container = renderer.getContainer()?.container ?? null;
    injectBrandingVars(
      container,
      _palette,
      _typography,
      (_active.cornerRadius === '0px'      ? 'none'
      : _active.cornerRadius === '6px'     ? 'small'
      : _active.cornerRadius === '8px'     ? 'medium'
      : _active.cornerRadius === '9999px'  ? 'pill'
      : 'large') as import('./types').CornerRadius,
      (_active.shadow === 'none'           ? 'none'
      : _active.shadow.includes('1px')     ? 'subtle'
      : _active.shadow.includes('16px')    ? 'strong'
      : 'medium') as import('./types').ShadowPreset,
      _active.animationPreset,
    );
  }

  return {

    apply(config: BrandConfig): void {
      const ts = new Date().toISOString();
      _enabled = true;

      // ── Colors ──────────────────────────────────────────────────────────
      let changedColors = false;
      if (config.colors) {
        const newPalette = _colorEngine.generate(config.colors);
        _palette = newPalette;
        changedColors = true;
      }

      // ── Typography ──────────────────────────────────────────────────────
      let changedTypo = false;
      if (config.typography) {
        _typography = _typEngine.resolve(config.typography);
        changedTypo = true;
      }

      // ── Assets ──────────────────────────────────────────────────────────
      if (config.assets) {
        for (const [k, v] of Object.entries(config.assets)) {
          if (v) _assetsManager.set(k as keyof typeof config.assets, v);
        }
        eventBus.emit(WidgetEvent.LOGO_UPDATED, {
          timestamp:    ts,
          logoSet:      !!config.assets.logo,
          avatarSet:    !!config.assets.avatar,
          launcherSet:  !!config.assets.launcherIcon,
        });
      }

      // ── White label ──────────────────────────────────────────────────────
      if (config.whiteLabel) {
        _wlManager.apply(config.whiteLabel);
        const wlEnabled = _wlManager.isEnabled();
        eventBus.emit(
          wlEnabled ? WidgetEvent.WHITE_LABEL_ENABLED : WidgetEvent.WHITE_LABEL_DISABLED,
          { timestamp: ts }
        );
      }

      // ── Theme mode ───────────────────────────────────────────────────────
      if (config.themeMode) {
        syncThemeMode(ui.theme, config.themeMode);
        if (config.themeMode === 'dark') {
          _palette = _colorEngine.getDefaults('dark');
        }
        eventBus.emit(WidgetEvent.THEME_UPDATED, {
          timestamp: ts,
          mode:      config.themeMode,
        });
      }

      // ── Compute corner radius / shadow strings ───────────────────────────
      const cr     = config.cornerRadius    ?? config.whiteLabel?.cornerRadius    ?? 'large';
      const shadow = config.shadowPreset    ?? config.whiteLabel?.shadowPreset    ?? 'medium';
      const anim   = config.animationPreset ?? config.whiteLabel?.animationPreset ?? 'normal';

      const wlConfig   = _wlManager.getConfig();
      const companyName = config.companyName
        ?? config.whiteLabel?.companyName
        ?? wlConfig.companyName
        ?? DEFAULT_BRAND.companyName;

      _active = {
        companyName,
        themeMode:         config.themeMode          ?? _active.themeMode,
        palette:           _palette,
        typography:        _typography,
        cornerRadius:      CORNER_RADIUS_MAP[cr]     ?? '12px',
        shadow:            SHADOW_MAP[shadow]         ?? SHADOW_MAP['medium']!,
        animationPreset:   anim,
        whiteLabelEnabled: _wlManager.isEnabled(),
        hidePoweredBy:     wlConfig.hidePoweredBy ?? false,
        poweredByText:     wlConfig.poweredByText  ?? DEFAULT_BRAND.poweredByText,
        assets:            _assetsManager.getAll(),
      };

      // ── Apply to DOM ─────────────────────────────────────────────────────
      _applyToDOM();

      // ── Events ───────────────────────────────────────────────────────────
      eventBus.emit(WidgetEvent.BRANDING_UPDATED, {
        timestamp:     ts,
        companyName,
        colorsChanged: changedColors,
        typoChanged:   changedTypo,
      });

      if (changedTypo) {
        eventBus.emit(WidgetEvent.TYPOGRAPHY_UPDATED, {
          timestamp:  ts,
          fontFamily: _typography.fontFamily,
          bodySize:   _typography.bodySize,
        });
      }

      console.log(`${LOG_PREFIX} Branding applied: ${companyName}`);
    },

    reset(): void {
      _palette    = _colorEngine.getDefaults('light');
      _typography = _typEngine.getDefaults();
      _assetsManager.clearAll();
      _wlManager.reset();
      _enabled = false;
      _active  = {
        ...DEFAULT_BRAND,
        palette:    _palette,
        typography: _typography,
      };
      _applyToDOM();
      eventBus.emit(WidgetEvent.BRANDING_UPDATED, {
        timestamp:     new Date().toISOString(),
        companyName:   DEFAULT_BRAND.companyName,
        colorsChanged: true,
        typoChanged:   true,
      });
    },

    getActiveBrand(): Readonly<ActiveBrand> {
      return Object.freeze({ ..._active });
    },

    getDiagnostics(): BrandingDiagnostics {
      return {
        brandingEnabled:   _enabled,
        whiteLabelEnabled: _wlManager.isEnabled(),
        activeBrand:       _active.companyName,
        activePalette:     _active.palette.primary,
        activeTypography:  _active.typography.fontFamily,
        logoConfigured:    !!_assetsManager.get('logo'),
        avatarConfigured:  !!_assetsManager.get('avatar'),
      };
    },

    destroy(): void {
      _assetsManager.clearAll();
      _wlManager.reset();
      _enabled = false;
    },
  };
}
