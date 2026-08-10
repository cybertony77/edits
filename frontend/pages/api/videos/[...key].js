import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { MongoClient } from 'mongodb';
import { authMiddleware } from '../../../lib/authMiddleware';
import {
  clearZoomAccessTokenCache,
  getZoomAccessToken,
  resolveZoomMp4DownloadUrl,
} from '../../../lib/zoomServer';
import { extractZoomMeetingId } from '../../../lib/zoomUtils';
import {
  assertGoogleMeetFileAssigned,
  fetchGoogleDriveFileStream,
} from '../../../lib/googleServer';
import { decodeGoogleMeetSecureId } from '../../../lib/googleVideoIds';
import {
  getMongoFromEnv,
  MARKETING_DOC_ID,
} from '../../../lib/marketingPageMongo';
import { Readable } from 'stream';

// Disable Next.js body parsing — we stream raw bytes
export const config = {
  api: {
    responseLimit: false,
  },
};

// ─── Load env.config ──────────────────────────────────────────────────────────

function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });

    return envVars;
  } catch (error) {
    console.log('Could not read env.config, using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const accountId = envConfig.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = envConfig.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = envConfig.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const bucketName = envConfig.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
});

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    httpAgent,
    httpsAgent,
  }),
});

// ─── Content-Type mapping ─────────────────────────────────────────────────────

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/x-m4v',
};

function getContentType(key) {
  const lower = key.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (lower.endsWith(ext)) return mime;
  }
  return 'application/octet-stream';
}

function idsMatch(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const leftNorm = extractZoomMeetingId(left) || left;
  const rightNorm = extractZoomMeetingId(right) || right;
  return leftNorm === rightNorm;
}

const ZOOM_STREAM_FETCH_MS = 45_000;

/** Log download URLs without query params (may contain short-lived tokens). */
function sanitizeZoomUrlForLog(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split('?')[0];
  }
}

/** Allow unauthenticated playback only for the published welcome free-session video. */
async function isPublicMarketingSessionVideo(routeParts, { isZoomByPrefix, isZoomByMeetingIdRoute, isGoogleByPrefix }) {
  const systemEnabled =
    (loadEnvConfig().SYSTEM_MARKETING_PAGE === 'true') ||
    process.env.SYSTEM_MARKETING_PAGE === 'true';
  if (!systemEnabled) return false;

  const { MONGO_URI, DB_NAME } = getMongoFromEnv();
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const doc = await db.collection('marketing_page').findOne(
      { _id: MARKETING_DOC_ID },
      {
        projection: {
          page_state: 1,
          session_video_type: 1,
          session_video_id: 1,
          session_video_google_owner: 1,
        },
      }
    );
    if (!doc || doc.page_state === false) return false;

    const type = String(doc.session_video_type || '').toLowerCase();
    const savedId = String(doc.session_video_id || '').trim();
    if (!type || !savedId) return false;

    if (type === 'zoom' && (isZoomByPrefix || isZoomByMeetingIdRoute)) {
      const zoomIdentifier = decodeURIComponent(
        String(isZoomByPrefix ? routeParts.slice(1).join('/') : routeParts[0] || '').trim()
      );
      return idsMatch(zoomIdentifier, savedId);
    }

    if (type === 'google_meet' && isGoogleByPrefix) {
      const secureId = decodeURIComponent(String(routeParts.slice(1).join('/') || '').trim());
      const decoded = decodeGoogleMeetSecureId(secureId);
      if (!decoded?.fileId) return false;
      return idsMatch(decoded.fileId, savedId);
    }

    if (type === 'r2' && !isZoomByPrefix && !isZoomByMeetingIdRoute && !isGoogleByPrefix) {
      const objectKey = routeParts.join('/');
      return idsMatch(objectKey, savedId) || idsMatch(decodeURIComponent(objectKey), savedId);
    }

    return false;
  } catch (e) {
    console.error('public marketing session video check failed:', e);
    return false;
  } finally {
    if (client) await client.close();
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Only GET and HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Build key from catch-all segments ────────────────────────────────────
  const { key } = req.query; // key is an array of path segments
  if (!key || key.length === 0) {
    return res.status(400).json({ error: 'Video key is required' });
  }
  const routeParts = Array.isArray(key) ? key : [key];

  const isZoomByPrefix = routeParts[0] === 'zoom';
  const isGoogleByPrefix = routeParts[0] === 'google';
  const isZoomByMeetingIdRoute = routeParts.length === 1 && /^[0-9]+$/.test(String(routeParts[0]));

  // ── Auth check (allow public welcome free-session Zoom/R2/Google video) ───────────
  let isAuthenticated = false;
  try {
    await authMiddleware(req);
    isAuthenticated = true;
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated) {
    const allowedPublic = await isPublicMarketingSessionVideo(routeParts, {
      isZoomByPrefix,
      isZoomByMeetingIdRoute,
      isGoogleByPrefix,
    });
    if (!allowedPublic) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Zoom routes:
  // - /api/videos/{meetingId}
  // - /api/videos/zoom/{uuid|meetingId|downloadKey}
  // Each request resolves a FRESH download_url from Zoom (UUID architecture preserved).
  if (isZoomByPrefix || isZoomByMeetingIdRoute) {
    const zoomIdentifier = decodeURIComponent(
      String(isZoomByPrefix ? routeParts.slice(1).join('/') : routeParts[0] || '').trim()
    );
    if (!zoomIdentifier) {
      return res.status(400).json({ error: 'Zoom meeting ID is required' });
    }

    const streamStartedAt = Date.now();
    let retryAttempt = 0;

    try {
      const stableId = extractZoomMeetingId(zoomIdentifier) || zoomIdentifier;
      console.log('[zoom-stream] start', {
        recordingId: stableId,
        method: req.method,
        hasRange: Boolean(req.headers.range),
      });

      const fetchUpstream = async (forceRefresh) => {
        if (forceRefresh) {
          clearZoomAccessTokenCache();
        }

        const downloadUrl = await resolveZoomMp4DownloadUrl(stableId, forceRefresh);
        const token = await getZoomAccessToken(forceRefresh);
        const upstreamHeaders = {
          Authorization: `Bearer ${token}`,
        };
        if (req.headers.range) {
          upstreamHeaders.Range = req.headers.range;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ZOOM_STREAM_FETCH_MS);
        const fetchStartedAt = Date.now();

        try {
          const response = await fetch(downloadUrl, {
            method: req.method,
            headers: upstreamHeaders,
            signal: controller.signal,
          });
          console.log('[zoom-stream] upstream response', {
            recordingId: stableId,
            forceRefresh,
            status: response.status,
            downloadUrl: sanitizeZoomUrlForLog(downloadUrl),
            durationMs: Date.now() - fetchStartedAt,
          });
          return { response, downloadUrl };
        } catch (error) {
          if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
            console.error('[zoom-stream] timeout', {
              recordingId: stableId,
              forceRefresh,
              timeoutMs: ZOOM_STREAM_FETCH_MS,
              downloadUrl: sanitizeZoomUrlForLog(downloadUrl),
            });
            const err = new Error(`Zoom stream request timed out after ${ZOOM_STREAM_FETCH_MS}ms`);
            err.statusCode = 504;
            err.isTimeout = true;
            throw err;
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      };

      let { response: zoomVideoResponse } = await fetchUpstream(false);

      // Token or download_url expired — refresh OAuth + re-resolve fresh download_url once
      if (
        zoomVideoResponse.status === 401 ||
        zoomVideoResponse.status === 403
      ) {
        retryAttempt = 1;
        console.log('[zoom-stream] retry after auth/download expiry', {
          recordingId: stableId,
          upstreamStatus: zoomVideoResponse.status,
          retryAttempt,
        });
        clearZoomAccessTokenCache();
        ({ response: zoomVideoResponse } = await fetchUpstream(true));
      }

      if (!zoomVideoResponse.ok) {
        console.error('[zoom-stream] upstream failure', {
          recordingId: stableId,
          status: zoomVideoResponse.status,
          retryAttempt,
          durationMs: Date.now() - streamStartedAt,
        });
        if (zoomVideoResponse.status === 404) {
          return res.status(404).json({ error: 'No recording found for this meeting' });
        }
        if (zoomVideoResponse.status === 401) {
          clearZoomAccessTokenCache();
          return res.status(401).json({ error: 'Zoom token expired' });
        }
        return res.status(502).json({ error: 'Zoom video streaming failed' });
      }

      const headersToForward = [
        'content-range',
        'accept-ranges',
        'content-length',
        'last-modified',
        'etag',
      ];
      headersToForward.forEach((header) => {
        const value = zoomVideoResponse.headers.get(header);
        if (value) res.setHeader(header, value);
      });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Vary', 'Cookie, Range');
      res.statusCode = zoomVideoResponse.status;

      if (req.method === 'HEAD') {
        console.log('[zoom-stream] head completed', {
          recordingId: stableId,
          retryAttempt,
          durationMs: Date.now() - streamStartedAt,
        });
        return res.end();
      }

      if (!zoomVideoResponse.body) {
        return res.status(502).json({ error: 'Zoom API returned empty stream' });
      }

      const stream = Readable.fromWeb(zoomVideoResponse.body);
      const cleanup = () => {
        try {
          if (stream && typeof stream.destroy === 'function') stream.destroy();
        } catch (_) {}
      };

      req.on('close', cleanup);
      req.on('aborted', cleanup);
      stream.on('end', () => {
        console.log('[zoom-stream] completed', {
          recordingId: stableId,
          retryAttempt,
          durationMs: Date.now() - streamStartedAt,
        });
        cleanup();
      });
      stream.on('close', cleanup);
      stream.on('error', (streamError) => {
        console.error('[zoom-stream] pipe error', {
          recordingId: stableId,
          retryAttempt,
          message: streamError?.message || 'unknown',
          durationMs: Date.now() - streamStartedAt,
        });
        cleanup();
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      stream.pipe(res);
      return;
    } catch (error) {
      const statusCode = error?.statusCode || 500;
      console.error('[zoom-stream] error', {
        recordingId: extractZoomMeetingId(zoomIdentifier) || zoomIdentifier,
        httpStatus: statusCode,
        zoomCode: error?.zoomCode ?? error?.details?.code ?? null,
        zoomMessage: error?.zoomMessage || error?.details?.message || error?.message || 'unknown',
        retryAttempt,
        isTimeout: Boolean(error?.isTimeout),
        durationMs: Date.now() - streamStartedAt,
      });
      if (statusCode === 404) {
        return res.status(404).json({ error: 'No recording found for this meeting' });
      }
      if (statusCode === 401) {
        clearZoomAccessTokenCache();
        return res.status(401).json({ error: 'Zoom token expired' });
      }
      if (statusCode === 400) {
        return res.status(400).json({ error: error.message || 'Invalid recording identifier' });
      }
      if (statusCode === 409) {
        return res.status(409).json({ error: error.message || 'Ambiguous meeting ID' });
      }
      if (statusCode === 504 || error?.isTimeout) {
        return res.status(504).json({
          error: 'Zoom stream timed out',
          details: error?.message || 'Upstream Zoom download stalled',
        });
      }
      return res.status(502).json({
        error: 'Zoom API failure',
        details: error?.message || 'Failed to stream Zoom recording',
      });
    }
  }

  // Google Meet routes: /api/videos/google/{secureId}
  if (isGoogleByPrefix) {
    const secureId = decodeURIComponent(String(routeParts.slice(1).join('/') || '').trim());
    if (!secureId) {
      return res.status(400).json({ error: 'Google Meet video id is required' });
    }

    const decoded = decodeGoogleMeetSecureId(secureId);
    if (!decoded?.fileId) {
      return res.status(400).json({ error: 'Invalid secure video id' });
    }

    const assigned = await assertGoogleMeetFileAssigned(decoded.fileId);
    if (!assigned) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!decoded.ownerUserId) {
      return res.status(403).json({ error: 'Google account connection required.' });
    }

    try {
      let driveResponse = await fetchGoogleDriveFileStream({
        ownerUserId: decoded.ownerUserId,
        fileId: decoded.fileId,
        rangeHeader: req.headers.range,
        method: req.method,
      });

      if (driveResponse.status === 401 || driveResponse.status === 403) {
        driveResponse = await fetchGoogleDriveFileStream({
          ownerUserId: decoded.ownerUserId,
          fileId: decoded.fileId,
          rangeHeader: req.headers.range,
          method: req.method,
          forceRefresh: true,
        });
      }

      if (driveResponse.status === 404) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      if (!driveResponse.ok) {
        if (driveResponse.status === 403) {
          return res.status(403).json({ error: 'Google account connection required.' });
        }
        return res.status(502).json({ error: 'Google Meet video streaming failed' });
      }

      const headersToForward = [
        'content-range',
        'accept-ranges',
        'content-length',
        'last-modified',
        'etag',
        'content-type',
      ];
      headersToForward.forEach((header) => {
        const value = driveResponse.headers.get(header);
        if (value) res.setHeader(header, value);
      });

      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'video/mp4');
      }
      if (!res.getHeader('Accept-Ranges')) {
        res.setHeader('Accept-Ranges', 'bytes');
      }
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Vary', 'Cookie, Range');
      res.statusCode = driveResponse.status;

      if (req.method === 'HEAD') {
        return res.end();
      }

      if (!driveResponse.body) {
        return res.status(502).json({ error: 'Google Drive returned empty stream' });
      }

      const stream = Readable.fromWeb(driveResponse.body);
      const cleanup = () => {
        try {
          if (stream && typeof stream.destroy === 'function') stream.destroy();
        } catch (_) {}
      };

      req.on('close', cleanup);
      req.on('aborted', cleanup);
      stream.on('end', cleanup);
      stream.on('close', cleanup);
      stream.on('error', () => {
        cleanup();
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      stream.pipe(res);
      return;
    } catch (error) {
      const statusCode = error?.statusCode || 500;
      const code = error?.code || '';
      if (code === 'GOOGLE_NOT_CONNECTED' || statusCode === 403) {
        return res.status(403).json({ error: 'Google account connection required.' });
      }
      console.error('[google-stream] error', error?.message || error);
      return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502).json({
        error: 'Google Meet video streaming failed',
      });
    }
  }

  // ── R2 config check ──────────────────────────────────────────────────────
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return res.status(500).json({ error: 'R2 configuration is missing' });
  }

  // R2 route: /api/videos/videos/1234_abc_file.mp4 => key = "videos/1234_abc_file.mp4"
  const objectKey = routeParts.join('/');
  console.log('Streaming:', objectKey);

  try {
    req.setTimeout(30000);
    res.setTimeout(30000);
    const rangeHeader = req.headers.range;

    // ── If Range request: fetch just that range ────────────────────────────
    if (rangeHeader) {
      // First, get object metadata to know total size
      const headCmd = new HeadObjectCommand({ Bucket: bucketName, Key: objectKey });
      let headResult;
      try {
        headResult = await client.send(headCmd);
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'Video not found' });
        }
        throw err;
      }

      const totalSize = headResult.ContentLength;
      const contentType = headResult.ContentType || getContentType(objectKey);

      // Parse "bytes=START-END"
      const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      let start, end;
      if (match[1] !== '' && match[2] !== '') {
        start = parseInt(match[1], 10);
        end = parseInt(match[2], 10);
      } else if (match[1] !== '') {
        start = parseInt(match[1], 10);
        // Serve a chunk: min of 5 MB or rest of file
        end = Math.min(start + 5 * 1024 * 1024 - 1, totalSize - 1);
      } else if (match[2] !== '') {
        // bytes=-N  →  last N bytes
        const suffix = parseInt(match[2], 10);
        start = Math.max(0, totalSize - suffix);
        end = totalSize - 1;
      } else {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      // Clamp
      if (start >= totalSize || end >= totalSize) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      const chunkSize = end - start + 1;

      // Fetch the range from R2
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Range: `bytes=${start}-${end}`,
      });
      const getResult = await client.send(getCmd);

      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Length': chunkSize,
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        // Do not cache authenticated streams — stale cached chunks break Range playback after TTL / tab backgrounding
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: 'Cookie',
      });

      // Stream the body
      if (req.method === 'HEAD') {
        return res.end();
      }

      const stream = getResult.Body;
      const cleanup = () => {
        try {
          if (stream && typeof stream.destroy === 'function') stream.destroy();
        } catch (_) {}
      };
      req.on('close', cleanup);
      req.on('aborted', cleanup);
      stream.pipe(res);
      stream.on('end', cleanup);
      stream.on('close', cleanup);
      stream.on('error', (err) => {
        console.error('Stream error:', err);
        cleanup();
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      });

    } else {
      // ── Full request (no Range) ──────────────────────────────────────────
      const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
      let getResult;
      try {
        getResult = await client.send(getCmd);
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'Video not found' });
        }
        throw err;
      }

      const contentType = getResult.ContentType || getContentType(objectKey);
      const contentLength = getResult.ContentLength;

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': contentLength,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: 'Cookie',
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      const stream = getResult.Body;
      const cleanup = () => {
        try {
          if (stream && typeof stream.destroy === 'function') stream.destroy();
        } catch (_) {}
      };
      req.on('close', cleanup);
      req.on('aborted', cleanup);
      stream.pipe(res);
      stream.on('end', cleanup);
      stream.on('close', cleanup);
      stream.on('error', (err) => {
        console.error('Stream error:', err);
        cleanup();
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      });
    }
  } catch (error) {
    console.error('Video streaming error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream video' });
    }
  }
}
