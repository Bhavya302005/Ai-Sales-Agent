const fs = require('fs');

const transcriptPath = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\f662a900-1c2e-4c16-a874-5581641258f0\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(transcriptPath, 'utf8');

const regex = /Showing lines (\d+) to (\d+)\\nThe following code has been modified.*?\\n((\d+): .*?(?=\\nThe above content|"))/gs;

let matches;
let extractedLines = {};

while ((matches = regex.exec(content)) !== null) {
  const block = matches[3];
  const lines = block.split('\\n');
  for (const line of lines) {
    const match = line.match(/^(\d+): (.*)$/);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      const lineContent = match[2].replace(/\\\\n/g, '\\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      extractedLines[lineNum] = lineContent;
    }
  }
}

const keys = Object.keys(extractedLines).map(Number).sort((a,b) => a-b);
console.log(`Extracted ${keys.length} lines. Min: ${Math.min(...keys)}, Max: ${Math.max(...keys)}`);

if (keys.length > 0) {
  const outPath = 'd:\\email application\\job_outreach_web\\extracted_page.tsx';
  let outContent = '';
  let lastKey = 0;
  for (const k of keys) {
    while (lastKey + 1 < k) {
      lastKey++;
      outContent += `// MISSING LINE ${lastKey}\n`;
    }
    outContent += extractedLines[k] + '\n';
    lastKey = k;
  }
  fs.writeFileSync(outPath, outContent, 'utf8');
  console.log(`Wrote extracted lines to ${outPath}`);
}
