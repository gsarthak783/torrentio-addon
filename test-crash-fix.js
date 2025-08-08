// Test script to verify the WebTorrent server handles duplicate torrents gracefully

const testUrl = 'http://localhost:3000';
const testMagnet = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel';

console.log('Testing WebTorrent Server Crash Fix...\n');

// Function to add torrent
async function addTorrent() {
    try {
        const response = await fetch(`${testUrl}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet: testMagnet })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Success:', data.infoHash);
        } else {
            console.log('❌ Error:', data.error);
        }
        
        return response.ok;
    } catch (error) {
        console.error('❌ Request failed:', error.message);
        return false;
    }
}

// Test 1: Add torrent multiple times in sequence
async function testSequential() {
    console.log('Test 1: Sequential duplicate requests');
    console.log('-------------------------------------');
    
    for (let i = 1; i <= 5; i++) {
        console.log(`Request ${i}:`);
        await addTorrent();
    }
    
    console.log('\n');
}

// Test 2: Add torrent multiple times in parallel
async function testParallel() {
    console.log('Test 2: Parallel duplicate requests');
    console.log('-----------------------------------');
    
    const promises = [];
    for (let i = 1; i <= 5; i++) {
        promises.push(addTorrent().then(success => {
            console.log(`Request ${i}: ${success ? '✅' : '❌'}`);
        }));
    }
    
    await Promise.all(promises);
    console.log('\n');
}

// Test 3: Rapid fire requests
async function testRapidFire() {
    console.log('Test 3: Rapid fire requests');
    console.log('---------------------------');
    
    const promises = [];
    for (let i = 1; i <= 10; i++) {
        // Don't wait between requests
        promises.push(addTorrent());
    }
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r).length;
    
    console.log(`✅ Successful: ${successCount}/10`);
    console.log(`❌ Failed: ${10 - successCount}/10`);
    console.log('\n');
}

// Run all tests
async function runTests() {
    await testSequential();
    await testParallel();
    await testRapidFire();
    
    // Check if server is still running
    console.log('Checking server status...');
    try {
        const response = await fetch(`${testUrl}/stats`);
        if (response.ok) {
            console.log('✅ Server is still running!');
            const stats = await response.json();
            console.log(`   Active torrents: ${stats.activeTorrents}`);
        } else {
            console.log('❌ Server is not responding properly');
        }
    } catch (error) {
        console.log('❌ Server crashed or is not responding');
    }
}

// Run the tests
runTests().catch(console.error); 