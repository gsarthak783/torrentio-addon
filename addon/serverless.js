import Router from 'router';
import cors from 'cors';
import rateLimit from "express-rate-limit";
import requestIp from 'request-ip';
import userAgentParser from 'ua-parser-js';
import addonInterface from './addon.js';
import qs from 'querystring';
import { manifest } from './lib/manifest.js';
import { parseConfiguration, PreConfigurations } from './lib/configuration.js';
import landingTemplate from './lib/landingTemplate.js';
import * as moch from './moch/moch.js';
import { getTorrent, getFiles } from './lib/repository.js';
import { toStreamInfo } from './lib/streamInfo.js';

const router = new Router();

// Check if database is configured
const isDatabaseConfigured = !!process.env.DATABASE_URI;

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // limit each IP to 300 requests per windowMs
  headers: false,
  keyGenerator: (req) => requestIp.getClientIp(req)
})

router.use(cors())
router.get('/', (_, res) => {
  res.redirect('/configure')
  res.end();
});

router.get(`/:preconfiguration(${Object.keys(PreConfigurations).join('|')})`, (req, res) => {
  res.redirect(`/${req.params.preconfiguration}/configure`)
  res.end();
});

router.get('/:configuration?/configure', (req, res) => {
  const host = `${req.protocol}://${req.headers.host}`;
  const configValues = { ...parseConfiguration(req.params.configuration || ''), host };
  const landingHTML = landingTemplate(manifest(configValues), configValues);
  res.setHeader('content-type', 'text/html');
  res.end(landingHTML);
});

router.get('/:configuration?/manifest.json', (req, res) => {
  const host = `${req.protocol}://${req.headers.host}`;
  const configValues = { ...parseConfiguration(req.params.configuration || ''), host };
  const manifestBuf = JSON.stringify(manifest(configValues));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(manifestBuf)
});

router.get('/:configuration?/:resource/:type/:id/:extra?.json', limiter, (req, res, next) => {
  const { configuration, resource, type, id } = req.params;
  const extra = req.params.extra ? qs.parse(req.url.split('/').pop().slice(0, -5)) : {}
  const ip = requestIp.getClientIp(req);
  const host = `${req.protocol}://${req.headers.host}`;
  const configValues = { ...extra, ...parseConfiguration(configuration), id, type, ip, host };
  addonInterface.get(resource, type, id, configValues)
      .then(resp => {
        const cacheHeaders = {
          cacheMaxAge: 'max-age',
          staleRevalidate: 'stale-while-revalidate',
          staleError: 'stale-if-error'
        };
        const cacheControl = Object.keys(cacheHeaders)
            .map(prop => Number.isInteger(resp[prop]) && cacheHeaders[prop] + '=' + resp[prop])
            .filter(val => !!val).join(', ');

        res.setHeader('Cache-Control', `${cacheControl}, public`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(resp));
      })
      .catch(err => {
        if (err.noHandler) {
          if (next) {
            next()
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ err: 'not found' }));
          }
        } else {
          console.error(err);
          res.writeHead(500);
          res.end(JSON.stringify({ err: 'handler error' }));
        }
      });
});

// New endpoint for getting streaming URLs from torrent hash
router.get('/api/torrent/:infoHash/streams', limiter, async (req, res) => {
  try {
    const infoHash = req.params.infoHash.toLowerCase();
    const ip = requestIp.getClientIp(req);
    const host = `${req.protocol}://${req.headers.host}`;
    
    // Parse configuration from query parameters
    const config = {
      ...req.query,
      ip,
      host
    };

    // Check if database is configured
    if (!isDatabaseConfigured) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Database not configured',
        message: 'The DATABASE_URI environment variable is required for this endpoint. Please configure a PostgreSQL database connection.'
      }));
      return;
    }

    // Get torrent information from database
    const torrent = await getTorrent(infoHash);
    if (!torrent) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Torrent not found' }));
      return;
    }

    // Get files associated with this torrent
    const files = await getFiles([infoHash]);
    
    // Create stream info objects for each file
    const streams = files.map(file => {
      const record = {
        infoHash: file.infoHash,
        fileIndex: file.fileIndex,
        title: file.title,
        size: file.size,
        torrent: torrent.dataValues
      };
      return toStreamInfo(record);
    });

    // Apply moch services if configured
    let processedStreams = streams;
    if (moch.hasMochConfigured(config)) {
      processedStreams = await moch.applyMochs(streams, config);
    }

    // Build response with streaming URLs
    const response = {
      torrent: {
        infoHash: torrent.infoHash,
        title: torrent.title,
        size: torrent.size,
        seeders: torrent.seeders,
        uploadDate: torrent.uploadDate
      },
      streams: processedStreams.map(stream => ({
        name: stream.name,
        title: stream.title,
        url: stream.url,
        fileIndex: stream.fileIdx,
        size: files.find(f => f.fileIndex === stream.fileIdx)?.size,
        filename: stream.behaviorHints?.filename
      })).filter(stream => stream.url) // Only include streams with URLs
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.end(JSON.stringify(response));
  } catch (error) {
    console.error('Error processing torrent streams:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Simple endpoint for generating magnet link from info hash
router.get('/api/torrent/:infoHash/magnet', (req, res) => {
  try {
    const infoHash = req.params.infoHash.toLowerCase();
    
    // Validate info hash format (40 hex characters)
    if (!/^[a-f0-9]{40}$/i.test(infoHash)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid info hash format' }));
      return;
    }
    
    // Default trackers for magnet links
    const defaultTrackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.tiny-vps.com:6969/announce',
      'udp://explodie.org:6969/announce',
      'udp://tracker.moeking.me:6969/announce',
      'udp://tracker.dler.org:6969/announce',
      'udp://tracker.uw0.xyz:6969/announce',
      'wss://tracker.openwebtorrent.com'
    ];
    
    // Build magnet link
    const magnetLink = `magnet:?xt=urn:btih:${infoHash}` + 
      defaultTrackers.map(tracker => `&tr=${encodeURIComponent(tracker)}`).join('');
    
    const response = {
      infoHash: infoHash,
      magnetLink: magnetLink,
      trackers: defaultTrackers
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.end(JSON.stringify(response));
  } catch (error) {
    console.error('Error generating magnet link:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Demo endpoint for testing streaming URLs without database
router.get('/api/demo/torrent/:infoHash/streams', limiter, async (req, res) => {
  try {
    const infoHash = req.params.infoHash.toLowerCase();
    const ip = requestIp.getClientIp(req);
    const host = `${req.protocol}://${req.headers.host}`;
    
    // Parse configuration from query parameters
    const config = {
      ...req.query,
      ip,
      host
    };

    // Create mock torrent data for demo
    const mockTorrent = {
      infoHash: infoHash,
      title: 'Demo Torrent File',
      size: 1073741824, // 1GB
      seeders: 100,
      uploadDate: new Date().toISOString(),
      provider: 'Demo',
      type: 'movie',
      trackers: 'udp://tracker.opentrackr.org:1337/announce'
    };

    // Create mock stream data
    const mockStreams = [{
      name: `[Torrentio]\n1080p`,
      title: `Demo Torrent File\n👤 100  💾 1 GB  ⚙️ Demo`,
      infoHash: infoHash,
      fileIdx: 0,
      sources: [
        'tracker:udp://tracker.opentrackr.org:1337/announce',
        'tracker:udp://open.demonii.com:1337/announce',
        'dht:' + infoHash
      ]
    }];

    // Apply moch services if configured
    let processedStreams = mockStreams;
    if (moch.hasMochConfigured(config)) {
      processedStreams = await moch.applyMochs(mockStreams, config);
    }

    // If no debrid service configured, add magnet link
    if (!moch.hasMochConfigured(config) || processedStreams.every(s => !s.url)) {
      const magnetLink = `magnet:?xt=urn:btih:${infoHash}` + 
        '&tr=' + encodeURIComponent('udp://tracker.opentrackr.org:1337/announce') +
        '&tr=' + encodeURIComponent('udp://open.demonii.com:1337/announce');
      
      processedStreams = processedStreams.map(stream => ({
        ...stream,
        url: magnetLink
      }));
    }

    // Build response
    const response = {
      torrent: mockTorrent,
      streams: processedStreams.map(stream => ({
        name: stream.name,
        title: stream.title,
        url: stream.url,
        fileIndex: stream.fileIdx || 0,
        size: mockTorrent.size,
        filename: 'demo-file.mp4'
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    res.end(JSON.stringify(response));
  } catch (error) {
    console.error('Error processing demo streams:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

router.get(
    [
      '/:moch/:apiKey/:infoHash/:cachedEntryInfo/:fileIndex/:filename?',
      '/resolve/:moch/:apiKey/:infoHash/:cachedEntryInfo/:fileIndex/:filename?'
    ],
    (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const parameters = {
    mochKey: req.params.moch,
    apiKey: req.params.apiKey,
    infoHash: req.params.infoHash.toLowerCase(),
    fileIndex: isNaN(req.params.fileIndex) ? undefined : parseInt(req.params.fileIndex),
    cachedEntryInfo: req.params.cachedEntryInfo,
    ip: requestIp.getClientIp(req),
    host: `${req.protocol}://${req.headers.host}`,
    isBrowser: !userAgent.includes('Stremio') && !!userAgentParser(userAgent).browser.name
  }
  moch.resolve(parameters)
      .then(url => {
        res.writeHead(302, { Location: url });
        res.end();
      })
      .catch(error => {
        console.log(error);
        res.statusCode = 404;
        res.end();
      });
});

export default function (req, res) {
  router(req, res, function () {
    res.statusCode = 404;
    res.end();
  });
};
