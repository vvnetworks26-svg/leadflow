/**
 * ui/types.ts — All public UI Foundation types. Pure contracts.
 */

// ─── Theme ────────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

export interface IThemeEngine {
  setTheme(mode: ThemeMode): void;
  getTheme(): ThemeMode;
  resolveTheme(): ResolvedTheme;
  subscribe(cb: (resolved: ResolvedTheme) => void): () => void;
  unsubscribe(cb: (resolved: ResolvedTheme) => void): void;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export type LayoutDirection = 'row' | 'column';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'between';

export interface LayoutOptions {
  direction?: LayoutDirection;
  gap?:       number;
  align?:     LayoutAlign;
  justify?:   LayoutAlign;
  wrap?:      boolean;
}

export interface ILayoutEngine {
  stack(options?: Pick<LayoutOptions, 'gap' | 'align'>): Readonly<Record<string, string>>;
  row(options?: LayoutOptions): Readonly<Record<string, string>>;
  column(options?: LayoutOptions): Readonly<Record<string, string>>;
  center(): Readonly<Record<string, string>>;
  spacer(size: number): Readonly<Record<string, string>>;
  container(maxWidth?: number): Readonly<Record<string, string>>;
  panel(): Readonly<Record<string, string>>;
}

// ─── Animation ───────────────────────────────────────────────────────────────

export type AnimationType = 'fade' | 'scale' | 'slide' | 'spring';
export type AnimationDirection = 'in' | 'out';

export interface AnimationOptions {
  type:       AnimationType;
  direction:  AnimationDirection;
  duration?:  number;
  easing?:    string;
  delay?:     number;
  onComplete?: () => void;
}

export interface AnimationHandle {
  readonly id:       string;
  readonly type:     AnimationType;
  readonly running:  boolean;
  cancel():          void;
}

export interface IAnimationEngine {
  start(element: HTMLElement, options: AnimationOptions): AnimationHandle;
  stop(id: string): void;
  cancel(id: string): void;
  isRunning(id: string): boolean;
  activeCount(): number;
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

export type OverlayLayerType = 'modal' | 'tooltip' | 'dropdown' | 'toast';

export interface OverlayLayer {
  readonly id:       string;
  readonly type:     OverlayLayerType;
  readonly element:  HTMLElement;
  readonly zIndex:   number;
  readonly createdAt: string;
}

export interface IOverlayManager {
  createLayer(type: OverlayLayerType, root: HTMLElement): OverlayLayer;
  removeLayer(id: string): void;
  getLayer(id: string): OverlayLayer | undefined;
  count(): number;
  clear(): void;
}

// ─── Focus ────────────────────────────────────────────────────────────────────

export interface FocusTrapOptions {
  /** Element to return focus to when trap is released. */
  restoreTo?: HTMLElement;
  /** First element to focus inside the trap. */
  initialFocus?: HTMLElement;
}

export interface IFocusManager {
  trap(container: HTMLElement, options?: FocusTrapOptions): () => void;
  restore(): void;
  moveFocus(direction: 'next' | 'prev', container: HTMLElement): void;
  getFocusable(container: HTMLElement): HTMLElement[];
}

// ─── Responsive ───────────────────────────────────────────────────────────────

export type BreakpointName = 'mobile' | 'tablet' | 'desktop';

export interface ViewportInfo {
  width:  number;
  height: number;
  breakpoint: BreakpointName;
}

export interface IResponsiveManager {
  getViewport(): ViewportInfo;
  isMobile(): boolean;
  isTablet(): boolean;
  isDesktop(): boolean;
  subscribe(cb: (viewport: ViewportInfo) => void): () => void;
  unsubscribe(cb: (viewport: ViewportInfo) => void): void;
}

// ─── Component base ───────────────────────────────────────────────────────────

export type ComponentState = 'idle' | 'mounted' | 'updating' | 'hidden' | 'destroyed';

export interface ComponentStatus {
  state:      ComponentState;
  mountedAt:  string | null;
}

export interface IComponent {
  readonly id:    string;
  mount(target: HTMLElement): void;
  render(): void;
  update(props: Record<string, unknown>): void;
  destroy(): void;
  show(): void;
  hide(): void;
  getStatus(): ComponentStatus;
  isMounted(): boolean;
}

// ─── UI Foundation ────────────────────────────────────────────────────────────

export interface UIFoundationDiagnostics {
  activeTheme:       ResolvedTheme;
  themeMode:         ThemeMode;
  layoutMode:        string;
  overlayCount:      number;
  activeAnimations:  number;
  viewport:          string;
  componentCount:    number;
}

export interface IUIFoundation {
  readonly theme:       IThemeEngine;
  readonly layout:      ILayoutEngine;
  readonly animation:   IAnimationEngine;
  readonly overlay:     IOverlayManager;
  readonly focus:       IFocusManager;
  readonly responsive:  IResponsiveManager;
  registerComponent(component: IComponent): void;
  unregisterComponent(id: string): void;
  getDiagnostics(): UIFoundationDiagnostics;
}
