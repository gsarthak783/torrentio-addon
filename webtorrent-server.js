import WebTorrent from "webtorrent";
import express from "express";
import cors from "cors";
import rangeParser from "range-parser";

const app = express();
const client = new WebTorrent();

// Track torrents being added to prevent race conditions
const addingTorrents = new Map();

// Global error handler for WebTorrent client
client.on('error', (err) => {
    console.error('WebTorrent client error:', err.message);
    // Don't crash the server, just log the error
});

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

// Helper function to wait for torrent to have enough data
async function waitForTorrentReady(torrent, minProgress = 0.02, timeout = 30000) {
  const startTime = Date.now();
  
  // If already has enough progress, return immediately
  if (torrent.progress >= minProgress) {
    return true;
  }
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // Check if we have enough progress
      if (torrent.progress >= minProgress) {
        clearInterval(checkInterval);
        resolve(true);
      }
      
      // Check for timeout
      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 1000); // Check every second
  });
}

// Get torrent info endpoint
app.get("/info", (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link" });
  }

  // Extract info hash from magnet link
  const infoHashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/);
  const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;
  
  if (!infoHash) {
    return res.status(400).json({ error: "Invalid magnet link - no info hash found" });
  }

  // Check if torrent already exists
  let torrent = client.get(infoHash);
  
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
  try {
    const torrent = client.add(magnet, {
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

    // Handle torrent errors
    torrent.on('error', (err) => {
      console.error(`Torrent error in /info for ${infoHash}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });

  } catch (error) {
    // Handle synchronous errors (like duplicate torrent)
    console.error(`Error adding torrent in /info for ${infoHash}:`, error.message);
    
    // If it's a duplicate torrent error, try to get the existing one
    if (error.message && error.message.includes('duplicate torrent')) {
      const existingTorrent = client.get(infoHash);
      if (existingTorrent && existingTorrent.files && existingTorrent.files.length > 0) {
        const files = existingTorrent.files.map((file, index) => ({
          index,
          name: file.name,
          size: file.length,
          path: file.path
        }));

        return res.json({
          name: existingTorrent.name,
          infoHash: existingTorrent.infoHash,
          length: existingTorrent.length,
          files: files,
          peers: existingTorrent.numPeers || 0,
          downloaded: existingTorrent.downloaded || 0,
          uploaded: existingTorrent.uploaded || 0,
          downloadSpeed: existingTorrent.downloadSpeed || 0,
          uploadSpeed: existingTorrent.uploadSpeed || 0,
          progress: existingTorrent.progress || 0,
          ratio: existingTorrent.ratio || 0
        });
      }
    }
    
    res.status(500).json({ error: error.message || "Failed to add torrent" });
  }
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

  // Select this file for sequential download (important for streaming)
  file.select();

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
app.post("/add", async (req, res) => {
  const { magnet } = req.body;
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link" });
  }

  // Extract info hash from magnet link
  const infoHashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/);
  const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;
  
  if (!infoHash) {
    return res.status(400).json({ error: "Invalid magnet link - no info hash found" });
  }

  // Check if torrent already exists and is ready
  let existingTorrent = client.get(infoHash);
  
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

  // Check if we're already adding this torrent
  const existingPromise = addingTorrents.get(infoHash);
  if (existingPromise) {
    try {
      const torrent = await existingPromise;
      const videoFile = findVideoFile(torrent);
      
      if (!videoFile) {
        return res.status(404).json({ 
          error: "No video file found",
          files: torrent.files.map(f => f.name)
        });
      }

      const fileIndex = torrent.files.indexOf(videoFile);
      const streamUrl = `http://localhost:${PORT}/stream/${torrent.infoHash}/${fileIndex}`;

      return res.json({
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
      return res.status(500).json({ error: error.message });
    }
  }

  // Create a promise for this torrent addition
  const addPromise = new Promise((resolve, reject) => {
    try {
      // Add new torrent with callback
      const torrent = client.add(magnet, {
        announce: [
          "udp://tracker.opentrackr.org:1337/announce",
          "udp://tracker.openbittorrent.com:6969/announce",
          "udp://tracker.torrent.eu.org:451/announce",
          "udp://exodus.desync.com:6969/announce",
          "udp://tracker.tiny-vps.com:6969/announce"
        ]
      }, (torrent) => {
        // Remove from adding map
        addingTorrents.delete(infoHash);
        resolve(torrent);
      });

      // Handle errors on the torrent
      torrent.on('error', (err) => {
        console.error(`Torrent error for ${infoHash}:`, err.message);
        addingTorrents.delete(infoHash);
        reject(err);
      });

    } catch (error) {
      // Handle synchronous errors (like duplicate torrent)
      console.error(`Error adding torrent ${infoHash}:`, error.message);
      addingTorrents.delete(infoHash);
      
      // If it's a duplicate torrent error, try to get the existing one
      if (error.message && error.message.includes('duplicate torrent')) {
        const existingTorrent = client.get(infoHash);
        if (existingTorrent) {
          resolve(existingTorrent);
        } else {
          reject(error);
        }
      } else {
        reject(error);
      }
    }
  });

  // Store the promise
  addingTorrents.set(infoHash, addPromise);

  try {
    const torrent = await addPromise;
    
    // Wait a moment for files to be ready if they're not
    if (!torrent.files || torrent.files.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Wait for torrent to have some data before returning stream URL
    console.log(`Waiting for torrent ${torrent.infoHash} to download initial data...`);
    const isReady = await waitForTorrentReady(torrent, 0.01, 15000); // Wait for 1% or 15 seconds
    
    if (!isReady) {
      console.log(`Warning: Torrent ${torrent.infoHash} not ready yet, but returning stream URL anyway`);
    }

    const videoFile = findVideoFile(torrent);
    
    if (!videoFile) {
      return res.status(404).json({ 
        error: "No video file found",
        files: torrent.files.map(f => f.name)
      });
    }

    // Select video file for sequential download (important for streaming)
    videoFile.select();

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
      })),
      progress: torrent.progress || 0,
      downloadSpeed: torrent.downloadSpeed || 0,
      numPeers: torrent.numPeers || 0,
      ready: torrent.progress > 0.05 // Consider ready when 5% downloaded
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to add torrent" });
  }
});

// Simple GET endpoint for adding torrents (easier for testing)
app.get("/add", async (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet || !magnet.startsWith("magnet:?xt=urn:btih:")) {
    return res.status(400).json({ error: "Invalid magnet link. Use ?magnet=..." });
  }

  // Extract info hash from magnet link
  const infoHashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/);
  const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;
  
  if (!infoHash) {
    return res.status(400).json({ error: "Invalid magnet link - no info hash found" });
  }

  // Check if torrent already exists and is ready
  let existingTorrent = client.get(infoHash);
  
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

  // Check if we're already adding this torrent
  const existingPromise = addingTorrents.get(infoHash);
  if (existingPromise) {
    try {
      const torrent = await existingPromise;
      const videoFile = findVideoFile(torrent);
      const fileIndex = videoFile ? torrent.files.indexOf(videoFile) : 0;
      const file = videoFile || torrent.files[0];

      if (file) {
        const streamUrl = `http://localhost:${PORT}/stream/${torrent.infoHash}/${fileIndex}`;
        return res.json({
          success: true,
          infoHash: torrent.infoHash,
          name: torrent.name,
          file: {
            index: fileIndex,
            name: file.name,
            size: file.length,
            streamUrl: streamUrl
          },
          progress: torrent.progress || 0,
          downloadSpeed: torrent.downloadSpeed || 0,
          numPeers: torrent.numPeers || 0,
          ready: torrent.progress > 0.05
        });
      } else {
        return res.status(404).json({ error: "No files found in torrent" });
      }
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Create a promise for this torrent addition
  const addPromise = new Promise((resolve, reject) => {
    try {
      // Add new torrent with callback
      const torrent = client.add(magnet, {
        announce: [
          "udp://tracker.opentrackr.org:1337/announce",
          "udp://tracker.openbittorrent.com:6969/announce",
          "udp://tracker.torrent.eu.org:451/announce",
          "udp://exodus.desync.com:6969/announce",
          "udp://tracker.tiny-vps.com:6969/announce"
        ]
      }, (torrent) => {
        // Remove from adding map
        addingTorrents.delete(infoHash);
        resolve(torrent);
      });

      // Handle errors on the torrent
      torrent.on('error', (err) => {
        console.error(`Torrent error for ${infoHash}:`, err.message);
        addingTorrents.delete(infoHash);
        reject(err);
      });

    } catch (error) {
      // Handle synchronous errors (like duplicate torrent)
      console.error(`Error adding torrent ${infoHash}:`, error.message);
      addingTorrents.delete(infoHash);
      
      // If it's a duplicate torrent error, try to get the existing one
      if (error.message && error.message.includes('duplicate torrent')) {
        const existingTorrent = client.get(infoHash);
        if (existingTorrent) {
          resolve(existingTorrent);
        } else {
          reject(error);
        }
      } else {
        reject(error);
      }
    }
  });

  // Store the promise
  addingTorrents.set(infoHash, addPromise);

  try {
    const torrent = await addPromise;
    
    // Wait a moment for files to be ready if they're not
    if (!torrent.files || torrent.files.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Wait for torrent to have some data before returning stream URL
    console.log(`Waiting for torrent ${torrent.infoHash} to download initial data...`);
    const isReady = await waitForTorrentReady(torrent, 0.01, 15000); // Wait for 1% or 15 seconds
    
    if (!isReady) {
      console.log(`Warning: Torrent ${torrent.infoHash} not ready yet, but returning stream URL anyway`);
    }

    const videoFile = findVideoFile(torrent);
    const fileIndex = videoFile ? torrent.files.indexOf(videoFile) : 0;
    const file = videoFile || torrent.files[0];

    if (file) {
      // Select file for sequential download (important for streaming)
      file.select();
      
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
    res.status(500).json({ error: error.message || "Failed to add torrent" });
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
    ready: torrent.ready || false,
    files: torrent.files ? torrent.files.length : 0
  }));

  res.json({ torrents });
});

// Progress endpoint for a specific torrent
app.get("/progress/:infoHash", (req, res) => {
  const { infoHash } = req.params;
  const torrent = client.get(infoHash);
  
  if (!torrent) {
    return res.status(404).json({ error: "Torrent not found" });
  }
  
  res.json({
    infoHash: torrent.infoHash,
    name: torrent.name || 'Unknown',
    progress: torrent.progress || 0,
    progressPercent: Math.round((torrent.progress || 0) * 100),
    downloadSpeed: torrent.downloadSpeed || 0,
    uploadSpeed: torrent.uploadSpeed || 0,
    downloaded: torrent.downloaded || 0,
    uploaded: torrent.uploaded || 0,
    length: torrent.length || 0,
    timeRemaining: torrent.timeRemaining || null,
    peers: torrent.numPeers || 0,
    ready: torrent.progress > 0.02, // Ready when 2% downloaded
    files: torrent.files ? torrent.files.map((file, index) => ({
      index,
      name: file.name,
      size: file.length,
      downloaded: file.downloaded || 0,
      progress: file.progress || 0
    })) : []
  });
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
      "GET /progress/:hash": "Get download progress for a torrent",
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