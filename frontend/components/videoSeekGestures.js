import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const SEEK_SECONDS = 10;
const FEEDBACK_MS = 750;
const DOUBLE_TAP_MS = 300;
/** Leave native control bar clickable / ignore seek taps there. */
const CONTROLS_RESERVED_PX = 64;

/**
 * Seek by delta seconds without pausing, reloading, or changing src.
 * @returns {boolean} whether seek applied
 */
export function seekVideoBy(video, deltaSeconds) {
  if (!video) return false;
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const next = Math.min(Math.max(0, current + deltaSeconds), duration);
  try {
    video.currentTime = next;
    return true;
  } catch {
    return false;
  }
}

function getFullscreenElement() {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

async function exitFullscreenDoc() {
  if (typeof document === 'undefined') return;
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
}

const STUCK_FS_STYLE_PROPS = [
  'width', 'height', 'max-width', 'max-height', 'aspect-ratio', 'position',
  'inset', 'top', 'right', 'bottom', 'left', 'object-fit', 'display',
  'overflow', 'margin', 'padding', 'border', 'border-radius', 'background',
  'background-color',
];

/** Strip only legacy imperative fullscreen overrides (!important / 100vh). */
function clearStuckFullscreenStyles(container, video) {
  [container, video].forEach((el) => {
    if (!el?.style) return;
    STUCK_FS_STYLE_PROPS.forEach((prop) => {
      if (el.style.getPropertyPriority?.(prop) === 'important') {
        el.style.removeProperty(prop);
      }
    });
  });
  if (container?.style?.height === '100vh') {
    container.style.removeProperty('height');
    container.style.removeProperty('width');
  }
}

function isOurFullscreen(fs, container, video) {
  if (!fs) return false;
  if (container && (fs === container || container.contains(fs))) return true;
  if (video && fs === video) return true;
  return false;
}

/** Map <video> → player root so native FS can be redirected to the container. */
const videoFullscreenHosts = new WeakMap();
let fullscreenApiPatched = false;

function requestFsOn(el, options) {
  if (!el) return Promise.reject(new Error('No fullscreen target'));
  if (typeof el.requestFullscreen === 'function') {
    // Prefer the native HTMLElement method (avoids recursive instance overrides).
    const native = HTMLElement.prototype.requestFullscreen;
    if (typeof native === 'function') return native.call(el, options);
    return el.requestFullscreen(options);
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    return Promise.resolve(el.webkitRequestFullscreen());
  }
  if (typeof el.msRequestFullscreen === 'function') {
    return Promise.resolve(el.msRequestFullscreen());
  }
  return Promise.reject(new Error('Fullscreen unsupported'));
}

/**
 * Chrome/Edge native controls call video.requestFullscreen().
 * Redirect that to the player container so seek UI stays in the FS layer —
 * no exit/re-enter flicker, native FS button still works.
 */
function ensureFullscreenApiPatch() {
  if (fullscreenApiPatched || typeof HTMLVideoElement === 'undefined') return;
  fullscreenApiPatched = true;

  const proto = HTMLVideoElement.prototype;
  const nativeRF =
    typeof HTMLElement !== 'undefined' && HTMLElement.prototype.requestFullscreen
      ? HTMLElement.prototype.requestFullscreen
      : proto.requestFullscreen;
  const nativeWebkitRF = proto.webkitRequestFullscreen;

  if (typeof nativeRF === 'function') {
    proto.requestFullscreen = function patchedRequestFullscreen(options) {
      const host = videoFullscreenHosts.get(this);
      if (host) return nativeRF.call(host, options);
      return nativeRF.call(this, options);
    };
  }

  if (typeof nativeWebkitRF === 'function') {
    proto.webkitRequestFullscreen = function patchedWebkitRequestFullscreen() {
      const host = videoFullscreenHosts.get(this);
      if (host) {
        const hostWebkit =
          (typeof HTMLElement !== 'undefined' &&
            HTMLElement.prototype.webkitRequestFullscreen) ||
          host.webkitRequestFullscreen;
        if (typeof hostWebkit === 'function') {
          return hostWebkit.call(host);
        }
        if (typeof nativeRF === 'function') {
          return nativeRF.call(host);
        }
      }
      return nativeWebkitRF.call(this);
    };
  }
  // Leave webkitEnterFullscreen alone (iOS Safari requires the <video>).
}

function bindVideoFullscreenHost(video, container) {
  if (!video || !container) return () => {};
  ensureFullscreenApiPatch();
  videoFullscreenHosts.set(video, container);
  return () => {
    if (videoFullscreenHosts.get(video) === container) {
      videoFullscreenHosts.delete(video);
    }
  };
}

/**
 * Fullscreen the player container so seek UI stays visible.
 * Do NOT mutate inline styles — :fullscreen CSS handles fill layout.
 * Never exit+re-enter in the same gesture (browsers drop user activation).
 */
export async function togglePlayerFullscreen(container, video) {
  const current = getFullscreenElement();
  try {
    if (isOurFullscreen(current, container, video)) {
      await exitFullscreenDoc();
      clearStuckFullscreenStyles(container, video);
      return false;
    }

    // Another element is fullscreen — exit only; do not chain-enter here.
    if (current) {
      await exitFullscreenDoc();
      return false;
    }

    const target = container || video;
    if (!target) return false;

    try {
      await requestFsOn(target);
      return true;
    } catch {
      // iOS Safari: only the video element can go fullscreen.
      if (video && typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
        return true;
      }
      throw new Error('Fullscreen unsupported');
    }
  } catch {
    clearStuckFullscreenStyles(container, video);
    return Boolean(getFullscreenElement());
  }
}

/**
 * Shared keyboard + double-click/tap seek gestures for HTML5 <video>.
 */
export function useVideoSeekGestures(
  videoRef,
  { enabled = true, attachKey = null, containerRef = null } = {}
) {
  const [feedback, setFeedback] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimerRef = useRef(null);
  const isHoveredRef = useRef(false);
  const lastTapRef = useRef({ at: 0, side: null });
  const controlsWasEnabledRef = useRef(null);

  const clearFeedbackTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const restoreControlsIfNeeded = useCallback(() => {
    const video = videoRef.current;
    if (video && controlsWasEnabledRef.current === true) {
      video.controls = true;
    }
    controlsWasEnabledRef.current = null;
  }, [videoRef]);

  const showFeedback = useCallback(
    (side) => {
      const video = videoRef.current;
      const container = containerRef?.current;
      const fs = getFullscreenElement();
      const inFs = isOurFullscreen(fs, container, video);

      // Native <video controls> paints above HTML overlays in fullscreen.
      // Briefly hide controls so the seek UI can appear on top.
      if (inFs && video) {
        if (video.controls) {
          controlsWasEnabledRef.current = true;
          video.controls = false;
        }
        // Force a paint so the overlay isn't covered by the control chrome.
        void video.offsetHeight;
      }

      setFeedback({ side, id: Date.now() });
      clearFeedbackTimer();
      hideTimerRef.current = setTimeout(() => {
        setFeedback(null);
        hideTimerRef.current = null;
        restoreControlsIfNeeded();
      }, FEEDBACK_MS);
    },
    [clearFeedbackTimer, restoreControlsIfNeeded, videoRef, containerRef]
  );

  const seekBySide = useCallback(
    (side) => {
      const delta = side === 'left' ? -SEEK_SECONDS : SEEK_SECONDS;
      const ok = seekVideoBy(videoRef.current, delta);
      if (ok) showFeedback(side);
      return ok;
    },
    [videoRef, showFeedback]
  );

  const toggleFullscreen = useCallback(() => {
    return togglePlayerFullscreen(containerRef?.current, videoRef.current);
  }, [containerRef, videoRef]);

  const isPlayerContextActive = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef?.current;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const fs = getFullscreenElement();

    if (isHoveredRef.current) return true;
    if (isOurFullscreen(fs, container, video)) return true;
    if (video && (active === video || video.contains?.(active))) return true;
    if (container && active && container.contains(active)) return true;
    return false;
  }, [videoRef, containerRef]);

  useEffect(
    () => () => {
      clearFeedbackTimer();
      restoreControlsIfNeeded();
    },
    [clearFeedbackTimer, restoreControlsIfNeeded]
  );

  // Clear leftover imperative fullscreen styles from older builds / failed exits.
  useEffect(() => {
    if (getFullscreenElement()) return;
    const container = containerRef?.current;
    const video = videoRef.current;

    const looksLikeStuckFs =
      container?.style?.getPropertyPriority?.('height') === 'important' ||
      container?.style?.height === '100vh' ||
      video?.style?.getPropertyPriority?.('position') === 'important' ||
      video?.style?.getPropertyPriority?.('inset') === 'important';

    if (!looksLikeStuckFs) return;
    clearStuckFullscreenStyles(container, video);
  }, [containerRef, videoRef, attachKey]);

  // Sync fullscreen flag only (no exit/re-enter — that causes flicker).
  useEffect(() => {
    if (!enabled) return undefined;

    const syncFullscreen = () => {
      const fs = getFullscreenElement();
      const video = videoRef.current;
      const container = containerRef?.current;
      const active = isOurFullscreen(fs, container, video);
      setIsFullscreen(active);
      if (!active) {
        clearStuckFullscreenStyles(container, video);
        restoreControlsIfNeeded();
      }
    };

    const onWebkitBegin = () => setIsFullscreen(true);
    const onWebkitEnd = () => {
      setIsFullscreen(false);
      clearStuckFullscreenStyles(containerRef?.current, videoRef.current);
      restoreControlsIfNeeded();
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    const video = videoRef.current;
    video?.addEventListener?.('webkitbeginfullscreen', onWebkitBegin);
    video?.addEventListener?.('webkitendfullscreen', onWebkitEnd);
    syncFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      video?.removeEventListener?.('webkitbeginfullscreen', onWebkitBegin);
      video?.removeEventListener?.('webkitendfullscreen', onWebkitEnd);
    };
  }, [enabled, containerRef, videoRef, attachKey, restoreControlsIfNeeded]);

  // Redirect native <video> fullscreen (controls button) → container.
  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    const container = containerRef?.current;
    if (!video || !container) return undefined;
    return bindVideoFullscreenHost(video, container);
  }, [enabled, containerRef, videoRef, attachKey]);

  // Capture-phase keyboard: arrows seek 10s; F toggles container fullscreen.
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDownCapture = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      const video = videoRef.current;
      const container = containerRef?.current;
      if (!video) return;

      const targetIsVideo = target === video || video.contains?.(target);
      const targetInContainer = container && container.contains(target);
      if (!targetIsVideo && !targetInContainer && !isPlayerContextActive()) return;

      const isLeft = event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
      const isRight = event.key === 'ArrowRight' || event.code === 'ArrowRight';
      const isF =
        !event.shiftKey &&
        (event.key === 'f' || event.key === 'F' || event.code === 'KeyF');

      if (!isLeft && !isRight && !isF) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      if (isF) {
        toggleFullscreen();
        return;
      }

      seekBySide(isLeft ? 'left' : 'right');
    };

    document.addEventListener('keydown', onKeyDownCapture, true);
    return () => document.removeEventListener('keydown', onKeyDownCapture, true);
  }, [enabled, seekBySide, isPlayerContextActive, toggleFullscreen, videoRef, containerRef]);

  // Double-click / double-tap = seek ONLY (never toggle fullscreen).
  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    const resolveSide = (clientX, rect) => {
      const x = clientX - rect.left;
      return x < rect.width / 2 ? 'left' : 'right';
    };

    const controlsReserve = () => {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
        return 72;
      }
      return CONTROLS_RESERVED_PX;
    };

    const inControlsZone = (clientY, rect) => clientY > rect.bottom - controlsReserve();

    const blockBrowserFullscreenToggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };

    const onDblClick = (event) => {
      const rect = video.getBoundingClientRect();
      blockBrowserFullscreenToggle(event);
      if (inControlsZone(event.clientY, rect)) return;
      seekBySide(resolveSide(event.clientX, rect));
    };

    const onTouchEnd = (event) => {
      if (!event.changedTouches || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const rect = video.getBoundingClientRect();
      if (inControlsZone(touch.clientY, rect)) return;

      const side = resolveSide(touch.clientX, rect);
      const now = Date.now();
      const prev = lastTapRef.current;

      if (now - prev.at <= DOUBLE_TAP_MS && prev.side === side) {
        event.preventDefault();
        seekBySide(side);
        lastTapRef.current = { at: 0, side: null };
      } else {
        lastTapRef.current = { at: now, side };
      }
    };

    video.addEventListener('dblclick', onDblClick, true);
    video.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      video.removeEventListener('dblclick', onDblClick, true);
      video.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, videoRef, seekBySide, attachKey]);

  const containerProps = {
    tabIndex: 0,
    className: 'video-player-root',
    'data-fullscreen': isFullscreen ? 'true' : 'false',
    onMouseEnter: () => {
      isHoveredRef.current = true;
    },
    onMouseLeave: () => {
      isHoveredRef.current = false;
    },
    onFocus: () => {
      isHoveredRef.current = true;
    },
  };

  return {
    feedback,
    containerProps,
    seekBySide,
    isFullscreen,
    toggleFullscreen,
  };
}

/** Fullscreen-only layout. Never applied in normal (non-fullscreen) mode. */
export function VideoPlayerChromeStyles() {
  return (
    <style>{`
      .video-player-root:fullscreen,
      .video-player-root:-webkit-full-screen,
      .video-player-root:-moz-full-screen {
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        aspect-ratio: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        background: #000 !important;
        position: relative !important;
        display: block !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        isolation: isolate !important;
      }
      .video-player-root:fullscreen > video,
      .video-player-root:-webkit-full-screen > video,
      .video-player-root:-moz-full-screen > video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        aspect-ratio: auto !important;
        object-fit: contain !important;
        background: #000 !important;
        box-sizing: border-box !important;
        z-index: 1 !important;
      }
      .video-player-root > video:fullscreen,
      .video-player-root > video:-webkit-full-screen,
      .video-player-root > video:-moz-full-screen {
        object-fit: contain !important;
        background: #000 !important;
      }
      .video-player-root:fullscreen .video-seek-feedback-root,
      .video-player-root:-webkit-full-screen .video-seek-feedback-root,
      .video-player-root:-moz-full-screen .video-seek-feedback-root,
      .video-player-root[data-fullscreen="true"] .video-seek-feedback-root {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 2147483646 !important;
        pointer-events: none !important;
        transform: translateZ(0) !important;
        -webkit-transform: translateZ(0) !important;
      }

      @media (max-width: 768px) {
        .video-seek-feedback-root .video-seek-circle {
          width: clamp(64px, 22vw, 96px) !important;
          height: clamp(64px, 22vw, 96px) !important;
        }
        .video-seek-feedback-root .video-seek-label {
          font-size: clamp(0.75rem, 3.2vw, 0.95rem) !important;
        }
      }
    `}</style>
  );
}

function SeekChevrons({ direction, size = 26 }) {
  const isBack = direction === 'left';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        transform: isBack ? 'scaleX(-1)' : undefined,
      }}
    >
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{
            marginLeft: i === 0 ? 0 : -Math.round(size * 0.45),
            opacity: 0.35 + i * 0.25,
            animation: `videoSeekChevronPulse 0.75s ease-out ${i * 0.06}s both`,
          }}
          aria-hidden
        >
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      ))}
    </div>
  );
}

/** YouTube / Netflix style seek flash — responsive for mobile. */
export function VideoSeekFeedback({ feedback, isFullscreen = false }) {
  if (!feedback?.side) return null;

  const isLeft = feedback.side === 'left';
  const circleSize = isFullscreen
    ? 'clamp(88px, 14vw, 128px)'
    : 'clamp(72px, 18vw, 96px)';
  const chevronSize = isFullscreen ? 30 : 24;
  const labelSize = isFullscreen
    ? 'clamp(0.9rem, 2.2vw, 1.15rem)'
    : 'clamp(0.8rem, 3vw, 0.95rem)';

  const node = (
    <div
      key={feedback.id}
      aria-hidden
      className="video-seek-feedback-root"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: isFullscreen ? 2147483646 : 20,
        userSelect: 'none',
        overflow: 'hidden',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: isLeft ? 0 : '50%',
          width: '50%',
          background: isLeft
            ? 'radial-gradient(ellipse at 30% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 42%, transparent 72%)'
            : 'radial-gradient(ellipse at 70% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 42%, transparent 72%)',
          animation: 'videoSeekWash 0.75s ease-out forwards',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: CONTROLS_RESERVED_PX,
          left: isLeft ? 0 : '50%',
          width: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          animation: 'videoSeekPop 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          boxSizing: 'border-box',
          padding: '0 8px',
        }}
      >
        <div
          className="video-seek-circle"
          style={{
            width: circleSize,
            height: circleSize,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.14)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow:
              '0 10px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 55%)',
              pointerEvents: 'none',
            }}
          />
          <SeekChevrons direction={isLeft ? 'left' : 'right'} size={chevronSize} />
        </div>
        <div
          className="video-seek-label"
          style={{
            color: '#fff',
            fontSize: labelSize,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textShadow: '0 2px 14px rgba(0,0,0,0.75)',
            fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {SEEK_SECONDS} seconds
        </div>
      </div>

      <style>{`
        @keyframes videoSeekPop {
          0% { opacity: 0; transform: scale(0.78); }
          18% { opacity: 1; transform: scale(1.04); }
          35% { opacity: 1; transform: scale(1); }
          70% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        @keyframes videoSeekWash {
          0% { opacity: 0; }
          20% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes videoSeekChevronPulse {
          0% { opacity: 0.2; transform: translateX(0) scale(0.92); }
          40% { opacity: 1; }
          100% { opacity: 0.45; }
        }
      `}</style>
    </div>
  );

  // Mount into the active fullscreen element so the overlay is inside the FS layer.
  if (isFullscreen && typeof document !== 'undefined') {
    const mount = document.fullscreenElement || document.webkitFullscreenElement;
    if (mount) return createPortal(node, mount);
  }

  return node;
}
