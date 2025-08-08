import WebTorrent from "webtorrent";
import express from "express";
import cors from "cors";

const app = express();
const client = new WebTorrent();

app.use(cors());
app.use(express.json());

// Simple add endpoint
app.get("/add", (req, res) => {
  const magnet = decodeURIComponent(req.query.magnet || "").trim();
  
  if (!magnet) {
    return res.status(400).json({ error: "Missing magnet parameter" });
  }

  console.log("Adding torrent:", magnet);

  // Check if already exists
  const existing = client.get(magnet);
  if (existing) {
    console.log("Torrent already exists");
    return res.json({
      success: true,
      infoHash: existing.infoHash,
      name: existing.name || "Loading...",
      files: existing.files.length
    });
  }

  // Add new torrent
  client.add(magnet, (torrent) => {
    console.log("Torrent added:", torrent.infoHash);
    
    // Find video file
    const videoFile = torrent.files.find(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext);
    });

    const file = videoFile || torrent.files[0];
    const fileIndex = torrent.files.indexOf(file);

    res.json({
      success: true,
      infoHash: torrent.infoHash,
      name: torrent.name,
      files: torrent.files.length,
      stream: {
        fileName: file.name,
        fileSize: file.length,
        fileIndex: fileIndex,
        url: `http://localhost:3000/stream/${torrent.infoHash}/${fileIndex}`
      }
    });
  });
});

// Stream endpoint
app.get("/stream/:infoHash/:fileIndex", (req, res) => {
  const { infoHash, fileIndex } = req.params;
  const torrent = client.get(infoHash);
  
  if (!torrent) {
    return res.status(404).send("Torrent not found");
  }

  const file = torrent.files[parseInt(fileIndex)];
  
  if (!file) {
    return res.status(404).send("File not found");
  }

  console.log(`Streaming: ${file.name}`);

  // Set headers
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', file.length);
  res.setHeader('Accept-Ranges', 'bytes');

  // Create read stream and pipe to response
  const stream = file.createReadStream();
  stream.pipe(res);
});

// List torrents
app.get("/list", (req, res) => {
  const torrents = client.torrents.map(t => ({
    infoHash: t.infoHash,
    name: t.name || "Unknown",
    progress: Math.round(t.progress * 100) + "%",
    peers: t.numPeers || 0
  }));
  
  res.json({ torrents });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "WebTorrent Simple Server",
    endpoints: [
      "GET /add?magnet=... - Add torrent",
      "GET /stream/:hash/:index - Stream file",
      "GET /list - List torrents"
    ]
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🎬 Simple WebTorrent Server running at http://localhost:${PORT}`);
  console.log(`
Test with:
  http://localhost:${PORT}/add?magnet=magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10
  `);
}); 