import assert from 'node:assert/strict';
import {
  applyPersistedPaneSession,
  breadcrumbSegments,
  createPaneSession,
  normalizePaneId,
  otherPaneId,
  persistablePaneSession,
  recordPaneHistory,
} from '../frontend/src/lib/paneSession.ts';

assert.equal(otherPaneId('primary'), 'secondary');
assert.equal(otherPaneId('secondary'), 'primary');

assert.equal(normalizePaneId('primary', 'secondary'), 'primary');
assert.equal(normalizePaneId('secondary', 'primary'), 'secondary');
assert.equal(normalizePaneId(undefined, 'secondary'), 'secondary');
assert.equal(normalizePaneId('nope', 'primary'), 'primary');

const rootOnly = breadcrumbSegments('/');
assert.deepEqual(rootOnly, [{ current: true, label: '/', path: '/' }]);

const home = breadcrumbSegments('/home/vox/docs');
assert.equal(home[0].path, '/');
assert.equal(home[0].current, false);
assert.equal(home.at(-1)?.path, '/home/vox/docs');
assert.equal(home.at(-1)?.current, true);
assert.equal(home.at(-1)?.label, 'docs');

const session = createPaneSession();
recordPaneHistory(session, '/home', 'push');
recordPaneHistory(session, '/home/vox', 'push');
recordPaneHistory(session, '/tmp', 'replace-current');
assert.deepEqual(session.history, ['/home', '/tmp']);
assert.equal(session.historyIndex, 1);

recordPaneHistory(session, '/var', 'none');
assert.deepEqual(session.history, ['/home', '/tmp']);

const restored = createPaneSession();
applyPersistedPaneSession(restored, persistablePaneSession({
  ...createPaneSession(),
  path: '/media',
  history: ['/media'],
  historyIndex: 0,
  isGridView: true,
  showHiddenFiles: true,
  sortBy: 'size',
  sortAsc: false,
}));
assert.equal(restored.path, '/media');
assert.equal(restored.isGridView, true);
assert.equal(restored.showHiddenFiles, true);
assert.equal(restored.sortBy, 'size');
assert.equal(restored.sortAsc, false);

console.log('pane session checks passed');
