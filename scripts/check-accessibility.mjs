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
    console.error(`Accessibility check failed: ${message}`);
    process.exitCode = 1;
}

function requireSnippet(source, file, snippet) {
    if (!source.includes(snippet)) {
        fail(`${file} must include ${snippet}.`);
    }
}

function requireRegex(source, file, pattern, label) {
    if (!pattern.test(source)) {
        fail(`${file} must include ${label}.`);
    }
}

function checkUniqueIds(source, file) {
    const seen = new Map();
    for (const match of source.matchAll(/\bid="([^"]+)"/g)) {
        const id = match[1];
        seen.set(id, (seen.get(id) ?? 0) + 1);
    }

    for (const [id, count] of seen) {
        if (count > 1) {
            fail(`${file} must not repeat id="${id}" (${count} occurrences).`);
        }
    }
}

function checkIconOnlyCloseButtons(source, file) {
    const buttonPattern = /<button\b([^>]*)>\s*&times;\s*<\/button>/g;
    for (const match of source.matchAll(buttonPattern)) {
        const attrs = match[1];
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? '(unknown id)';
        if (!/\baria-label=/.test(attrs)) {
            fail(`${file} ${id} close button must have an aria-label.`);
        }
        if (!/\btype="button"/.test(attrs)) {
            fail(`${file} ${id} close button must set type="button".`);
        }
    }
}

const contentShellPath = 'frontend/src/lib/components/layout-shell/ContentShell.svelte';
const fileListPath = 'frontend/src/lib/components/file-list/FileList.svelte';
const legacyTemplatePath = 'frontend/src/lib/components/legacy-shell-template.html';

const contentShell = readText(contentShellPath);
const fileList = readText(fileListPath);
const legacyTemplate = readText(legacyTemplatePath);

requireRegex(
    contentShell,
    contentShellPath,
    /id="pane-primary"[^>]*data-pane="primary"[^>]*role="region"[^>]*aria-label="Primary file pane"/,
    'a labeled primary pane region',
);
requireRegex(
    contentShell,
    contentShellPath,
    /id="pane-secondary"[^>]*data-pane="secondary"[^>]*role="region"[^>]*aria-label="Secondary file pane"/,
    'a labeled secondary pane region',
);
requireSnippet(
    fileList,
    fileListPath,
    "pane === 'secondary' ? 'Secondary files and folders' : 'Primary files and folders'",
);
requireSnippet(fileList, fileListPath, 'aria-label={listLabel}');

checkUniqueIds(legacyTemplate, legacyTemplatePath);
checkIconOnlyCloseButtons(legacyTemplate, legacyTemplatePath);

if (!process.exitCode) {
    console.log('Accessibility markup is wired.');
}
