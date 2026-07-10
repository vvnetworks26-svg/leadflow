# Phase LF.6 — White-Label Widget Platform & Customer Branding
## Implementation Report

**Date:** July 8, 2026
**Status:** ✅ Complete
**Build:** ✅ Zero TypeScript errors — clean production build
**Source files:** 161 total (19 new files: 7 models + 10 widget services + controller + routes)

---

## Executive Summary

LeadFlow now has a complete white-label widget platform. Every organization can fully customize the embeddable chat widget — colors, fonts, logos, avatars, launcher type, behavior rules, language, and layout — without writing code. The platform supports 7 built-in themes, live preview generation, deployment versioning with rollback, framework-specific installation snippets for 11 platforms, 10-language localization with RTL support, A/B testing with statistical winner detection, and granular analytics. All configuration is organization-scoped.

---

## Files Created

### Models (7)

| Model | Purpose |
|-------|---------|
| `WidgetConfiguration.model.ts` | Master org config — branding, colors, typography, launcher, behavior. One per org. |
| `WidgetTheme.model.ts` | System + custom org themes with full color/typography/style definitions |
| `WidgetDeployment.model.ts` | Deployment versions with frozen config snapshots — draft/published/archived |
| `WidgetLocalization.model.ts` | Per-locale string overrides with RTL flag. Unique per org+locale. |
| `WidgetAnalytics.model.ts` | Widget engagement events — TTL 1 year, 12 event types |
| `WidgetABTest.model.ts` | A/B test definitions with variant traffic splits and conversion counters |
| `WidgetAsset.model.ts` | Registered branding assets — logos, avatars, icons, backgrounds, fonts |

### Widget Services (10 files in `src/widget/`)

| Module | File | Responsibility |
|--------|------|---------------|
| branding | `WidgetConfigService.ts` | Get/update/publish config, apply theme, get published snapshot |
| branding | `CssSanitizer.ts` | Block XSS: strips `<script>`, `javascript:`, `expression()`, `@import`, data: URLs |
| themes | `ThemeService.ts` | 7 system themes seeded at startup, org custom themes, duplicate + modify |
| versioning | `DeploymentService.ts` | Version history, rollback, snapshot diff |
| localization | `LocalizationService.ts` | 10 built-in locales, org overrides, RTL detection, English fallback |
| deployment | `SnippetGenerator.ts` | 11 framework snippets: HTML, React, Next.js, Vue, Angular, WordPress, Shopify, Webflow, Wix, Squarespace, JS |
| analytics | `WidgetAnalyticsService.ts` | Fire-and-forget event tracking, 9 aggregated stat metrics |
| abtest | `ABTestService.ts` | Variant management, deterministic routing, z-test winner detection, auto-promote |
| assets | `AssetService.ts` | Asset registration with MIME type + size validation, HTTPS URL enforcement |
| preview | `PreviewService.ts` | Live preview payload — CSS variables, strings, RTL flag, device, no DB write |

### Controller + Routes

| File | Endpoints |
|------|-----------|
| `src/controllers/widgetPlatformController.ts` | 30 handler functions |
| `src/routes/widget-platform.routes.ts` | 34 routes at `/api/v1/widget-platform` |

### Modified Files

| File | Change |
|------|--------|
| `src/config/database.ts` | Registered 7 new Widget models |
| `src/routes/index.ts` | Mounted `/widget-platform` route |
| `src/server.ts` | Seeds system themes at startup |

---

## Branding Customization Fields

### Company Identity
| Field | Description |
|-------|-------------|
| `companyName` | Displayed in widget header |
| `widgetName` | Widget window title |
| `assistantName` | AI agent display name |
| `welcomeMessage` | Opening message text |
| `subtitle` | Response time tagline |
| `logoUrl` | Header logo image |
| `avatarUrl` | AI avatar image |
| `faviconUrl` | Browser favicon |

### Colors (10 configurable)
`accentColor` · `backgroundColor` · `surfaceColor` · `textPrimary` · `textSecondary` · `borderColor` · `userBubbleColor` · `aiBubbleColor` · `userTextColor` · `aiTextColor`

### Typography
`fontFamily` · `fontSize` · `fontWeight` · `lineHeight` · `customFontUrl`

### Layout
`borderRadius` (px) · `buttonStyle` (rounded/pill/square/soft) · `shadowStyle` (none/sm/md/lg/xl/glow) · `animationStyle`

### Custom CSS
Sanitized before save. Blocked patterns: `<script>`, `javascript:`, `expression()`, `@import`, `behavior:`, `data:` URLs, extreme z-index, `position: fixed`.

---

## Built-in Themes (7, seeded at startup)

| Theme | Style | Key Color | Font |
|-------|-------|-----------|------|
| Light | Clean modern | `#6366f1` indigo | Inter |
| Dark | Dark mode | `#818cf8` | Inter |
| Minimal | Zero-decoration | `#000000` | system-ui |
| Glass | Frosted glass | `#8b5cf6` purple | Inter |
| Corporate | Enterprise B2B | `#1d4ed8` blue | Segoe UI |
| Modern | Teal accent | `#06b6d4` cyan | Plus Jakarta Sans |
| Luxury | Premium dark | `#d4af37` gold | Playfair Display |

Organizations can duplicate any system theme and modify the copy.

---

## Launcher Types (6)

`floating_bubble` (default FAB) · `side_tab` (edge tab) · `inline` (embedded in page) · `embedded_card` (static card) · `fullscreen` · `custom_button`

Configurable: position, X/Y offset, size, icon, badge text, pulse animation, entry animation, label text.

---

## Behavior Controls

| Setting | Options |
|---------|---------|
| Auto-open | toggle + delay seconds |
| Exit intent | trigger on mouse exit |
| Scroll trigger | % of page scrolled |
| Page targeting | show/hide on URL patterns |
| Device rules | mobile-only / desktop-only |
| Working hours | show only during business hours |
| Offline mode | custom offline message |
| Conversation persistence | remember chat across sessions |
| Typing indicators | animated "..." |
| Sound effects | toggle |

---

## Deployment Versioning

```
Edit config (draft) → PATCH /widget-platform/config
                    ↓
Publish → POST /widget-platform/config/publish
        ↓ creates WidgetDeployment { status: 'published', version: N, configSnapshot: {...} }
        ↓ archives previous published version
        ↓ increments draftVersion for next cycle

Rollback → POST /widget-platform/deployments/:id/rollback
         ↓ restores configSnapshot to live config
         ↓ re-publishes that version

Diff → GET /widget-platform/deployments/diff?fromId=&toId=
     ↓ returns { field: { from: old, to: new } } for every changed field
```

---

## Installation Snippets (11 platforms)

All generated from org slug — no auth required to embed the widget:

| Platform | Method |
|----------|--------|
| HTML | `<script>` tag in `<body>` |
| JavaScript | Identical to HTML |
| React | `useEffect` hook component |
| Next.js | `next/script` with `strategy="lazyOnload"` |
| Vue / Nuxt | Plugin file or index.html |
| Angular | `angular.json` scripts array + `ngOnInit` |
| WordPress | `functions.php` `wp_enqueue_script` |
| Shopify | `theme.liquid` footer injection |
| Webflow | Site Settings → Custom Code → Footer |
| Wix | Settings → Custom Code → Body end |
| Squarespace | Settings → Advanced → Code Injection → Footer |

---

## Localization (10 languages built-in)

| Code | Language | RTL |
|------|----------|-----|
| en | English | No |
| es | Spanish | No |
| fr | French | No |
| de | German | No |
| pt | Portuguese | No |
| ar | Arabic | **Yes** |
| hi | Hindi | No |
| zh | Chinese | No |
| ja | Japanese | No |
| it | Italian | No |

All 10 string keys per locale: `welcomeMessage`, `placeholder`, `sendButton`, `typingIndicator`, `offlineMessage`, `closeButton`, `minimizeButton`, `poweredBy`, `bookingButton`, `errorMessage`.

Organizations can override any string. Missing keys fall back to English defaults.

---

## Live Preview

`POST /widget-platform/preview` returns a complete `PreviewPayload` with:
- Full merged config (base + overrides applied in-memory, **not saved**)
- Resolved locale strings for the config's `localeCode`
- Computed CSS custom properties (`--lf-accent`, `--lf-bg`, `--lf-radius`, etc.)
- `isRTL` flag
- Device context (`desktop` / `tablet` / `mobile`)

Frontend renders this directly — changes are instant with zero DB round-trips.

---

## A/B Testing

```
1. Create test with variants (traffic split must = 100%)
2. Start test → status: 'running'
3. Widget SDK routes sessions deterministically by hashed sessionId
4. Each impression/open/lead/booking increments variant counters
5. POST /ab-tests/:id/promote → runs z-test:
   - Requires n ≥ 30 impressions per variant
   - z-score threshold: 95% → 1.96, 99% → 2.576
   - If winner is significant: applies winner.configOverride to live config → auto-publishes
   - Sets status: 'completed', winnerVariantId
```

Deterministic routing: `hash(sessionId) % 100` maps each visitor to the same bucket across page loads — no cookies required.

---

## Widget Analytics (12 event types)

`impression` · `open` · `close` · `message_sent` · `message_received` · `lead_qualified` · `booking_created` · `cta_clicked` · `session_start` · `session_end` · `bounce` · `variant_view`

Aggregated stats: impressions, opens, messages, qualifiedLeads, bookings, openRate, conversionRate, bookingRate, averageSessionMs, bounceRate, byDevice, byPage (top 10), byLocale, dailyImpressions (30d), variantPerformance.

Events are tracked from the widget itself via `POST /widget-platform/analytics/track?token=<orgSlug>` — no authentication required.

---

## Asset Management

| Type | Allowed MIME types | Max size |
|------|--------------------|---------|
| logo | PNG, JPEG, SVG, WebP | 5 MB |
| avatar | PNG, JPEG, WebP, GIF | 5 MB |
| icon | PNG, SVG, ICO | 5 MB |
| background | PNG, JPEG, WebP, GIF | 5 MB |
| font | WOFF, WOFF2, TTF | 5 MB |
| favicon | ICO, PNG, SVG | 5 MB |

All asset URLs must be HTTPS. Actual file hosting is external (S3/CDN) — LeadFlow stores the URL and metadata only.

---

## API Endpoints (34 routes at `/api/v1/widget-platform`)

```
GET    /config                           get widget configuration
PATCH  /config                           update configuration
POST   /config/apply-theme               apply a theme preset
POST   /config/publish                   publish draft → new version
GET    /config/published                 get published snapshot

GET    /themes                           list all themes (system + org custom)
POST   /themes/:id/duplicate             fork a theme
PATCH  /themes/:id                       update custom theme
DELETE /themes/:id                       delete custom theme

GET    /deployments                      version history
GET    /deployments/diff?fromId=&toId=   diff two versions
GET    /deployments/:id                  get a specific version
POST   /deployments/:id/rollback         restore a version

GET    /locales/supported                list all supported locales
GET    /locales                          list org locale configs
PUT    /locales                          upsert locale strings
DELETE /locales/:localeCode              delete a locale

GET    /snippets                         all platform snippets
GET    /snippets/:platform               single platform snippet

POST   /preview                          live preview (no save)

POST   /analytics/track                  track widget event (public)
GET    /analytics                        get aggregated stats

GET    /ab-tests                         list A/B tests
POST   /ab-tests                         create test
POST   /ab-tests/:id/start               start test
POST   /ab-tests/:id/pause               pause test
POST   /ab-tests/:id/promote             check + auto-promote winner
DELETE /ab-tests/:id                     delete test

GET    /assets/allowed-types             get MIME type allowlist
GET    /assets                           list org assets
POST   /assets                           register new asset URL
DELETE /assets/:id                       delete asset
```

---

## Security

| Threat | Mitigation |
|--------|-----------|
| CSS XSS | `CssSanitizer.ts` — 8 blocked pattern regexes, truncated at 10,000 chars |
| Script injection | `customScript` field stripped on every save |
| HTML injection | `sanitizeHtml()` — strips `<script>` tags, `on*=` attributes, `javascript:` |
| Asset URL injection | HTTPS-only validation on asset registration |
| Extreme CSS | `position: fixed` and extreme `z-index` blocked |
| Data exfiltration | `url(data:...)` blocked in CSS |

---

## Acceptance Criteria

| Criteria | Status |
|----------|--------|
| ✅ Zero TypeScript errors | PASS |
| ✅ Clean production build | PASS |
| ✅ White-label branding | PASS — 20+ customizable fields |
| ✅ Multiple themes | PASS — 7 system themes + custom org themes |
| ✅ Live preview | PASS — in-memory, zero DB write, CSS vars generated |
| ✅ Deployment snippets | PASS — 11 platforms |
| ✅ SDK integration | PASS — published snapshot endpoint for SDK to fetch |
| ✅ Versioning | PASS — draft/published/archived with rollback + diff |
| ✅ Localization | PASS — 10 languages, RTL, English fallback, org overrides |
| ✅ Analytics | PASS — 12 event types, 9 aggregated metrics, TTL indexed |
| ✅ A/B testing | PASS — traffic split, z-test winner detection, auto-promote |
| ✅ Asset management | PASS — MIME + size + HTTPS validation |
| ✅ Multi-tenant support | PASS — organizationId on every model, unique-per-org config |
| ✅ Existing functionality preserved | PASS — all prior routes, models, services intact |
