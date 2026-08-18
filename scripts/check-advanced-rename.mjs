import assert from 'node:assert/strict';
import {
  analyzeRenameSelection,
  applySeparatorTransform,
  buildName,
  buildRenamePlans,
  cameraFromExif,
  capitalizeValue,
  dateTakenFromExif,
  defaultAdvancedRenameSettings,
  formatExifDate,
  insertValue,
  isImageEntry,
  isValidRenameName,
  joinFileName,
  numberedValue,
  parseAdvancedRenameSettings,
  parseModifiedDate,
  passesAdvancedFilter,
  renderTemplate,
  replaceWithOptions,
  sanitizeFileName,
  selectMatchingTargets,
  sequenceText,
  settingsNeedImageContext,
  splitFileName,
} from '../frontend/src/lib/advancedRenameEngine.ts';

function file(name, extra = {}) {
  return {
    name,
    path: extra.path || `/photos/${name}`,
    is_dir: false,
    size: 2048,
    modified: extra.modified || '2024-03-15 14:30',
    extension: extra.extension ?? (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''),
    git_status: extra.git_status || null,
    ...extra,
  };
}

function folder(name, extra = {}) {
  return file(name, { is_dir: true, extension: '', size: 0, path: extra.path || `/photos/${name}`, ...extra });
}

function settings(patch = {}) {
  const next = defaultAdvancedRenameSettings();
  return parseAdvancedRenameSettings({
    ...next,
    ...patch,
    filter: { ...next.filter, ...(patch.filter || {}) },
    template: { ...next.template, ...(patch.template || {}) },
    remove: { ...next.remove, ...(patch.remove || {}) },
    replace: { ...next.replace, ...(patch.replace || {}) },
    trim: { ...next.trim, ...(patch.trim || {}) },
    add: { ...next.add, ...(patch.add || {}) },
    capitalize: { ...next.capitalize, ...(patch.capitalize || {}) },
    separator: { ...next.separator, ...(patch.separator || {}) },
    number: { ...next.number, ...(patch.number || {}) },
    extension: { ...next.extension, ...(patch.extension || {}) },
    sanitize: { ...next.sanitize, enabled: false, ...(patch.sanitize || {}) },
  });
}

function nameOf(entry, index, patch, context, now) {
  return buildName(entry, index, settings(patch), context, now).newName;
}

assert.deepEqual(splitFileName('photo.jpg'), { base: 'photo', ext: 'jpg' });
assert.deepEqual(splitFileName('archive.tar.gz'), { base: 'archive', ext: 'tar.gz' });
assert.deepEqual(splitFileName('archive.tar.bz2'), { base: 'archive', ext: 'tar.bz2' });
assert.deepEqual(splitFileName('.hidden'), { base: '.hidden', ext: '' });
assert.equal(joinFileName('photo', 'jpg'), 'photo.jpg');
assert.equal(joinFileName('archive', 'tar.gz'), 'archive.tar.gz');
assert.equal(isValidRenameName('ok.txt'), true);
assert.equal(isValidRenameName('../x'), false);
assert.equal(isImageEntry(file('shot.JPG', { extension: 'JPG' })), true);
assert.equal(isImageEntry(folder('Album')), false);

const parsed = parseModifiedDate('2024-03-15 14:30');
assert.ok(parsed);
assert.equal(parsed.getFullYear(), 2024);
assert.equal(parsed.getMonth(), 2);
assert.equal(parsed.getDate(), 15);
assert.equal(parsed.getHours(), 14);
assert.equal(parsed.getMinutes(), 30);

assert.equal(capitalizeValue('hello world', 'first'), 'Hello world');
assert.equal(capitalizeValue('hello world', 'words'), 'Hello World');
assert.equal(capitalizeValue('the lord of the rings', 'title'), 'The Lord of the Rings');
assert.equal(capitalizeValue('HELLO WORLD', 'sentence'), 'Hello world');
assert.equal(capitalizeValue('hello', 'upper'), 'HELLO');
assert.equal(capitalizeValue('HELLO', 'lower'), 'hello');

assert.equal(
  replaceWithOptions('Photo 001', '(\\d+)', 'n$1', true, true).value,
  'Photo n001',
);
assert.equal(replaceWithOptions('AaA', 'a', 'b', false, false).value, 'bbb');
assert.match(replaceWithOptions('x', '(', '', true, true).error || '', /Invalid|Unterminated|missing/i);

const now = new Date(2026, 7, 18, 9, 8, 7);
assert.equal(
  renderTemplate('{base}_{yyyy}-{mm}-{dd}_{n}', file('DSC_0001.jpg'), 0, settings({
    number: { start: 1, pad: 3, step: 1 },
  }), {}, now),
  'DSC_0001_2024-03-15_001',
);
assert.equal(
  renderTemplate('{parent}_{size}_{type}_{kind}', file('a.txt', { path: '/docs/notes/a.txt', size: 12 }), 0, settings(), {}, now),
  'notes_12_TXT File_file',
);
assert.equal(
  renderTemplate('{now_date}_{now_time}', file('a.txt'), 0, settings(), {}, now),
  '2026-08-18_090807',
);
assert.equal(
  renderTemplate('{camera}_{date_taken}_{width}x{height}_{exif:LensModel}', file('shot.jpg'), 0, settings(), {
    camera: 'Canon EOS',
    dateTaken: '2024-01-02_030405',
    width: 800,
    height: 600,
    exif: { LensModel: '50mm' },
  }, now),
  'Canon EOS_2024-01-02_030405_800x600_50mm',
);
assert.equal(
  renderTemplate('{tag}_{git}', file('a.txt', { git_status: 'modified' }), 0, settings(), { colorLabel: 'Red' }, now),
  'Red_modified',
);

const templateResult = buildName(file('photo.jpg'), 2, settings({
  template: { enabled: true, pattern: '{base}_{n}', keepExtension: true },
  number: { start: 10, step: 2, pad: 3 },
}), {}, now);
assert.equal(templateResult.newName, 'photo_014.jpg');

assert.equal(
  nameOf(file('keep IMG extra.jpg'), 0, {
    applyPart: 'base',
    remove: { enabled: true, text: 'IMG ', regex: false, caseSensitive: true },
  }),
  'keep extra.jpg',
);

assert.equal(
  nameOf(file('Vacation Photo.JPG'), 0, {
    applyPart: 'base',
    replace: { enabled: true, find: ' ', replaceWith: '_', regex: false, caseSensitive: true },
  }),
  'Vacation_Photo.JPG',
);

assert.equal(
  nameOf(file('  hello   world  .txt'), 0, {
    applyPart: 'base',
    trim: { enabled: true, mode: 'both', collapse: true },
  }),
  'hello world.txt',
);

assert.equal(
  insertValue('photo.jpg', 'X', 'prefix', 0, 'full', false),
  'Xphoto.jpg',
);
assert.equal(
  insertValue('photo.jpg', 'X', 'before-ext', 0, 'full', false),
  'photoX.jpg',
);
assert.equal(
  insertValue('photo.jpg', 'X', 'index', 0, 'base', false),
  'Xphoto.jpg',
);
assert.equal(
  nameOf(file('photo.jpg'), 0, {
    applyPart: 'base',
    add: { enabled: true, text: 'new-', position: 'prefix', index: 0 },
  }),
  'new-photo.jpg',
);

assert.equal(
  nameOf(file('the lord of the rings.txt'), 0, {
    applyPart: 'base',
    capitalize: { enabled: true, mode: 'title' },
  }),
  'The Lord of the Rings.txt',
);

assert.equal(
  applySeparatorTransform('my photo.jpg', 'dots-to-spaces', false, 'full', false),
  'my photo.jpg',
);
assert.equal(
  applySeparatorTransform('my.photo.jpg', 'dots-to-spaces', false, 'full', false),
  'my photo.jpg',
);
assert.equal(
  nameOf(file('my photo.jpg'), 0, {
    applyPart: 'base',
    separator: { enabled: true, mode: 'spaces-to-dashes', collapse: true },
  }),
  'my-photo.jpg',
);

assert.equal(sequenceText(settings({ number: { start: 1, step: 1, pad: 3 } }), 0), '001');
assert.equal(sequenceText(settings({ number: { start: 5, step: 2, pad: 2 } }), 3), '11');
assert.equal(
  numberedValue('photo.jpg', '001', 'before-ext', '_', 'full', false),
  'photo_001.jpg',
);
assert.equal(
  nameOf(file('photo.jpg'), 4, {
    applyPart: 'full',
    number: { enabled: true, start: 1, step: 1, pad: 3, position: 'prefix', separator: '-' },
  }),
  '005-photo.jpg',
);

assert.equal(
  nameOf(file('photo.JPG'), 0, { extension: { enabled: true, mode: 'lower' } }),
  'photo.jpg',
);
assert.equal(
  nameOf(file('photo.JPG'), 0, { extension: { enabled: true, mode: 'set', custom: 'png' } }),
  'photo.png',
);
assert.equal(
  nameOf(file('photo.JPG'), 0, { extension: { enabled: true, mode: 'remove' } }),
  'photo',
);
assert.equal(
  nameOf(folder('Album.old'), 0, { extension: { enabled: true, mode: 'remove' } }),
  'Album.old',
);

assert.equal(sanitizeFileName('a/b:c*.txt', '_'), 'a_b_c_.txt');
assert.equal(sanitizeFileName('name. ', '_'), 'name');
assert.equal(
  nameOf(file('ok.txt'), 0, {
    add: { enabled: true, text: 'a/b', position: 'prefix', index: 0 },
    sanitize: { enabled: true, replacement: '_' },
  }),
  'a_bok.txt',
);

const invertNoText = passesAdvancedFilter(file('a.jpg'), settings({
  filter: { enabled: true, invert: true, extensions: 'jpg', text: '' },
}));
assert.equal(invertNoText.matched, false);

const invertWithExt = passesAdvancedFilter(file('notes.txt'), settings({
  filter: { enabled: true, invert: true, extensions: 'jpg', text: '' },
}));
assert.equal(invertWithExt.matched, true);

assert.equal(
  passesAdvancedFilter(file('readme.md'), settings({
    filter: { enabled: true, kind: 'files', extensions: 'md' },
  })).matched,
  true,
);
assert.equal(
  passesAdvancedFilter(folder('docs'), settings({
    filter: { enabled: true, kind: 'files' },
  })).matched,
  false,
);
assert.equal(
  passesAdvancedFilter(file('archive.tar.gz'), settings({
    filter: { enabled: true, extensions: 'gz' },
  })).matched,
  true,
);

const filtered = selectMatchingTargets([
  { entry: file('keep.jpg'), parentPath: '/photos' },
  { entry: file('skip.txt'), parentPath: '/photos' },
  { entry: file('also.jpg'), parentPath: '/photos' },
], settings({
  filter: { enabled: true, extensions: 'jpg' },
}));
assert.deepEqual(filtered.targets.map((target) => [target.entry.name, target.sequenceIndex]), [
  ['keep.jpg', 0],
  ['also.jpg', 1],
]);

const numberedPlans = buildRenamePlans([
  { entry: file('keep.jpg'), parentPath: '/photos' },
  { entry: file('skip.txt'), parentPath: '/photos' },
  { entry: file('also.jpg'), parentPath: '/photos' },
], settings({
  filter: { enabled: true, extensions: 'jpg' },
  number: { enabled: true, start: 1, step: 1, pad: 3, position: 'before-ext', separator: '_' },
}));
assert.deepEqual(numberedPlans.plans.map((plan) => plan.newName), ['keep_001.jpg', 'also_002.jpg']);

const duplicates = buildRenamePlans([
  { entry: file('a.txt', { path: '/tmp/a.txt' }), parentPath: '/tmp' },
  { entry: file('b.txt', { path: '/tmp/b.txt' }), parentPath: '/tmp' },
], settings({
  template: { enabled: true, pattern: 'same', keepExtension: true },
}));
assert.equal(duplicates.plans[0].error, 'Duplicate target name');
assert.equal(duplicates.plans[1].error, 'Duplicate target name');

const regexError = buildName(file('a.txt'), 0, settings({
  replace: { enabled: true, find: '(', replaceWith: 'x', regex: true },
}));
assert.ok(regexError.error);

const emptyName = buildName(file('abc.txt'), 0, settings({
  applyPart: 'full',
  replace: { enabled: true, find: 'abc.txt', replaceWith: '', regex: false },
}));
assert.equal(emptyName.error, 'Invalid empty file name');

assert.equal(settingsNeedImageContext(settings({
  template: { enabled: true, pattern: '{base}_{camera}' },
})), true);
assert.equal(settingsNeedImageContext(settings({
  template: { enabled: true, pattern: '{base}_{n}' },
})), false);

assert.equal(formatExifDate('2024:01:02 03:04:05'), '2024-01-02_030405');
assert.equal(cameraFromExif({ Make: 'Canon', Model: 'EOS R5' }), 'Canon EOS R5');
assert.equal(dateTakenFromExif({ DateTimeOriginal: '2024:01:02 03:04:05' }), '2024-01-02_030405');

const analysis = analyzeRenameSelection([file('a.jpg'), folder('Album'), file('b.txt')]);
assert.equal(analysis.fileCount, 2);
assert.equal(analysis.folderCount, 1);
assert.equal(analysis.imageCount, 1);
assert.equal(analysis.hasFolders, true);

const stale = parseAdvancedRenameSettings({ applyPart: 'nope', number: { pad: 'x' } });
assert.equal(stale.applyPart, 'full');
assert.equal(stale.number.pad, 3);

const coerced = parseAdvancedRenameSettings({ number: { start: '8', step: '2', pad: '4' } });
assert.equal(coerced.number.start, 8);
assert.equal(coerced.number.step, 2);
assert.equal(coerced.number.pad, 4);

const persisted = parseAdvancedRenameSettings(JSON.parse(JSON.stringify(settings({
  template: { enabled: true, pattern: '{base}_{date}' },
}))));
assert.equal(persisted.template.enabled, true);
assert.equal(persisted.template.pattern, '{base}_{date}');

console.log('Advanced rename engine checks passed.');
