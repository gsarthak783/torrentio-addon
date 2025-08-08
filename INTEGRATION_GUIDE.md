# Torrent Streaming Integration Guide

## 🎯 Quick Start - The Basic Pattern

To stream a video from a torrent info hash, you need 2 simple steps:

```javascript
// Step 1: Convert info hash to magnet link
const magnetResponse = await fetch(`http://localhost:7000/api/torrent/${infoHash}/magnet`);
const { magnetLink } = await magnetResponse.json();

// Step 2: Get streaming URL from WebTorrent
const streamResponse = await fetch('http://localhost:3000/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ magnet: magnetLink })
});
const { videoFile } = await streamResponse.json();

// Step 3: Use the streaming URL
const streamUrl = videoFile.streamUrl;  // http://localhost:3000/stream/HASH/INDEX
```

## 📱 Integration Examples

### 1. Simple HTML List (5 Videos)

```html
<!-- Your 5 videos -->
<div id="video1" onclick="playVideo('08ada5a7a6183aae1e09d831df6748d566095a10')">Video 1</div>
<div id="video2" onclick="playVideo('dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c')">Video 2</div>
<!-- ... more videos ... -->

<video id="player" controls style="width: 100%"></video>

<script>
async function playVideo(infoHash) {
    // Get magnet
    const { magnetLink } = await (await fetch(`http://localhost:7000/api/torrent/${infoHash}/magnet`)).json();
    
    // Get stream URL
    const { videoFile } = await (await fetch('http://localhost:3000/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: magnetLink })
    })).json();
    
    // Play video
    document.getElementById('player').src = videoFile.streamUrl;
}
</script>
```

### 2. React Component

```jsx
function VideoList() {
    const [currentVideo, setCurrentVideo] = useState(null);
    
    const videos = [
        { id: 1, title: "Video 1", infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10" },
        { id: 2, title: "Video 2", infoHash: "dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c" },
        // ... more videos
    ];
    
    const playVideo = async (infoHash) => {
        // Get magnet
        const magnetRes = await fetch(`http://localhost:7000/api/torrent/${infoHash}/magnet`);
        const { magnetLink } = await magnetRes.json();
        
        // Get stream URL
        const streamRes = await fetch('http://localhost:3000/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet: magnetLink })
        });
        const { videoFile } = await streamRes.json();
        
        setCurrentVideo(videoFile.streamUrl);
    };
    
    return (
        <div>
            {videos.map(video => (
                <button key={video.id} onClick={() => playVideo(video.infoHash)}>
                    {video.title}
                </button>
            ))}
            
            {currentVideo && <video src={currentVideo} controls />}
        </div>
    );
}
```

### 3. Mobile App (React Native)

```jsx
import Video from 'react-native-video';

function VideoScreen({ route }) {
    const { infoHash } = route.params;
    const [streamUrl, setStreamUrl] = useState(null);
    
    useEffect(() => {
        loadVideo();
    }, []);
    
    const loadVideo = async () => {
        // Get magnet
        const magnetRes = await fetch(`http://YOUR_SERVER_IP:7000/api/torrent/${infoHash}/magnet`);
        const { magnetLink } = await magnetRes.json();
        
        // Get stream URL
        const streamRes = await fetch('http://YOUR_SERVER_IP:3000/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet: magnetLink })
        });
        const { videoFile } = await streamRes.json();
        
        setStreamUrl(videoFile.streamUrl);
    };
    
    return streamUrl ? (
        <Video source={{ uri: streamUrl }} style={styles.video} controls />
    ) : (
        <Text>Loading...</Text>
    );
}
```

## 🎮 Player Options

### HTML5 Video (Simplest)
```javascript
const video = document.createElement('video');
video.src = streamUrl;
video.controls = true;
document.body.appendChild(video);
```

### Video.js (Advanced Controls)
```javascript
const player = videojs('my-video', {
    sources: [{ src: streamUrl, type: 'video/mp4' }],
    controls: true,
    autoplay: false
});
```

### VLC (External Player)
```javascript
// Option 1: Direct link
window.open(streamUrl);

// Option 2: VLC protocol
window.open(`vlc://${streamUrl}`);

// Option 3: Copy to clipboard
navigator.clipboard.writeText(streamUrl);
alert('Stream URL copied! Paste in VLC');
```

## 🔧 Advanced Features

### 1. Preload Multiple Videos
```javascript
async function preloadVideos(infoHashes) {
    const promises = infoHashes.map(async (hash) => {
        const { magnetLink } = await (await fetch(`/api/torrent/${hash}/magnet`)).json();
        return fetch('/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet: magnetLink })
        });
    });
    
    return Promise.all(promises);
}
```

### 2. Show Download Progress
```javascript
async function getProgress(infoHash) {
    const res = await fetch('http://localhost:3000/torrents');
    const { torrents } = await res.json();
    const torrent = torrents.find(t => t.infoHash === infoHash);
    return torrent ? Math.round(torrent.progress * 100) : 0;
}

// Update progress every second
setInterval(async () => {
    const progress = await getProgress(infoHash);
    document.getElementById('progress').textContent = `${progress}%`;
}, 1000);
```

### 3. Handle Multiple Files (TV Shows)
```javascript
const { allFiles } = await streamResponse.json();

// Display all episodes
allFiles.forEach((file, index) => {
    if (file.name.endsWith('.mp4')) {
        console.log(`Episode ${index + 1}: ${file.streamUrl}`);
    }
});
```

## 📋 Complete Working Example

Save this as `my-video-app.html` and open in browser:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Video App</title>
    <style>
        .video-button {
            display: block;
            margin: 10px;
            padding: 10px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
        video { width: 100%; max-width: 800px; }
    </style>
</head>
<body>
    <h1>My Videos</h1>
    
    <button class="video-button" onclick="play('08ada5a7a6183aae1e09d831df6748d566095a10')">
        Play Sintel
    </button>
    <button class="video-button" onclick="play('dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c')">
        Play Big Buck Bunny
    </button>
    
    <video id="player" controls style="display:none"></video>
    
    <script>
        async function play(infoHash) {
            const player = document.getElementById('player');
            player.style.display = 'block';
            
            // Get stream URL
            const magnet = await fetch(`http://localhost:7000/api/torrent/${infoHash}/magnet`)
                .then(r => r.json()).then(d => d.magnetLink);
                
            const stream = await fetch('http://localhost:3000/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet })
            }).then(r => r.json());
            
            // Play
            player.src = stream.videoFile.streamUrl;
            player.play();
        }
    </script>
</body>
</html>
```

## 🚀 Tips for Production

1. **Cache Stream URLs**: Once you get a stream URL, it remains valid until the torrent is removed
2. **Error Handling**: Always check if `videoFile` exists in the response
3. **CORS**: For web apps, ensure CORS is enabled on both servers
4. **Mobile**: Use your computer's IP instead of localhost
5. **Performance**: Preload popular videos before users click play

## 🎯 That's It!

You now have everything you need to integrate torrent streaming into your app. The pattern is always the same:

1. Info Hash → Magnet Link (Torrentio API)
2. Magnet Link → Stream URL (WebTorrent API)  
3. Stream URL → Video Player

Happy streaming! 🎬 