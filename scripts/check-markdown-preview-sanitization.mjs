import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const previewPath = path.join(
    repoRoot,
    'frontend',
    'src',
    'lib',
    'components',
    'preview-pane',
    'PreviewContent.svelte',
);

function fail(message) {
    console.error(`Markdown preview sanitization check failed: ${message}`);
    process.exitCode = 1;
}

function requireSnippet(source, snippet) {
    if (!source.includes(snippet)) {
        fail(`PreviewContent.svelte must include ${snippet}.`);
    }
}

function requireRegex(source, pattern, label) {
    if (!pattern.test(source)) {
        fail(`PreviewContent.svelte must include ${label}.`);
    }
}

function forbidRegex(source, pattern, label) {
    if (pattern.test(source)) {
        fail(`PreviewContent.svelte must not include ${label}.`);
    }
}

const previewSource = fs.readFileSync(previewPath, 'utf8');
const markedParseCount = [...previewSource.matchAll(/\bmarked\.parse\s*\(/g)].length;

requireSnippet(previewSource, "import DOMPurify from 'dompurify';");
requireSnippet(previewSource, 'USE_PROFILES: { html: true }');
requireSnippet(previewSource, "FORBID_ATTR: ['style']");
requireSnippet(previewSource, '{@html renderedMarkdown}');
forbidRegex(previewSource, /renderedMarkdown\s*=\s*marked\.parse\b/, 'direct renderedMarkdown = marked.parse assignment');
forbidRegex(previewSource, /\{@html\s*marked\.parse\b/, 'direct {@html marked.parse rendering');

if (markedParseCount !== 1) {
    fail(`PreviewContent.svelte must have exactly one marked.parse call; found ${markedParseCount}.`);
}

requireRegex(
    previewSource,
    /renderedMarkdown\s*=\s*DOMPurify\.sanitize\(\s*marked\.parse\(\s*preview\.content\s*,\s*\{\s*async:\s*false\s*\}\s*\)\s*,\s*markdownSanitizeOptions\s*,?\s*\)/s,
    'DOMPurify.sanitize(marked.parse(preview.content, { async: false }), markdownSanitizeOptions)',
);

if (!process.exitCode) {
    console.log('Markdown preview sanitization is wired.');
}
