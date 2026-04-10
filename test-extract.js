import { universalExtract } from './utils/documentExtractor.js';

async function test() {
    console.log("Starting test...");
    try {
        const result = await universalExtract({ url: 'https://example.com' });
        console.log("Result:", result.text.slice(0, 100));
    } catch (e) {
        console.error("Test failed:", e);
    }
}

test();
