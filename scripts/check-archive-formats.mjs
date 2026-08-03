import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readText(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message) {
    console.error(`Archive format check failed: ${message}`);
    process.exitCode = 1;
}

function requireSnippet(source, file, snippet) {
    if (!source.includes(snippet)) {
        fail(`${file} must include ${snippet}.`);
    }
}

function forbidRegex(source, file, pattern, label) {
    if (pattern.test(source)) {
        fail(`${file} must not include ${label}.`);
    }
}

const archiveWorkflowPath = 'frontend/src/lib/app/archive.ts';
const contextMenuPath = 'frontend/src/lib/components/context-menus/ContextMenu.svelte';
const backendArchivePath = 'src-tauri/src/archive.rs';

const archiveWorkflow = readText(archiveWorkflowPath);
const contextMenu = readText(contextMenuPath);
const backendArchive = readText(backendArchivePath);

requireSnippet(
    archiveWorkflow,
    archiveWorkflowPath,
    "const archiveExtensions = new Set(['zip', 'tar', 'tar.gz', 'tgz', 'rar']);",
);
requireSnippet(
    contextMenu,
    contextMenuPath,
    "const archiveExtensions = new Set(['zip', 'tar', 'tar.gz', 'tgz', 'rar']);",
);
requireSnippet(contextMenu, contextMenuPath, "if (lower.endsWith('.tar.gz')) return 'tar.gz';");
requireSnippet(backendArchive, backendArchivePath, 'name.ends_with(".tar.gz") || name.ends_with(".tgz")');

forbidRegex(
    archiveWorkflow,
    archiveWorkflowPath,
    /archiveExtensions\s*=\s*new Set\(\[[^\]]*['"]gz['"]/,
    'standalone .gz in archiveExtensions',
);
forbidRegex(
    contextMenu,
    contextMenuPath,
    /archiveExtensions\s*=\s*new Set\(\[[^\]]*['"]gz['"]/,
    'standalone .gz in archiveExtensions',
);

if (!process.exitCode) {
    console.log('Archive format support is aligned.');
}
