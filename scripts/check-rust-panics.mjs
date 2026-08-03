import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const rustRoot = path.join(repoRoot, 'src-tauri', 'src');
const forbiddenPatterns = [
    { pattern: /\.(?:unwrap|expect)\s*\(/g, label: 'direct unwrap/expect call' },
    { pattern: /\b(?:panic|todo|unreachable)!\s*\(/g, label: 'panic/todo/unreachable macro' },
];

function collectRustFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                return collectRustFiles(entryPath);
            }
            return entry.isFile() && entry.name.endsWith('.rs') ? [entryPath] : [];
        })
        .sort();
}

function productionSource(source) {
    const testIndex = source.indexOf('#[cfg(test)]');
    return testIndex === -1 ? source : source.slice(0, testIndex);
}

function lineForIndex(source, index) {
    return source.slice(0, index).split('\n').length;
}

let failed = false;

for (const file of collectRustFiles(rustRoot)) {
    const relativePath = path.relative(repoRoot, file);
    const source = productionSource(fs.readFileSync(file, 'utf8'));

    for (const { pattern, label } of forbiddenPatterns) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
            failed = true;
            console.error(
                `Rust panic check failed: ${relativePath}:${lineForIndex(source, match.index)} uses ${label}: ${match[0]}`,
            );
        }
    }
}

if (failed) {
    process.exit(1);
}

console.log('Production Rust panic checks passed.');
