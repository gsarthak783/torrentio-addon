# WebTorrent Streaming Server + Torrentio Integration

This project combines the Torrentio addon API with a WebTorrent streaming server to enable streaming of torrent content directly in your browser or media player.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install WebTorrent server dependencies
npm install

# Install Torrentio addon dependencies (if not already done)
cd addon
npm install
cd ..
```

### 2. Start Both Servers

Open two terminal windows:

**Terminal 1 - Torrentio Server (Port 7000):**
```bash
cd addon
npm start
```

**Terminal 2 - WebTorrent Server (Port 3000):**
```bash
npm start
```

### 3. Test the Integration

```bash
node test-webtorrent-client.js
```

Or open `webtorrent-demo.html` in your browser for a visual interface.

## 📁 Files Overview

- **`webtorrent-server.js`** - The main WebTorrent streaming server
- **`test-webtorrent-client.js`** - CLI test client showing integration
- **`webtorrent-demo.html`** - Web interface for streaming torrents
- **`package.json`** - Dependencies for the WebTorrent server

## 🔧 API Endpoints

### WebTorrent Server (Port 3000)

#### POST /add
Add a torrent and get streaming URLs
```json
// Request
{
  "magnet": "magnet:?xt=urn:btih:..."
}

// Response
{
  "infoHash": "...",
  "name": "Torrent Name",
  "videoFile": {
    "index": 0,
    "name": "video.mp4",
    "size": 1073741824,
    "streamUrl": "http://localhost:3000/stream/hash/0"
  },
  "allFiles": [...]
}
```

#### GET /stream/:infoHash/:fileIndex
Stream a specific file (supports range requests)

#### GET /info?magnet=...
Get torrent information without streaming

#### GET /torrents
List all active torrents

#### GET /stats
Get server statistics

#### DELETE /remove/:infoHash
Remove a torrent

### Torrentio API (Port 7000)

#### GET /api/torrent/:infoHash/magnet
Convert info hash to magnet link

#### GET /api/demo/torrent/:infoHash/streams
Get streaming URLs (demo endpoint, no DB required)

## 🎬 How It Works

1. **Get Magnet Link**: Use Torrentio API to convert torrent hash to magnet link
2. **Add to WebTorrent**: Send magnet link to WebTorrent server
3. **Stream Content**: WebTorrent provides HTTP streaming URLs
4. **Play Anywhere**: Use the URLs in VLC, browser, or any media player

## 💡 Usage Examples

### Stream in VLC
1. Get streaming URL from the API
2. Open VLC → Media → Open Network Stream
3. Enter the streaming URL

### Embed in HTML
```html
<video controls src="http://localhost:3000/stream/HASH/0"></video>
```

### Use with Video.js
```javascript
const player = videojs('my-video');
player.src({
  src: 'http://localhost:3000/stream/HASH/0',
  type: 'video/mp4'
});
```

## 🔍 Key Features

- ✅ **No Database Required**: Works with any magnet link
- ✅ **Range Request Support**: Smooth video seeking
- ✅ **Multiple File Support**: Stream any file from multi-file torrents
- ✅ **Real-time Stats**: Monitor download/upload speeds
- ✅ **Concurrent Streams**: Multiple clients can stream simultaneously
- ✅ **Progressive Download**: Start streaming before download completes

## ⚠️ Important Notes

1. **Legal Content Only**: Only stream content you have the right to access
2. **Bandwidth Usage**: Streaming torrents uses upload bandwidth
3. **Storage**: Torrents are temporarily stored while streaming
4. **Peers**: More peers = faster streaming

## 🛠️ Troubleshooting

### "Cannot connect to server"
- Ensure both servers are running
- Check firewall settings
- Verify ports 3000 and 7000 are available

### "No video file found"
- The torrent might not contain video files
- Check supported formats: mp4, mkv, avi, mov, webm

### Slow streaming
- Wait for more peers to connect
- Check your internet connection
- Try torrents with more seeders

## 🔧 Configuration

### Change Ports
```javascript
// In webtorrent-server.js
const PORT = process.env.PORT || 3000;

// In addon/index.js
app.listen(process.env.PORT || 7000, ...);
```

### Add More Trackers
Edit the tracker list in `webtorrent-server.js`:
```javascript
announce: [
  "udp://tracker.opentrackr.org:1337/announce",
  // Add more trackers here
]
```

## 📝 Development

### Run in Development Mode
```bash
npm run dev  # Uses nodemon for auto-restart
```

### Extend the API
The server is built with Express.js, making it easy to add new endpoints.

## 🤝 Integration with Torrentio

This server complements Torrentio by:
1. Converting Torrentio's torrent data to streamable URLs
2. Providing a bridge between torrent protocol and HTTP
3. Enabling streaming in any HTTP-compatible player

## 📄 License

This project is for educational purposes. Respect copyright laws and only stream content you have permission to access. 