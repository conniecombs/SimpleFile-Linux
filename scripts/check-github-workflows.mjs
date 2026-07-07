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
    console.error(`GitHub workflow check failed: ${message}`);
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

const ciPath = '.github/workflows/ci.yml';
const releasePath = '.github/workflows/release.yml';
const flatpakPath = '.github/workflows/flatpak.yml';
const flatpakManifestPath = 'com.simplefile.SimpleFile.yml';
const dependabotAutomergePath = '.github/workflows/dependabot-automerge.yml';
const dependabotPath = '.github/dependabot.yml';

const ciWorkflow = readText(ciPath);
const releaseWorkflow = readText(releasePath);
const flatpakWorkflow = readText(flatpakPath);
const flatpakManifest = readText(flatpakManifestPath);
const dependabotAutomergeWorkflow = readText(dependabotAutomergePath);
const dependabot = readText(dependabotPath);

const ciSnippets = [
    'pull_request:',
    'workflow_dispatch:',
    'permissions:',
    'contents: read',
    'pull-requests: read',
    'uses: actions/checkout@v7',
    'uses: dtolnay/rust-toolchain@stable',
    'components: rustfmt, clippy',
    'uses: actions/setup-node@v6',
    'node-version: 24',
    'npm ci --prefix frontend',
    'npm run check',
    'cargo fmt --all -- --check',
    'cargo clippy --locked --all-targets --all-features -- -D warnings',
    'cargo test --locked --all-features',
    'cargo audit --deny warnings',
    'x86_64-pc-windows-msvc',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu',
    'cargo build --locked --release --all-features --target ${{ matrix.target }}',
];

for (const snippet of ciSnippets) {
    requireSnippet(ciWorkflow, ciPath, snippet);
}

const releaseSnippets = [
    'tags:',
    "'v*'",
    'workflow_dispatch:',
    'contents: write',
    'Validate release version',
    'Version must look like v1.0.0 or v1.0.0-beta.1',
    'tauri.conf.json',
    'Cargo.toml',
    'uses: actions/checkout@v7',
    'components: rustfmt, clippy',
    'uses: actions/setup-node@v6',
    'node-version: 24',
    'npm ci --prefix frontend',
    'npm run check',
    'cargo fmt --all -- --check',
    'cargo clippy --locked --all-targets --all-features -- -D warnings',
    'cargo test --locked --all-features',
    'cargo audit --deny warnings',
    'TAURI_SIGNING_PRIVATE_KEY',
    'tauri-apps/tauri-action@',
    'uploadUpdaterJson: true',
    'uploadUpdaterSignatures: true',
    'updaterJsonPreferNsis: true',
    'args: --target ${{ matrix.target }}',
    'softprops/action-gh-release@v3',
];

for (const snippet of releaseSnippets) {
    requireSnippet(releaseWorkflow, releasePath, snippet);
}

requireRegex(
    releaseWorkflow,
    releasePath,
    /if:\s*needs\.validate\.outputs\.draft\s*==\s*'false'/,
    'a publish gate that respects manual draft=false releases',
);

const flatpakSnippets = [
    'uses: actions/checkout@v7',
    'flatpak-builder --user --disable-rofiles-fuse --install-deps-from=flathub --force-clean build-dir com.simplefile.SimpleFile.yml',
    'flatpak build-bundle repo SimpleFile.flatpak com.simplefile.SimpleFile',
    'uses: actions/upload-artifact@v7',
    'name: SimpleFile-Flatpak',
    'path: SimpleFile.flatpak',
];

for (const snippet of flatpakSnippets) {
    requireSnippet(flatpakWorkflow, flatpakPath, snippet);
}

const flatpakManifestSnippets = [
    'org.freedesktop.Sdk.Extension.node24',
    'org.freedesktop.Sdk.Extension.rust-stable',
    'append-path: /usr/lib/sdk/node24/bin:/usr/lib/sdk/rust-stable/bin',
    'cd src-tauri && cargo build --release',
];

for (const snippet of flatpakManifestSnippets) {
    requireSnippet(flatpakManifest, flatpakManifestPath, snippet);
}

const dependabotAutomergeSnippets = [
    'pull_request_target:',
    'types: [opened, reopened, synchronize, ready_for_review]',
    'contents: write',
    'pull-requests: write',
    "if: ${{ github.actor == 'dependabot[bot]' }}",
    'uses: dependabot/fetch-metadata@v3',
    'gh pr merge --auto --merge "$PR_URL"',
    'PR_URL: ${{ github.event.pull_request.html_url }}',
    'GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
];

for (const snippet of dependabotAutomergeSnippets) {
    requireSnippet(dependabotAutomergeWorkflow, dependabotAutomergePath, snippet);
}

if (/^on:\s*pull_request\s*$/m.test(dependabotAutomergeWorkflow)) {
    fail(`${dependabotAutomergePath} must not use pull_request because Dependabot PRs can receive a read-only token there.`);
}

const dependabotSnippets = [
    'package-ecosystem: "cargo"',
    'directory: "/src-tauri"',
    'package-ecosystem: "github-actions"',
    'directory: "/"',
    'interval: "weekly"',
];

for (const snippet of dependabotSnippets) {
    requireSnippet(dependabot, dependabotPath, snippet);
}

if (!process.exitCode) {
    console.log('GitHub workflow configuration is wired.');
}
