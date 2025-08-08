# Torrentio API Documentation

## Torrent Streaming URL Endpoint

### Overview
This endpoint allows you to get streaming URLs from a torrent hash (info hash). It will return decoded streaming URLs that can be played or downloaded directly.

### Endpoint
```
GET /api/torrent/:infoHash/streams
```

### Parameters

#### Path Parameters
- `infoHash` (required): The torrent info hash (40 character hex string)

#### Query Parameters (for Debrid Services)
To get streaming URLs through debrid services, you need to provide the API key for your debrid service:

- `realdebrid`: Your RealDebrid API key
- `premiumize`: Your Premiumize API key
- `alldebrid`: Your AllDebrid API key
- `debridlink`: Your DebridLink API key
- `easydebrid`: Your EasyDebrid API key
- `offcloud`: Your Offcloud API key
- `torbox`: Your TorBox API key
- `putio`: Your Put.io API key

### Response Format

#### Success Response (200)
```json
{
  "torrent": {
    "infoHash": "string",
    "title": "string",
    "size": number,
    "seeders": number,
    "uploadDate": "string"
  },
  "streams": [
    {
      "name": "string",
      "title": "string",
      "url": "string",
      "fileIndex": number,
      "size": number,
      "filename": "string"
    }
  ]
}
```

#### Error Responses

**404 - Torrent Not Found**
```json
{
  "error": "Torrent not found"
}
```

**500 - Internal Server Error**
```json
{
  "error": "Internal server error"
}
```

### Examples

#### Example 1: Get streams without debrid service (returns magnet links)
```bash
curl http://localhost:7000/api/torrent/08ada5a7a6183aae1e09d831df6748d566095a10/streams
```

#### Example 2: Get streams with RealDebrid
```bash
curl "http://localhost:7000/api/torrent/08ada5a7a6183aae1e09d831df6748d566095a10/streams?realdebrid=YOUR_API_KEY"
```

#### Example 3: Get streams with multiple debrid services
```bash
curl "http://localhost:7000/api/torrent/08ada5a7a6183aae1e09d831df6748d566095a10/streams?realdebrid=YOUR_RD_KEY&premiumize=YOUR_PM_KEY"
```

### Notes

1. **Caching**: Responses are cached for 5 minutes to improve performance.

2. **Rate Limiting**: The endpoint is rate-limited to 300 requests per hour per IP address.

3. **Database Requirement**: This endpoint requires the torrent to exist in the Torrentio database. If you want to work with arbitrary torrents, you may need to implement additional functionality.

4. **Streaming URLs**: 
   - Without debrid service: Returns magnet links with trackers
   - With debrid service: Returns direct HTTP streaming URLs if the torrent is cached on the debrid service

5. **Multiple Files**: If the torrent contains multiple files, each file will be returned as a separate stream object with its own URL.

### Integration Example (JavaScript)

```javascript
async function getStreamingUrls(infoHash, debridApiKey) {
  const baseUrl = 'http://localhost:7000';
  const params = debridApiKey ? `?realdebrid=${debridApiKey}` : '';
  
  try {
    const response = await fetch(`${baseUrl}/api/torrent/${infoHash}/streams${params}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get streams');
    }
    
    const data = await response.json();
    return data.streams;
  } catch (error) {
    console.error('Error fetching streams:', error);
    throw error;
  }
}

// Usage
const infoHash = '08ada5a7a6183aae1e09d831df6748d566095a10';
const streams = await getStreamingUrls(infoHash, 'YOUR_REALDEBRID_API_KEY');
console.log(streams);
```

---

## Magnet Link Generation Endpoint

### Overview
This endpoint generates a magnet link from any torrent hash without requiring the torrent to be in the database. This is useful for working with arbitrary torrents.

### Endpoint
```
GET /api/torrent/:infoHash/magnet
```

### Parameters

#### Path Parameters
- `infoHash` (required): The torrent info hash (40 character hex string)

### Response Format

#### Success Response (200)
```json
{
  "infoHash": "string",
  "magnetLink": "string",
  "trackers": ["array of tracker URLs"]
}
```

#### Error Responses

**400 - Invalid Info Hash**
```json
{
  "error": "Invalid info hash format"
}
```

**500 - Internal Server Error**
```json
{
  "error": "Internal server error"
}
```

### Examples

#### Example: Generate magnet link
```bash
curl http://localhost:7000/api/torrent/08ada5a7a6183aae1e09d831df6748d566095a10/magnet
```

Response:
```json
{
  "infoHash": "08ada5a7a6183aae1e09d831df6748d566095a10",
  "magnetLink": "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A6969%2Fannounce...",
  "trackers": [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "..."
  ]
}
```

### Notes

1. **No Database Required**: This endpoint works with any valid info hash, regardless of whether it exists in the database.

2. **Default Trackers**: The endpoint includes a list of reliable public trackers.

3. **Caching**: Responses are cached for 24 hours since magnet links don't change.

### Integration Example (JavaScript)

```javascript
async function getMagnetLink(infoHash) {
  const baseUrl = 'http://localhost:7000';
  
  try {
    const response = await fetch(`${baseUrl}/api/torrent/${infoHash}/magnet`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate magnet link');
    }
    
    const data = await response.json();
    return data.magnetLink;
  } catch (error) {
    console.error('Error generating magnet link:', error);
    throw error;
  }
}

// Usage
const infoHash = '08ada5a7a6183aae1e09d831df6748d566095a10';
const magnetLink = await getMagnetLink(infoHash);
console.log(magnetLink);
``` 