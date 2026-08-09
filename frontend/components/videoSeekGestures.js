import { useCallback, useEffect, useRef, useState } from 'react';

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

/**
 * Fullscreen the player container so seek UI stays visible.
 * Do NOT mutate inline styles — :fullscreen CSS handles fill layout.
 */
export async function togglePlayerFullscreen(container, video) {
  const current = getFullscreenElement();
  try {
    if (current) {
      await exitFullscreenDoc();
      return false;
    }

    const target = container || video;
    if (!target) return false;

    if (typeof target.requestFullscreen === 'function') {
      await target.requestFullscreen();
      return true;
    }
    if (typeof target.webkitRequestFullscreen === 'function') {
      await target.webkitRequestFullscreen();
      return true;
    }
    if (video && typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen();
      return true;
    }
    if (typeof target.msRequestFullscreen === 'function') {
      await target.msRequestFullscreen();
      return true;
    }
    return false;
  } catch {
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
  const upgradingFsRef = useRef(false);

  const clearFeedbackTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showFeedback = useCallback(
    (side) => {
      setFeedback({ side, id: Date.now() });
      clearFeedbackTimer();
      hideTimerRef.current = setTimeout(() => {
        setFeedback(null);
        hideTimerRef.current = null;
      }, FEEDBACK_MS);
    },
    [clearFeedbackTimer]
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

  const isPlayerContextActive = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef?.current;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const fs = getFullscreenElement();

    if (isHoveredRef.current) return true;
    if (fs && (fs === container || fs === video || (container && container.contains(fs)))) return true;
    if (video && (active === video || video.contains?.(active))) return true;
    if (container && active && container.contains(active)) return true;
    return false;
  }, [videoRef, containerRef]);

  useEffect(() => () => clearFeedbackTimer(), [clearFeedbackTimer]);

  // Clear leftover imperative fullscreen styles from older builds only.
  useEffect(() => {
    if (getFullscreenElement()) return;
    const container = containerRef?.current;
    const video = videoRef.current;

    const looksLikeStuckFs =
      container?.style?.getPropertyPriority?.('height') === 'important' ||
      container?.style?.height === '100vh' ||
      video?.style?.getPropertyPriority?.('position') === 'important' ||
      video?.style?.position === 'absolute';

    if (!looksLikeStuckFs) return;

    const props = [
      'width', 'height', 'max-width', 'max-height', 'aspect-ratio', 'position',
      'inset', 'top', 'right', 'bottom', 'left', 'object-fit', 'display',
      'overflow', 'margin', 'padding', 'border', 'border-radius', 'background',
      'background-color',
    ];
    props.forEach((prop) => {
      container?.style?.removeProperty(prop);
      video?.style?.removeProperty(prop);
    });
  }, [containerRef, videoRef, attachKey]);

  // Sync fullscreen flag. If native button fullscreens <video> alone, upgrade to container.
  useEffect(() => {
    if (!enabled) return undefined;

    const syncFullscreen = async () => {
      const fs = getFullscreenElement();
      const video = videoRef.current;
      const container = containerRef?.current;

      if (fs && video && container && fs === video && !upgradingFsRef.current) {
        upgradingFsRef.current = true;
        try {
          await exitFullscreenDoc();
          if (typeof container.requestFullscreen === 'function') {
            await container.requestFullscreen();
          } else if (typeof container.webkitRequestFullscreen === 'function') {
            await container.webkitRequestFullscreen();
          }
        } catch {
          // ignore — fall through to state sync
        } finally {
          upgradingFsRef.current = false;
        }
        setIsFullscreen(Boolean(getFullscreenElement()));
        return;
      }

      const active =
        Boolean(fs) &&
        (fs === container || fs === video || (container && container.contains(fs)));
      setIsFullscreen(active);
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, [enabled, containerRef, videoRef]);

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
        togglePlayerFullscreen(container, video);
        return;
      }

      seekBySide(isLeft ? 'left' : 'right');
    };

    document.addEventListener('keydown', onKeyDownCapture, true);
    return () => document.removeEventListener('keydown', onKeyDownCapture, true);
  }, [enabled, seekBySide, isPlayerContextActive, videoRef, containerRef]);

  // Double-click + double-tap (mobile) on the video element
  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    const resolveSide = (clientX, rect) => {
      const x = clientX - rect.left;
      return x < rect.width / 2 ? 'left' : 'right';
    };

    const controlsReserve = () => {
      // Larger reserve on touch / small screens so native controls stay usable
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
        return 72;
      }
      return CONTROLS_RESERVED_PX;
    };

    const inControlsZone = (clientY, rect) => clientY > rect.bottom - controlsReserve();

    const onDblClick = (event) => {
      const rect = video.getBoundingClientRect();
      if (inControlsZone(event.clientY, rect)) return;
      event.preventDefault();
      event.stopPropagation();
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

    video.addEventListener('dblclick', onDblClick);
    video.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      video.removeEventListener('dblclick', onDblClick);
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
      }
      .video-player-root:fullscreen .video-seek-feedback-root,
      .video-player-root:-webkit-full-screen .video-seek-feedback-root {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 20 !important;
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

  return (
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
        zIndex: 20,
        userSelect: 'none',
        overflow: 'hidden',
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
}
