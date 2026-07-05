/**
 * ui/animation.ts — Animation Engine.
 * Manages CSS-based animations (fade/scale/slide/spring).
 * Infrastructure only — no component-specific animations.
 */

import { eventBus }      from '../eventBus';
import { WidgetEvent }   from '../events';
import { Duration, Easing } from './tokens';
import type { IAnimationEngine, AnimationOptions, AnimationHandle, AnimationType } from './types';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// CSS keyframe definitions applied via Web Animations API (where available)
// or inline style transitions as a fallback.
function getKeyframes(type: AnimationType, direction: 'in' | 'out'): Keyframe[] {
  const visible   = { opacity: '1', transform: 'scale(1) translateY(0px)' };
  const invisible = { opacity: '0' };
  switch (type) {
    case 'fade':
      return direction === 'in'
        ? [{ opacity: '0' }, { opacity: '1' }]
        : [{ opacity: '1' }, { opacity: '0' }];
    case 'scale':
      return direction === 'in'
        ? [{ opacity: '0', transform: 'scale(0.92)' }, visible]
        : [visible, { opacity: '0', transform: 'scale(0.92)' }];
    case 'slide':
      return direction === 'in'
        ? [{ opacity: '0', transform: 'translateY(8px)' }, visible]
        : [visible, { opacity: '0', transform: 'translateY(8px)' }];
    case 'spring':
      return direction === 'in'
        ? [{ opacity: '0', transform: 'scale(0.88)' }, visible]
        : [visible, { opacity: '0', transform: 'scale(0.88)' }];
    default:
      return [invisible, { opacity: '1' }];
  }
}

export function createAnimationEngine(): IAnimationEngine {
  const _active = new Map<string, { anim: Animation | null; running: boolean }>();

  return {
    start(element: HTMLElement, options: AnimationOptions): AnimationHandle {
      const id        = uuid();
      const duration  = options.duration  ?? Duration.normal;
      const easing    = options.easing    ?? (options.type === 'spring' ? Easing.spring : Easing.easeOut);
      const keyframes = getKeyframes(options.type, options.direction);

      let nativeAnim: Animation | null = null;
      const entry = { anim: null as Animation | null, running: true };
      _active.set(id, entry);

      eventBus.emit(WidgetEvent.ANIMATION_STARTED, {
        timestamp: new Date().toISOString(),
        animId:    id,
        type:      options.type,
        direction: options.direction,
      });

      if (typeof element.animate === 'function') {
        nativeAnim = element.animate(keyframes, {
          duration,
          easing,
          delay:    options.delay ?? 0,
          fill:     'forwards',
        });
        entry.anim = nativeAnim;

        nativeAnim.onfinish = () => {
          entry.running = false;
          options.onComplete?.();
          eventBus.emit(WidgetEvent.ANIMATION_COMPLETED, {
            timestamp: new Date().toISOString(),
            animId:    id,
            type:      options.type,
          });
          _active.delete(id);
        };
        nativeAnim.oncancel = () => {
          entry.running = false;
          _active.delete(id);
        };
      } else {
        // Fallback: apply final state immediately
        if (keyframes.length > 0) {
          const final = keyframes[keyframes.length - 1] ?? {};
          for (const [k, v] of Object.entries(final)) {
            (element.style as unknown as Record<string, string>)[k] = String(v);
          }
        }
        entry.running = false;
        options.onComplete?.();
        eventBus.emit(WidgetEvent.ANIMATION_COMPLETED, {
          timestamp: new Date().toISOString(),
          animId:    id,
          type:      options.type,
        });
        _active.delete(id);
      }

      const handle: AnimationHandle = {
        id,
        type: options.type,
        get running() { return entry.running; },
        cancel: () => this.cancel(id),
      };

      return handle;
    },

    stop(id: string): void {
      const entry = _active.get(id);
      if (!entry) return;
      entry.anim?.finish();
      entry.running = false;
      _active.delete(id);
    },

    cancel(id: string): void {
      const entry = _active.get(id);
      if (!entry) return;
      entry.anim?.cancel();
      entry.running = false;
      _active.delete(id);
    },

    isRunning(id: string): boolean {
      return _active.get(id)?.running ?? false;
    },

    activeCount(): number {
      return _active.size;
    },
  };
}
