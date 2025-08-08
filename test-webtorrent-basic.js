// Basic WebTorrent test
import WebTorrent from 'webtorrent';

console.log('Testing basic WebTorrent functionality...\n');

const client = new WebTorrent();
const magnetURI = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10';

console.log('WebTorrent client created:', !!client);
console.log('Adding magnet link...');

try {
  const torrent = client.add(magnetURI, function (torrent) {
    console.log('\n✅ Torrent added successfully!');
    console.log('Info hash:', torrent.infoHash);
    console.log('Name:', torrent.name);
    console.log('Files:', torrent.files.length);
    
    // List files
    torrent.files.forEach((file, index) => {
      console.log(`  ${index}: ${file.name} (${file.length} bytes)`);
    });
    
    // Clean up
    setTimeout(() => {
      torrent.destroy(() => {
        console.log('\nTorrent destroyed');
        process.exit(0);
      });
    }, 5000);
  });
  
  console.log('Torrent object created:', !!torrent);
  console.log('Waiting for metadata...');
  
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} 