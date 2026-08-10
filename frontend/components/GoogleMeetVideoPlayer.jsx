import { useEffect, useMemo, useRef, useState } from 'react';
import VideoWatermarkOverlay from './VideoWatermarkOverlay';
import { buildGoogleMeetVideoProxyPath } from '../lib/googleUtils';
import { useVideoSeekGestures, VideoSeekFeedback, VideoPlayerChromeStyles } from './videoSeekGestures';

export default function GoogleMeetVideoPlayer({
  secureId,
  onMilestonePercent,
  onComplete,
  videoId,
  watermarkText,
  hideWatermark = false,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hasMilestoneRef = useRef(false);
  const hasCompleteRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryCountRef = useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
    setRetryNonce(0);
    hasMilestoneRef.current = false;
    hasCompleteRef.current = false;
  }, [secureId]);

  const src = useMemo(() => {
    const base = buildGoogleMeetVideoProxyPath(secureId);
    if (!base) return '';
    return retryNonce ? `${base}?_=${retryNonce}` : base;
  }, [secureId, retryNonce]);

  const { feedback, containerProps, isFullscreen } = useVideoSeekGestures(videoRef, {
    enabled: Boolean(src),
    attachKey: src,
    containerRef,
  });

  const handleTimeUpdate = (event) => {
    const video = event.currentTarget;
    if (!video.duration) return;
    const percent = (video.currentTime / video.duration) * 100;

    if (!hasMilestoneRef.current && percent >= 10 && onMilestonePercent) {
      hasMilestoneRef.current = true;
      onMilestonePercent(videoId, percent);
    }

    if (!hasCompleteRef.current && percent >= 90 && onComplete) {
      hasCompleteRef.current = true;
      onComplete(videoId, percent);
    }
  };

  const handleVideoError = () => {
    if (retryCountRef.current >= 2) return;
    retryCountRef.current += 1;
    setRetryNonce(Date.now());
  };

  if (!secureId) {
    return (
      <div style={{ color: '#fff', padding: '32px', textAlign: 'center' }}>
        No Google Meet recording selected
      </div>
    );
  }

  if (!src) {
    return (
      <div style={{ color: '#fff', padding: '32px', textAlign: 'center' }}>
        Invalid Google Meet recording link — please re-select the recording
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      {...containerProps}
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        maxHeight: 'min(100vh, 100%)',
        position: 'relative',
        backgroundColor: '#000',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <video
        key={src}
        ref={videoRef}
        src={src}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        playsInline
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: '#000',
          outline: 'none',
          display: 'block',
          objectFit: 'contain',
        }}
        onTimeUpdate={handleTimeUpdate}
        onError={handleVideoError}
      />
      <VideoPlayerChromeStyles />
      <VideoSeekFeedback feedback={feedback} isFullscreen={isFullscreen} />
      {!hideWatermark ? <VideoWatermarkOverlay text={watermarkText} /> : null}
    </div>
  );
}
