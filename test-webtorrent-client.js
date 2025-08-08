#!/usr/bin/env node

// Test client for WebTorrent streaming server
// This demonstrates how to use Torrentio API to get magnet links
// and then stream them using the WebTorrent server

const http = require('http');

const TORRENTIO_URL = 'http://localhost:7000';
const WEBTORRENT_URL = 'http://localhost:3000';

// Example torrent hash
const testInfoHash = '08ada5a7a6183aae1e09d831df6748d566095a10';

// Helper function to make HTTP requests
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (options.body) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode < 300, data: parsed, status: res.statusCode });
        } catch (e) {
          resolve({ ok: res.statusCode < 300, data: data, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function main() {
  console.log('🧪 WebTorrent + Torrentio Integration Test\n');
  
  try {
    // Step 1: Get magnet link from Torrentio
    console.log('1️⃣ Getting magnet link from Torrentio API...');
    console.log(`   Info Hash: ${testInfoHash}`);
    
    const magnetResponse = await httpRequest(`${TORRENTIO_URL}/api/torrent/${testInfoHash}/magnet`);
    
    if (!magnetResponse.ok) {
      throw new Error(`Failed to get magnet link: ${magnetResponse.data.error || 'Unknown error'}`);
    }
    
    const magnetLink = magnetResponse.data.magnetLink;
    console.log('✅ Got magnet link!');
    console.log(`   Magnet: ${magnetLink.substring(0, 80)}...\n`);
    
    // Step 2: Add torrent to WebTorrent server
    console.log('2️⃣ Adding torrent to WebTorrent server...');
    
    const addResponse = await httpRequest(`${WEBTORRENT_URL}/add`, {
      method: 'POST',
      body: JSON.stringify({ magnet: magnetLink })
    });
    
    if (!addResponse.ok) {
      throw new Error(`Failed to add torrent: ${addResponse.data.error || 'Unknown error'}`);
    }
    
    console.log('✅ Torrent added successfully!');
    console.log(`   Name: ${addResponse.data.name}`);
    console.log(`   Info Hash: ${addResponse.data.infoHash}`);
    
    if (addResponse.data.videoFile) {
      console.log(`   Video File: ${addResponse.data.videoFile.name}`);
      console.log(`   Size: ${(addResponse.data.videoFile.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Stream URL: ${addResponse.data.videoFile.streamUrl}\n`);
    } else {
      console.log('   ⚠️  No video file found in torrent\n');
    }
    
    // Step 3: Get torrent stats
    console.log('3️⃣ Getting torrent info...');
    
    const infoResponse = await httpRequest(`${WEBTORRENT_URL}/info?magnet=${encodeURIComponent(magnetLink)}`);
    
    if (infoResponse.ok) {
      console.log('✅ Torrent info:');
      console.log(`   Peers: ${infoResponse.data.peers}`);
      console.log(`   Progress: ${(infoResponse.data.progress * 100).toFixed(2)}%`);
      console.log(`   Download Speed: ${(infoResponse.data.downloadSpeed / 1024).toFixed(2)} KB/s`);
      console.log(`   Files: ${infoResponse.data.files.length}\n`);
    }
    
    // Step 4: Show how to use the streaming URL
    console.log('4️⃣ How to use the streaming URL:\n');
    
    if (addResponse.data.videoFile) {
      console.log('📺 Option 1: Direct playback in VLC or any media player:');
      console.log(`   Open VLC → Media → Open Network Stream`);
      console.log(`   Enter: ${addResponse.data.videoFile.streamUrl}\n`);
      
      console.log('🌐 Option 2: Embed in HTML video player:');
      console.log('   ```html');
      console.log(`   <video controls src="${addResponse.data.videoFile.streamUrl}"></video>`);
      console.log('   ```\n');
      
      console.log('📱 Option 3: Use with video.js or other web players:');
      console.log('   The server supports range requests for smooth streaming\n');
    }
    
    // Step 5: List all files
    if (addResponse.data.allFiles && addResponse.data.allFiles.length > 1) {
      console.log('📁 All files in torrent:');
      addResponse.data.allFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`      Stream: ${file.streamUrl}`);
      });
      console.log();
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('✨ Test complete!\n');
  console.log('💡 Tips:');
  console.log('   - The WebTorrent server will start downloading the torrent');
  console.log('   - You can start streaming even before the download completes');
  console.log('   - Multiple clients can stream the same torrent simultaneously');
  console.log('   - Use /torrents endpoint to see all active torrents');
  console.log('   - Use /stats endpoint to monitor server performance');
}

// Check if servers are running
Promise.all([
  httpRequest(`${TORRENTIO_URL}/`).catch(() => ({ ok: false })),
  httpRequest(`${WEBTORRENT_URL}/stats`).catch(() => ({ ok: false }))
]).then(([torrentioCheck, webtorrentCheck]) => {
  if (!torrentioCheck.ok) {
    console.error('⚠️  Torrentio server is not running on port 7000!');
    console.error('   Start it with: cd addon && npm start\n');
  }
  
  if (!webtorrentCheck.ok) {
    console.error('⚠️  WebTorrent server is not running on port 3000!');
    console.error('   Start it with: npm install && npm start\n');
  }
  
  if (torrentioCheck.ok && webtorrentCheck.ok) {
    main().catch(console.error);
  }
}); 