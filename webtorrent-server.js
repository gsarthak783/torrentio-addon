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
  if (!torrent || !torrent.files || !Array.isArray(torrent.files)) {
    return null;
  }
  return torrent.files.find(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'mpg', 'mpeg'].includes(ext);
  });
}

// Get torrent info endpoint
app.get("/info", (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link" });
  }

  // Check if torrent already exists
  let torrent = client.get(magnet);
  
  if (torrent && torrent.files && torrent.files.length > 0) {
    // Return existing torrent info
    const files = torrent.files.map((file, index) => ({
      index,
      name: file.name,
      size: file.length,
      path: file.path
    }));

    return res.json({
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
  }

  // Add new torrent with callback
  client.add(magnet, {
    announce: [
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://tracker.openbittorrent.com:6969/announce",
      "udp://tracker.torrent.eu.org:451/announce",
      "udp://exodus.desync.com:6969/announce",
      "udp://tracker.tiny-vps.com:6969/announce"
    ]
  }, (torrent) => {
    // This callback is called when torrent is ready
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
  });
});

// Stream video endpoint with range support
app.get("/stream/:infoHash/:fileIndex", (req, res) => {
  const { infoHash, fileIndex } = req.params;
  const torrent = client.get(infoHash);
  
  if (!torrent) {
    return res.status(404).json({ error: "Torrent not found" });
  }

  if (!torrent.files || torrent.files.length === 0) {
    return res.status(404).json({ error: "Torrent files not loaded yet" });
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

// Add torrent and get streaming URL (POST)
app.post("/add", (req, res) => {
  const { magnet } = req.body;
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link" });
  }

  // Check if torrent already exists and is ready
  let existingTorrent = client.get(magnet);
  
  if (existingTorrent && existingTorrent.files && existingTorrent.files.length > 0) {
    // Return existing torrent
    const videoFile = findVideoFile(existingTorrent);
    
    if (!videoFile) {
      return res.status(404).json({ 
        error: "No video file found",
        files: existingTorrent.files.map(f => f.name)
      });
    }

    const fileIndex = existingTorrent.files.indexOf(videoFile);
    const streamUrl = `http://localhost:${PORT}/stream/${existingTorrent.infoHash}/${fileIndex}`;

    return res.json({
      infoHash: existingTorrent.infoHash,
      name: existingTorrent.name,
      videoFile: {
        index: fileIndex,
        name: videoFile.name,
        size: videoFile.length,
        streamUrl: streamUrl
      },
      allFiles: existingTorrent.files.map((file, index) => ({
        index,
        name: file.name,
        size: file.length,
        streamUrl: `http://localhost:${PORT}/stream/${existingTorrent.infoHash}/${index}`
      }))
    });
  }

  // Add new torrent with callback
  client.add(magnet, {
    announce: [
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://tracker.openbittorrent.com:6969/announce",
      "udp://tracker.torrent.eu.org:451/announce",
      "udp://exodus.desync.com:6969/announce",
      "udp://tracker.tiny-vps.com:6969/announce"
    ]
  }, (torrent) => {
    // This callback is called when torrent is ready with metadata
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
  });
});

// Simple GET endpoint for adding torrents (easier for testing)
app.get("/add", (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link. Use ?magnet=..." });
  }

  // Check if torrent already exists and is ready
  let existingTorrent = client.get(magnet);
  
  if (existingTorrent && existingTorrent.files && existingTorrent.files.length > 0) {
    // Return existing torrent info
    const videoFile = findVideoFile(existingTorrent);
    const fileIndex = videoFile ? existingTorrent.files.indexOf(videoFile) : 0;
    const file = videoFile || existingTorrent.files[0];

    if (file) {
      const streamUrl = `http://localhost:${PORT}/stream/${existingTorrent.infoHash}/${fileIndex}`;
      return res.json({
        success: true,
        infoHash: existingTorrent.infoHash,
        name: existingTorrent.name,
        file: {
          index: fileIndex,
          name: file.name,
          size: file.length,
          streamUrl: streamUrl
        }
      });
    }
  }

  // Add new torrent with callback
  client.add(magnet, {
    announce: [
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://tracker.openbittorrent.com:6969/announce",
      "udp://tracker.torrent.eu.org:451/announce",
      "udp://exodus.desync.com:6969/announce",
      "udp://tracker.tiny-vps.com:6969/announce"
    ]
  }, (torrent) => {
    // This callback is called when torrent is ready
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
  });
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
    ready: torrent.ready || false,
    files: torrent.files ? torrent.files.length : 0
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