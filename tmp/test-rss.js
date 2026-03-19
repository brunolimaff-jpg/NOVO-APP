
function extractTag(xml, tag) {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '') : '';
}

const sampleItem = `
<item>
<title>Preço do arroz cai no Rio Grande do Sul</title>
<link>https://news.google.com/rss/articles/CBMiWWh0dHBzOi8vd3d3LmNhbmFscnVyYWwuY29tLmJyL25vdGljaWFzL2FncmljdWx0dXJhL3ByZWNvLWRvLWFycm96LWNhaS1uby1yaW8tZ3JhbmRlLWRvLXN1bC_SAQA?oc=5</link>
<guid isPermaLink="false">CBMiWWh0dHBzOi8vd3d3LmNhbmFscnVyYWwuY29tLmJyL25vdGljaWFzL2FncmljdWx0dXJhL3ByZWNvLWRvLWFycm96LWNhaS1uby1yaW8tZ3JhbmRlLWRvLXN1bC_SAQA</guid>
<pubDate>Thu, 19 Mar 2026 12:00:00 GMT</pubDate>
<description>O preço do arroz registrou queda...</description>
<source url="https://www.canalrural.com.br">Canal Rural</source>
</item>
`;

console.log("Testing extractTag for 'link':");
const link = extractTag(sampleItem, 'link');
console.log(`Link: "${link}"`);

console.log("\nTesting extractTag for 'source':");
const source = extractTag(sampleItem, 'source');
console.log(`Source: "${source}"`);

if (link === "https://news.google.com/rss/articles/CBMiWWh0dHBzOi8vd3d3LmNhbmFscnVyYWwuY29tLmJyL25vdGljaWFzL2FncmljdWx0dXJhL3ByZWNvLWRvLWFycm96LWNhaS1uby1yaW8tZ3JhbmRlLWRvLXN1bC_SAQA?oc=5") {
    console.log("\nSUCCESS: Link extracted correctly.");
} else {
    console.log("\nFAILURE: Link mismatch.");
}
