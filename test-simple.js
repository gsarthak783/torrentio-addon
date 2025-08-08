// Simple test for WebTorrent server
import http from 'http';

const testMagnet = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10';

console.log('Testing WebTorrent Server...\n');

// Test adding a torrent
const url = `http://localhost:3000/add?magnet=${encodeURIComponent(testMagnet)}`;

http.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('✅ Success!');
      console.log('Torrent:', result.name || 'Loading...');
      console.log('Info Hash:', result.infoHash);
      if (result.file) {
        console.log('File:', result.file.name);
        console.log('Stream URL:', result.file.streamUrl);
        console.log('\n🎬 You can now play this URL in VLC or any media player!');
      }
    } catch (e) {
      console.log('Response:', data);
    }
  });
}).on('error', (err) => {
  console.error('❌ Error:', err.message);
  console.log('Make sure the WebTorrent server is running on port 3000');
}); 