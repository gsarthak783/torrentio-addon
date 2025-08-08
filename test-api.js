#!/usr/bin/env node

// Test script for the new Torrentio API endpoints
// Usage: node test-api.js [infoHash] [debridApiKey]

import http from 'http';
import https from 'https';

const args = process.argv.slice(2);
const infoHash = args[0] || '08ada5a7a6183aae1e09d831df6748d566095a10'; // Example torrent hash
const debridApiKey = args[1]; // Optional debrid API key
const baseUrl = 'http://localhost:7000';

console.log('🧪 Testing Torrentio API Endpoints\n');

// Helper function to make HTTP requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, data: parsed, status: res.statusCode });
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Test 1: Generate magnet link
async function testMagnetEndpoint() {
  console.log('📍 Test 1: Generate magnet link from info hash');
  console.log(`  Info Hash: ${infoHash}`);
  
  try {
    const response = await makeRequest(`${baseUrl}/api/torrent/${infoHash}/magnet`);
    
    if (response.ok) {
      console.log('✅ Success!');
      console.log(`  Magnet Link: ${response.data.magnetLink.substring(0, 100)}...`);
      console.log(`  Trackers: ${response.data.trackers.length} trackers included\n`);
    } else {
      console.log('❌ Error:', response.data.error, '\n');
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    console.log('   Make sure the Torrentio server is running on port 7000\n');
  }
}

// Test 2: Get streaming URLs
async function testStreamsEndpoint() {
  console.log('📍 Test 2: Get streaming URLs from info hash');
  console.log(`  Info Hash: ${infoHash}`);
  console.log(`  Debrid Service: ${debridApiKey ? 'Configured' : 'Not configured'}`);
  
  try {
    const params = debridApiKey ? `?realdebrid=${debridApiKey}` : '';
    const response = await makeRequest(`${baseUrl}/api/torrent/${infoHash}/streams${params}`);
    
    if (response.ok) {
      console.log('✅ Success!');
      if (response.data.torrent) {
        console.log(`  Torrent: ${response.data.torrent.title}`);
        console.log(`  Size: ${formatBytes(response.data.torrent.size)}`);
        console.log(`  Seeders: ${response.data.torrent.seeders}`);
      }
      console.log(`  Streams found: ${response.data.streams.length}`);
      
      if (response.data.streams.length > 0) {
        console.log('\n  First 3 streams:');
        response.data.streams.slice(0, 3).forEach((stream, index) => {
          console.log(`\n  Stream ${index + 1}:`);
          console.log(`    Name: ${stream.name}`);
          console.log(`    URL: ${stream.url}`);
          if (stream.filename) {
            console.log(`    Filename: ${stream.filename}`);
          }
          if (stream.size) {
            console.log(`    Size: ${formatBytes(stream.size)}`);
          }
        });
      }
      console.log();
    } else {
      console.log('❌ Error:', response.data.error);
      if (response.data.error === 'Database not configured') {
        console.log('   This endpoint requires a PostgreSQL database to be configured.\n');
      }
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    console.log('   Make sure the Torrentio server is running on port 7000\n');
  }
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (!bytes) return 'Unknown';
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Main test runner
async function runTests() {
  console.log(`🔗 Testing against: ${baseUrl}\n`);
  
  // Give the server a moment to start if it was just launched
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test magnet endpoint
  await testMagnetEndpoint();
  
  // Test streams endpoint
  await testStreamsEndpoint();
  
  console.log('📋 Additional Notes:');
  console.log('  - The magnet endpoint works with any valid info hash');
  console.log('  - The streams endpoint requires the torrent to exist in the database');
  console.log('  - To use debrid services, pass your API key as the second argument');
  console.log('  - Example: node test-api.js <infohash> <your-realdebrid-api-key>');
  console.log('\n✨ Testing complete!');
}

// Check if server is running before tests
function checkServer() {
  return new Promise((resolve) => {
    http.get(`${baseUrl}/`, (res) => {
      resolve(true);
    }).on('error', () => {
      console.log('⚠️  The Torrentio server is not running!');
      console.log('   Please start it with: cd addon && npm start\n');
      resolve(false);
    });
  });
}

// Run the tests
checkServer().then(serverRunning => {
  if (serverRunning) {
    runTests().catch(console.error);
  } else {
    console.log('❌ Exiting: Server must be running to test the API endpoints.');
  }
}); 