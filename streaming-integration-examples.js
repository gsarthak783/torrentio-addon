// ============================================
// STREAMING API INTEGRATION EXAMPLES
// ============================================

// Configuration
const TORRENTIO_URL = 'http://localhost:7000';
const WEBTORRENT_URL = 'http://localhost:3000';

// ============================================
// 1. BASIC INTEGRATION PATTERN
// ============================================

class TorrentStreamer {
    constructor() {
        this.torrentioUrl = TORRENTIO_URL;
        this.webtorrentUrl = WEBTORRENT_URL;
    }

    // Get streaming URL from info hash
    async getStreamUrl(infoHash) {
        try {
            // Step 1: Get magnet link from Torrentio
            const magnetResponse = await fetch(`${this.torrentioUrl}/api/torrent/${infoHash}/magnet`);
            if (!magnetResponse.ok) throw new Error('Failed to get magnet link');
            
            const { magnetLink } = await magnetResponse.json();
            
            // Step 2: Add to WebTorrent
            const addResponse = await fetch(`${this.webtorrentUrl}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet: magnetLink })
            });
            
            if (!addResponse.ok) throw new Error('Failed to add torrent');
            
            const torrentData = await addResponse.json();
            
            // Return the stream URL
            if (torrentData.videoFile) {
                return {
                    success: true,
                    streamUrl: torrentData.videoFile.streamUrl,
                    fileName: torrentData.videoFile.name,
                    fileSize: torrentData.videoFile.size
                };
            } else {
                throw new Error('No video file found in torrent');
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// ============================================
// 2. REACT/REACT NATIVE EXAMPLE
// ============================================

// React Component
const VideoPlayer = ({ infoHash, title }) => {
    const [loading, setLoading] = React.useState(false);
    const [streamUrl, setStreamUrl] = React.useState(null);
    const [error, setError] = React.useState(null);
    
    const handlePlay = async () => {
        setLoading(true);
        setError(null);
        
        const streamer = new TorrentStreamer();
        const result = await streamer.getStreamUrl(infoHash);
        
        if (result.success) {
            setStreamUrl(result.streamUrl);
            // For React Native, use react-native-video
            // For React Web, use HTML5 video
        } else {
            setError(result.error);
        }
        
        setLoading(false);
    };
    
    return (
        <div>
            <h3>{title}</h3>
            {!streamUrl && (
                <button onClick={handlePlay} disabled={loading}>
                    {loading ? 'Loading...' : 'Play Video'}
                </button>
            )}
            {streamUrl && (
                <video src={streamUrl} controls style={{ width: '100%' }} />
            )}
            {error && <div style={{ color: 'red' }}>{error}</div>}
        </div>
    );
};

// React Native Version (using react-native-video)
const VideoPlayerNative = ({ infoHash, title }) => {
    const [streamUrl, setStreamUrl] = React.useState(null);
    
    React.useEffect(() => {
        loadStream();
    }, []);
    
    const loadStream = async () => {
        const streamer = new TorrentStreamer();
        const result = await streamer.getStreamUrl(infoHash);
        
        if (result.success) {
            setStreamUrl(result.streamUrl);
        }
    };
    
    return (
        <View>
            <Text>{title}</Text>
            {streamUrl && (
                <Video
                    source={{ uri: streamUrl }}
                    style={{ width: '100%', height: 200 }}
                    controls={true}
                />
            )}
        </View>
    );
};

// ============================================
// 3. VUE.JS EXAMPLE
// ============================================

const VueVideoPlayer = {
    template: `
        <div class="video-player">
            <h3>{{ title }}</h3>
            <button v-if="!streamUrl" @click="playVideo" :disabled="loading">
                {{ loading ? 'Loading...' : 'Play Video' }}
            </button>
            <video v-if="streamUrl" :src="streamUrl" controls style="width: 100%"></video>
            <div v-if="error" class="error">{{ error }}</div>
        </div>
    `,
    props: ['infoHash', 'title'],
    data() {
        return {
            loading: false,
            streamUrl: null,
            error: null
        };
    },
    methods: {
        async playVideo() {
            this.loading = true;
            this.error = null;
            
            const streamer = new TorrentStreamer();
            const result = await streamer.getStreamUrl(this.infoHash);
            
            if (result.success) {
                this.streamUrl = result.streamUrl;
            } else {
                this.error = result.error;
            }
            
            this.loading = false;
        }
    }
};

// ============================================
// 4. ANDROID (KOTLIN) EXAMPLE
// ============================================

const androidExample = `
// Android Activity (Kotlin)
class VideoPlayerActivity : AppCompatActivity() {
    private lateinit var videoView: VideoView
    private val torrentioUrl = "http://10.0.2.2:7000"  // Use 10.0.2.2 for localhost
    private val webtorrentUrl = "http://10.0.2.2:3000"
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_video_player)
        
        videoView = findViewById(R.id.videoView)
        val infoHash = intent.getStringExtra("INFO_HASH") ?: return
        
        loadStream(infoHash)
    }
    
    private fun loadStream(infoHash: String) {
        lifecycleScope.launch {
            try {
                // Get magnet link
                val magnetResponse = withContext(Dispatchers.IO) {
                    URL("$torrentioUrl/api/torrent/$infoHash/magnet").readText()
                }
                val magnetData = JSONObject(magnetResponse)
                val magnetLink = magnetData.getString("magnetLink")
                
                // Add to WebTorrent
                val client = OkHttpClient()
                val body = RequestBody.create(
                    MediaType.parse("application/json"),
                    JSONObject().put("magnet", magnetLink).toString()
                )
                
                val request = Request.Builder()
                    .url("$webtorrentUrl/add")
                    .post(body)
                    .build()
                
                val response = client.newCall(request).execute()
                val torrentData = JSONObject(response.body()!!.string())
                
                // Play video
                val streamUrl = torrentData
                    .getJSONObject("videoFile")
                    .getString("streamUrl")
                
                runOnUiThread {
                    videoView.setVideoURI(Uri.parse(streamUrl))
                    videoView.start()
                }
                
            } catch (e: Exception) {
                // Handle error
            }
        }
    }
}
`;

// ============================================
// 5. iOS (SWIFT) EXAMPLE
// ============================================

const iosExample = `
// iOS ViewController (Swift)
import UIKit
import AVKit

class VideoPlayerViewController: UIViewController {
    let torrentioUrl = "http://localhost:7000"
    let webtorrentUrl = "http://localhost:3000"
    
    func playVideo(infoHash: String) {
        Task {
            do {
                // Get magnet link
                let magnetURL = URL(string: "\\(torrentioUrl)/api/torrent/\\(infoHash)/magnet")!
                let (magnetData, _) = try await URLSession.shared.data(from: magnetURL)
                let magnetJSON = try JSONDecoder().decode(MagnetResponse.self, from: magnetData)
                
                // Add to WebTorrent
                let addURL = URL(string: "\\(webtorrentUrl)/add")!
                var request = URLRequest(url: addURL)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                
                let body = ["magnet": magnetJSON.magnetLink]
                request.httpBody = try JSONEncoder().encode(body)
                
                let (torrentData, _) = try await URLSession.shared.data(for: request)
                let torrentResponse = try JSONDecoder().decode(TorrentResponse.self, from: torrentData)
                
                // Play video
                if let streamUrl = torrentResponse.videoFile?.streamUrl {
                    let player = AVPlayer(url: URL(string: streamUrl)!)
                    let playerVC = AVPlayerViewController()
                    playerVC.player = player
                    
                    present(playerVC, animated: true) {
                        player.play()
                    }
                }
                
            } catch {
                // Handle error
            }
        }
    }
}
`;

// ============================================
// 6. SIMPLE HTML INTEGRATION
// ============================================

const simpleHtmlExample = `
<!DOCTYPE html>
<html>
<head>
    <title>Simple Video Player</title>
</head>
<body>
    <div id="videos"></div>
    
    <script>
        const videos = [
            { title: "Video 1", infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10" },
            { title: "Video 2", infoHash: "dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c" },
            // ... more videos
        ];
        
        async function playVideo(infoHash) {
            // Get magnet
            const magnetRes = await fetch(\`http://localhost:7000/api/torrent/\${infoHash}/magnet\`);
            const { magnetLink } = await magnetRes.json();
            
            // Add to WebTorrent
            const addRes = await fetch('http://localhost:3000/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet: magnetLink })
            });
            
            const data = await addRes.json();
            
            // Open in new window or embed
            if (data.videoFile) {
                window.open(data.videoFile.streamUrl, '_blank');
                // Or embed: document.getElementById('player').src = data.videoFile.streamUrl;
            }
        }
        
        // Render buttons
        videos.forEach(video => {
            const btn = document.createElement('button');
            btn.textContent = video.title;
            btn.onclick = () => playVideo(video.infoHash);
            document.getElementById('videos').appendChild(btn);
        });
    </script>
</body>
</html>
`;

// ============================================
// 7. PLAYER OPTIONS
// ============================================

const playerOptions = {
    // Option 1: Native HTML5 Video
    html5: {
        embed: (streamUrl) => {
            const video = document.createElement('video');
            video.src = streamUrl;
            video.controls = true;
            video.style.width = '100%';
            return video;
        }
    },
    
    // Option 2: Video.js
    videoJs: {
        embed: (streamUrl, elementId) => {
            const player = videojs(elementId, {
                sources: [{
                    src: streamUrl,
                    type: 'video/mp4'
                }],
                controls: true,
                autoplay: false,
                preload: 'auto'
            });
            return player;
        }
    },
    
    // Option 3: Plyr
    plyr: {
        embed: (streamUrl, elementId) => {
            const player = new Plyr(elementId, {
                sources: [{
                    src: streamUrl,
                    type: 'video/mp4'
                }]
            });
            return player;
        }
    },
    
    // Option 4: External Player (VLC, etc)
    external: {
        open: (streamUrl) => {
            // For desktop apps
            window.open(`vlc://${streamUrl}`);
            // Or provide copy button for URL
        }
    }
};

// ============================================
// 8. ADVANCED FEATURES
// ============================================

class AdvancedStreamer extends TorrentStreamer {
    // Pre-load torrents for faster playback
    async preloadTorrents(infoHashes) {
        const promises = infoHashes.map(hash => this.getStreamUrl(hash));
        return await Promise.all(promises);
    }
    
    // Get all files in torrent (for TV shows, etc)
    async getAllFiles(infoHash) {
        const result = await this.getStreamUrl(infoHash);
        
        if (result.success && result.allFiles) {
            return result.allFiles.map(file => ({
                name: file.name,
                streamUrl: file.streamUrl,
                size: file.size
            }));
        }
        
        return [];
    }
    
    // Monitor download progress
    async getProgress(infoHash) {
        const response = await fetch(`${this.webtorrentUrl}/torrents`);
        const { torrents } = await response.json();
        
        const torrent = torrents.find(t => t.infoHash === infoHash);
        return torrent ? torrent.progress : 0;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TorrentStreamer, AdvancedStreamer };
} 