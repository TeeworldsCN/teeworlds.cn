import { FetchCache } from './src/lib/server/fetch-cache.ts';

// Test if memoryCache leaks
async function run() {
    let rss = process.memoryUsage().rss;
    console.log(`Initial: ${rss / 1024 / 1024} MB`);
    
    const fetchCache = new FetchCache<any>('http://example.com', (res) => res, { memory: true, version: 1 });
    
    // We can't really test this without a mock volatile store because volatile.get is used
}

run();
