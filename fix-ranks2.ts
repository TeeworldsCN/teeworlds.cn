import { readFileSync, writeFileSync } from 'fs';

let file = readFileSync('src/lib/server/fetches/ranks.ts', 'utf8');

// The best way to fix this without losing the last row is to attach the end logic to the transformer itself if possible
// Or just let's check if the memory leak is resolved without the closure

