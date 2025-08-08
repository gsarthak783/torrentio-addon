import WebTorrent from "webtorrent";
import express from "express";
import cors from "cors";
import rangeParser from "range-parser";

const app = express();
const client = new WebTorrent();

app.use(cors());
app.use(express.json());

// Helper function to find video files
function findVideoFile(torrent) {
  return torrent.files.find(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'mpg', 'mpeg'].includes(ext);
  });
}

// Get torrent info endpoint
app.get("/info", async (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link" });
  }

  try {
    // Check if torrent already exists
    let torrent = client.get(magnet);
    
    if (!torrent) {
      // Add the torrent and wait for it to be ready
      torrent = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout waiting for torrent metadata'));
        }, 30000);

        client.add(magnet, {
          announce: [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://exodus.desync.com:6969/announce",
            "udp://tracker.tiny-vps.com:6969/announce"
          ]
        }, (torrent) => {
          clearTimeout(timeoutId);
          // Torrent is ready when callback is called
          resolve(torrent);
        });
      });
    }

    // Get torrent info
    const files = torrent.files.map((file, index) => ({
      index,
      name: file.name,
      size: file.length,
      path: file.path
    }));

    res.json({
      name: torrent.name,
      infoHash: torrent.infoHash,
      length: torrent.length,
      files: files,
      peers: torrent.numPeers || 0,
      downloaded: torrent.downloaded || 0,
      uploaded: torrent.uploaded || 0,
      downloadSpeed: torrent.downloadSpeed || 0,
      uploadSpeed: torrent.uploadSpeed || 0,
      progress: torrent.progress || 0,
      ratio: torrent.ratio || 0
    });

  } catch (error) {
    console.error('Error getting torrent info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream video endpoint with range support
app.get("/stream/:infoHash/:fileIndex", (req, res) => {
  const { infoHash, fileIndex } = req.params;
  const torrent = client.get(infoHash);
  
  if (!torrent) {
    return res.status(404).json({ error: "Torrent not found" });
  }

  const file = torrent.files[parseInt(fileIndex)];
  
  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  // Set content type based on file extension
  const ext = file.name.split('.').pop().toLowerCase();
  const contentType = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'flv': 'video/x-flv',
    'wmv': 'video/x-ms-wmv',
    'mpg': 'video/mpeg',
    'mpeg': 'video/mpeg'
  }[ext] || 'video/mp4';

  const range = req.headers.range;
  const fileSize = file.length;

  if (!range) {
    // No range requested, send entire file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Accept-Ranges', 'bytes');
    
    const stream = file.createReadStream();
    stream.pipe(res);
    return;
  }

  // Parse range header
  const ranges = rangeParser(fileSize, range);
  
  if (ranges === -1) {
    res.status(416).send('Range Not Satisfiable');
    return;
  }

  const { start, end } = ranges[0];
  const chunkSize = end - start + 1;

  res.status(206); // Partial Content
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', chunkSize);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Accept-Ranges', 'bytes');

  const stream = file.createReadStream({ start, end });
  stream.pipe(res);
});

// Add torrent and get streaming URL
app.post("/add", async (req, res) => {
  const { magnet } = req.body;
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link" });
  }

  try {
    // Check if torrent already exists
    let torrent = client.get(magnet);
    
    if (!torrent) {
      // Add the torrent using callback
      torrent = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout waiting for torrent metadata'));
        }, 30000);

        client.add(magnet, {
          announce: [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://exodus.desync.com:6969/announce",
            "udp://tracker.tiny-vps.com:6969/announce"
          ]
        }, (torrent) => {
          clearTimeout(timeoutId);
          resolve(torrent);
        });
      });
    }

    // Find video file
    const videoFile = findVideoFile(torrent);
    
    if (!videoFile) {
      return res.status(404).json({ 
        error: "No video file found",
        files: torrent.files.map(f => f.name)
      });
    }

    const fileIndex = torrent.files.indexOf(videoFile);
    const streamUrl = `http://localhost:${PORT}/stream/${torrent.infoHash}/${fileIndex}`;

    res.json({
      infoHash: torrent.infoHash,
      name: torrent.name,
      videoFile: {
        index: fileIndex,
        name: videoFile.name,
        size: videoFile.length,
        streamUrl: streamUrl
      },
      allFiles: torrent.files.map((file, index) => ({
        index,
        name: file.name,
        size: file.length,
        streamUrl: `http://localhost:${PORT}/stream/${torrent.infoHash}/${index}`
      }))
    });

  } catch (error) {
    console.error('Error adding torrent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple GET endpoint for adding torrents (easier for testing)
app.get("/add", async (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link. Use ?magnet=..." });
  }

  try {
    // Check if torrent already exists
    let torrent = client.get(magnet);
    
    if (!torrent) {
      // Add the torrent using callback
      torrent = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout waiting for torrent metadata'));
        }, 30000);

        client.add(magnet, {
          announce: [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://exodus.desync.com:6969/announce",
            "udp://tracker.tiny-vps.com:6969/announce"
          ]
        }, (torrent) => {
          clearTimeout(timeoutId);
          resolve(torrent);
        });
      });
    }

    // Find video file
    const videoFile = findVideoFile(torrent);
    const fileIndex = videoFile ? torrent.files.indexOf(videoFile) : 0;
    const file = videoFile || torrent.files[0];

    if (file) {
      const streamUrl = `http://localhost:${PORT}/stream/${torrent.infoHash}/${fileIndex}`;
      res.json({
        success: true,
        infoHash: torrent.infoHash,
        name: torrent.name,
        file: {
          index: fileIndex,
          name: file.name,
          size: file.length,
          streamUrl: streamUrl
        }
      });
    } else {
      res.status(404).json({ error: "No files found in torrent" });
    }

  } catch (error) {
    console.error('Error adding torrent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove torrent
app.delete("/remove/:infoHash", (req, res) => {
  const { infoHash } = req.params;
  const torrent = client.get(infoHash);
  
  if (!torrent) {
    return res.status(404).json({ error: "Torrent not found" });
  }

  torrent.destroy(() => {
    res.json({ message: "Torrent removed successfully" });
  });
});

// List all torrents
app.get("/torrents", (req, res) => {
  const torrents = client.torrents.map(torrent => ({
    infoHash: torrent.infoHash,
    name: torrent.name || 'Unknown',
    progress: torrent.progress || 0,
    downloadSpeed: torrent.downloadSpeed || 0,
    uploadSpeed: torrent.uploadSpeed || 0,
    peers: torrent.numPeers || 0,
    ratio: torrent.ratio || 0,
    downloaded: torrent.downloaded || 0,
    uploaded: torrent.uploaded || 0,
    length: torrent.length || 0,
    ready: torrent.ready || false
  }));

  res.json({ torrents });
});

// Stats endpoint
app.get("/stats", (req, res) => {
  res.json({
    torrents: client.torrents.length,
    downloadSpeed: client.downloadSpeed || 0,
    uploadSpeed: client.uploadSpeed || 0,
    progress: client.progress || 0,
    ratio: client.ratio || 0
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "WebTorrent Streaming Server",
    version: "1.0.0",
    endpoints: {
      "POST /add": "Add torrent and get streaming URL",
      "GET /add?magnet=...": "Add torrent via GET request",
      "GET /info?magnet=...": "Get torrent information",
      "GET /stream/:hash/:index": "Stream a specific file",
      "GET /torrents": "List all active torrents",
      "GET /stats": "Get client statistics",
      "DELETE /remove/:hash": "Remove a torrent"
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎬 WebTorrent Streaming Server running at http://localhost:${PORT}`);
  console.log(`
Available endpoints:
  POST   /add                     - Add torrent and get streaming URL
  GET    /add?magnet=...         - Add torrent via GET request  
  GET    /info?magnet=...        - Get torrent information
  GET    /stream/:hash/:index    - Stream a specific file
  GET    /torrents               - List all active torrents
  GET    /stats                  - Get client statistics
  DELETE /remove/:hash           - Remove a torrent
  `);
}); 