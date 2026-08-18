export type ApplyPart = 'full' | 'base' | 'extension';
export type TrimMode = 'both' | 'start' | 'end';
export type AddPosition = 'prefix' | 'suffix' | 'before-ext' | 'index';
export type CapitalizeMode = 'first' | 'words' | 'title' | 'sentence' | 'upper' | 'lower';
export type SeparatorMode =
  | 'spaces-to-dashes'
  | 'spaces-to-underscores'
  | 'underscores-to-spaces'
  | 'dashes-to-spaces'
  | 'dots-to-spaces';
export type NumberPosition = 'prefix' | 'suffix' | 'before-ext' | 'replace';
export type ExtensionMode = 'lower' | 'upper' | 'set' | 'remove';
export type FilterKind = 'all' | 'files' | 'folders';

export type RenameSource = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
  extension?: string;
  git_status?: string | null;
};

export type AdvancedRenameFileContext = {
  width?: number;
  height?: number;
  camera?: string;
  dateTaken?: string;
  tags?: string[];
  colorLabel?: string;
  exif?: Record<string, string>;
};

export type AdvancedRenameSettings = {
  applyPart: ApplyPart;
  includeRecursive: boolean;
  includeHidden: boolean;
  renameFolders: boolean;
  filter: {
    enabled: boolean;
    text: string;
    regex: boolean;
    caseSensitive: boolean;
    invert: boolean;
    extensions: string;
    kind: FilterKind;
  };
  template: {
    enabled: boolean;
    pattern: string;
    keepExtension: boolean;
  };
  remove: {
    enabled: boolean;
    text: string;
    regex: boolean;
    caseSensitive: boolean;
  };
  replace: {
    enabled: boolean;
    find: string;
    replaceWith: string;
    regex: boolean;
    caseSensitive: boolean;
  };
  trim: {
    enabled: boolean;
    mode: TrimMode;
    collapse: boolean;
  };
  add: {
    enabled: boolean;
    text: string;
    position: AddPosition;
    index: number;
  };
  capitalize: {
    enabled: boolean;
    mode: CapitalizeMode;
  };
  separator: {
    enabled: boolean;
    mode: SeparatorMode;
    collapse: boolean;
  };
  number: {
    enabled: boolean;
    start: number;
    step: number;
    pad: number;
    position: NumberPosition;
    separator: string;
  };
  extension: {
    enabled: boolean;
    mode: ExtensionMode;
    custom: string;
  };
  sanitize: {
    enabled: boolean;
    replacement: string;
  };
};

export type AdvancedRenameTarget = {
  entry: RenameSource;
  parentPath: string;
  sequenceIndex: number;
  context?: AdvancedRenameFileContext;
};

export type AdvancedRenamePlan = {
  path: string;
  parentPath: string;
  oldName: string;
  newName: string;
  changed: boolean;
  error: string | null;
  detail: string;
  isDir: boolean;
};

export type BuildNameResult = {
  newName: string;
  error: string | null;
};

export type FilterResult = {
  matched: boolean;
  error: string | null;
};

const TITLE_SMALL_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'on', 'at', 'to', 'from',
  'by', 'of', 'in', 'with', 'as', 'vs',
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'avif',
]);

const COMPOUND_EXTENSIONS = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst'];

export function defaultAdvancedRenameSettings(): AdvancedRenameSettings {
  return {
    applyPart: 'full',
    includeRecursive: false,
    includeHidden: false,
    renameFolders: false,
    filter: {
      enabled: false,
      text: '',
      regex: false,
      caseSensitive: false,
      invert: false,
      extensions: '',
      kind: 'all',
    },
    template: {
      enabled: false,
      pattern: '{base}_{n}',
      keepExtension: true,
    },
    remove: {
      enabled: false,
      text: '',
      regex: false,
      caseSensitive: false,
    },
    replace: {
      enabled: false,
      find: '',
      replaceWith: '',
      regex: false,
      caseSensitive: false,
    },
    trim: {
      enabled: false,
      mode: 'both',
      collapse: false,
    },
    add: {
      enabled: false,
      text: '',
      position: 'prefix',
      index: 0,
    },
    capitalize: {
      enabled: false,
      mode: 'first',
    },
    separator: {
      enabled: false,
      mode: 'spaces-to-dashes',
      collapse: true,
    },
    number: {
      enabled: false,
      start: 1,
      step: 1,
      pad: 3,
      position: 'before-ext',
      separator: '_',
    },
    extension: {
      enabled: false,
      mode: 'lower',
      custom: '',
    },
    sanitize: {
      enabled: true,
      replacement: '_',
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickString<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function pickText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseAdvancedRenameSettings(raw: unknown): AdvancedRenameSettings {
  const defaults = defaultAdvancedRenameSettings();
  if (!isObject(raw)) return defaults;

  const filter = isObject(raw.filter) ? raw.filter : {};
  const template = isObject(raw.template) ? raw.template : {};
  const remove = isObject(raw.remove) ? raw.remove : {};
  const replace = isObject(raw.replace) ? raw.replace : {};
  const trim = isObject(raw.trim) ? raw.trim : {};
  const add = isObject(raw.add) ? raw.add : {};
  const capitalize = isObject(raw.capitalize) ? raw.capitalize : {};
  const separator = isObject(raw.separator) ? raw.separator : {};
  const number = isObject(raw.number) ? raw.number : {};
  const extension = isObject(raw.extension) ? raw.extension : {};
  const sanitize = isObject(raw.sanitize) ? raw.sanitize : {};

  return {
    applyPart: pickString(raw.applyPart, ['full', 'base', 'extension'] as const, defaults.applyPart),
    includeRecursive: pickBoolean(raw.includeRecursive, defaults.includeRecursive),
    includeHidden: pickBoolean(raw.includeHidden, defaults.includeHidden),
    renameFolders: pickBoolean(raw.renameFolders, defaults.renameFolders),
    filter: {
      enabled: pickBoolean(filter.enabled, defaults.filter.enabled),
      text: pickText(filter.text, defaults.filter.text),
      regex: pickBoolean(filter.regex, defaults.filter.regex),
      caseSensitive: pickBoolean(filter.caseSensitive, defaults.filter.caseSensitive),
      invert: pickBoolean(filter.invert, defaults.filter.invert),
      extensions: pickText(filter.extensions, defaults.filter.extensions),
      kind: pickString(filter.kind, ['all', 'files', 'folders'] as const, defaults.filter.kind),
    },
    template: {
      enabled: pickBoolean(template.enabled, defaults.template.enabled),
      pattern: pickText(template.pattern, defaults.template.pattern),
      keepExtension: pickBoolean(template.keepExtension, defaults.template.keepExtension),
    },
    remove: {
      enabled: pickBoolean(remove.enabled, defaults.remove.enabled),
      text: pickText(remove.text, defaults.remove.text),
      regex: pickBoolean(remove.regex, defaults.remove.regex),
      caseSensitive: pickBoolean(remove.caseSensitive, defaults.remove.caseSensitive),
    },
    replace: {
      enabled: pickBoolean(replace.enabled, defaults.replace.enabled),
      find: pickText(replace.find, defaults.replace.find),
      replaceWith: pickText(replace.replaceWith, defaults.replace.replaceWith),
      regex: pickBoolean(replace.regex, defaults.replace.regex),
      caseSensitive: pickBoolean(replace.caseSensitive, defaults.replace.caseSensitive),
    },
    trim: {
      enabled: pickBoolean(trim.enabled, defaults.trim.enabled),
      mode: pickString(trim.mode, ['both', 'start', 'end'] as const, defaults.trim.mode),
      collapse: pickBoolean(trim.collapse, defaults.trim.collapse),
    },
    add: {
      enabled: pickBoolean(add.enabled, defaults.add.enabled),
      text: pickText(add.text, defaults.add.text),
      position: pickString(add.position, ['prefix', 'suffix', 'before-ext', 'index'] as const, defaults.add.position),
      index: pickNumber(add.index, defaults.add.index),
    },
    capitalize: {
      enabled: pickBoolean(capitalize.enabled, defaults.capitalize.enabled),
      mode: pickString(
        capitalize.mode,
        ['first', 'words', 'title', 'sentence', 'upper', 'lower'] as const,
        defaults.capitalize.mode,
      ),
    },
    separator: {
      enabled: pickBoolean(separator.enabled, defaults.separator.enabled),
      mode: pickString(
        separator.mode,
        [
          'spaces-to-dashes',
          'spaces-to-underscores',
          'underscores-to-spaces',
          'dashes-to-spaces',
          'dots-to-spaces',
        ] as const,
        defaults.separator.mode,
      ),
      collapse: pickBoolean(separator.collapse, defaults.separator.collapse),
    },
    number: {
      enabled: pickBoolean(number.enabled, defaults.number.enabled),
      start: pickNumber(number.start, defaults.number.start),
      step: pickNumber(number.step, defaults.number.step),
      pad: pickNumber(number.pad, defaults.number.pad),
      position: pickString(
        number.position,
        ['prefix', 'suffix', 'before-ext', 'replace'] as const,
        defaults.number.position,
      ),
      separator: pickText(number.separator, defaults.number.separator),
    },
    extension: {
      enabled: pickBoolean(extension.enabled, defaults.extension.enabled),
      mode: pickString(extension.mode, ['lower', 'upper', 'set', 'remove'] as const, defaults.extension.mode),
      custom: pickText(extension.custom, defaults.extension.custom),
    },
    sanitize: {
      enabled: pickBoolean(sanitize.enabled, defaults.sanitize.enabled),
      replacement: pickText(sanitize.replacement, defaults.sanitize.replacement),
    },
  };
}

export function cloneAdvancedRenameSettings(settings: AdvancedRenameSettings): AdvancedRenameSettings {
  return parseAdvancedRenameSettings(settings);
}

export function splitFileName(name: string): { base: string; ext: string } {
  const lower = name.toLowerCase();
  for (const compound of COMPOUND_EXTENSIONS) {
    if (lower.endsWith(compound)) {
      return {
        base: name.slice(0, -compound.length),
        ext: name.slice(-compound.length + 1),
      };
    }
  }

  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return { base: name, ext: '' };
  }

  return {
    base: name.slice(0, dotIndex),
    ext: name.slice(dotIndex + 1),
  };
}

export function joinFileName(base: string, ext: string): string {
  const cleaned = ext.replace(/^\./, '');
  return cleaned ? `${base}.${cleaned}` : base;
}

export function namePartsForEntry(entry: RenameSource): { base: string; ext: string } {
  if (entry.is_dir) {
    return { base: entry.name, ext: '' };
  }
  return splitFileName(entry.name);
}

export function isImageEntry(entry: RenameSource): boolean {
  if (entry.is_dir) return false;
  const ext = (entry.extension || splitFileName(entry.name).ext).toLowerCase();
  const last = ext.split('.').pop() || ext;
  return IMAGE_EXTENSIONS.has(last);
}

export function parseFilterExtensions(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

export function settingsNeedImageContext(settings: AdvancedRenameSettings): boolean {
  if (!settings.template.enabled) return false;
  return /\{(width|height|camera|date_taken|exif:[^}]+)\}/i.test(settings.template.pattern);
}

export function compileRegex(pattern: string, caseSensitive: boolean): { regex?: RegExp; error?: string } {
  try {
    return { regex: new RegExp(pattern, caseSensitive ? 'g' : 'gi') };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function normalizeNumbering(settings: AdvancedRenameSettings) {
  const start = Number.isFinite(settings.number.start) ? settings.number.start : 1;
  const rawStep = Number.isFinite(settings.number.step) ? settings.number.step : 1;
  const step = rawStep === 0 ? 1 : rawStep;
  const rawPad = Number.isFinite(settings.number.pad) ? Math.trunc(settings.number.pad) : 3;
  const pad = rawPad < 1 ? 1 : rawPad;
  return { start, step, pad };
}

export function sequenceText(settings: AdvancedRenameSettings, sequenceIndex: number): string {
  const { start, step, pad } = normalizeNumbering(settings);
  return String(start + sequenceIndex * step).padStart(pad, '0');
}

function parentFolderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

export function parseModifiedDate(value: string): Date | null {
  if (!value || value === '-') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second || '0'),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateParts(date: Date) {
  return {
    yyyy: String(date.getFullYear()),
    mm: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    hh: pad2(date.getHours()),
    min: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds()),
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`,
  };
}

export function fileTypeLabel(entry: RenameSource): string {
  if (entry.is_dir) return 'Folder';
  const ext = (entry.extension || splitFileName(entry.name).ext).toUpperCase();
  return ext ? `${ext} File` : 'File';
}

function applyToPart(
  name: string,
  isDir: boolean,
  applyPart: ApplyPart,
  transform: (value: string) => string,
): string {
  if (isDir) {
    return applyPart === 'extension' ? name : transform(name);
  }

  if (applyPart === 'full') {
    return transform(name);
  }

  const { base, ext } = splitFileName(name);
  if (applyPart === 'base') {
    return joinFileName(transform(base), ext);
  }

  return joinFileName(base, transform(ext).replace(/^\./, ''));
}

export function replaceWithOptions(
  value: string,
  find: string,
  replacement: string,
  regex: boolean,
  caseSensitive: boolean,
): { value: string; error: string | null } {
  if (!find) return { value, error: null };

  if (regex) {
    const compiled = compileRegex(find, caseSensitive);
    if (!compiled.regex) {
      return { value, error: compiled.error || 'Invalid regular expression' };
    }
    return { value: value.replace(compiled.regex, replacement), error: null };
  }

  if (caseSensitive) {
    return { value: value.split(find).join(replacement), error: null };
  }

  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { value: value.replace(new RegExp(escaped, 'gi'), replacement), error: null };
}

export function capitalizeValue(value: string, mode: CapitalizeMode): string {
  if (mode === 'upper') return value.toUpperCase();
  if (mode === 'lower') return value.toLowerCase();

  if (mode === 'sentence') {
    const lower = value.toLowerCase();
    return lower.replace(/[a-z0-9]/i, (letter) => letter.toUpperCase());
  }

  if (mode === 'words') {
    return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  if (mode === 'title') {
    const parts = value.split(/(\s+)/);
    const wordCount = parts.filter((part) => part && !/^\s+$/.test(part)).length;
    let wordIndex = 0;
    return parts.map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      const isEdge = wordIndex === 0 || wordIndex === wordCount - 1;
      wordIndex += 1;
      const lower = part.toLowerCase();
      const core = lower.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
      if (!isEdge && TITLE_SMALL_WORDS.has(core)) {
        return lower;
      }
      return lower.replace(/[a-z0-9]/i, (letter) => letter.toUpperCase());
    }).join('');
  }

  return value.replace(/[a-z0-9]/i, (letter) => letter.toUpperCase());
}

function insertInto(name: string, value: string, position: AddPosition, indexValue: number): string {
  const { base, ext } = splitFileName(name);
  if (position === 'prefix') return `${value}${name}`;
  if (position === 'suffix') return `${name}${value}`;
  if (position === 'before-ext') return joinFileName(`${base}${value}`, ext);
  const index = Math.max(0, Math.min(name.length, Math.trunc(indexValue)));
  return `${name.slice(0, index)}${value}${name.slice(index)}`;
}

export function insertValue(
  name: string,
  value: string,
  position: AddPosition,
  indexValue: number,
  applyPart: ApplyPart,
  isDir: boolean,
): string {
  if (!value) return name;

  if (isDir || applyPart === 'full') {
    return insertInto(name, value, position, indexValue);
  }

  const { base, ext } = splitFileName(name);
  if (applyPart === 'base') {
    const nextPosition = position === 'before-ext' ? 'suffix' : position;
    return joinFileName(insertInto(base, value, nextPosition, indexValue), ext);
  }

  const nextPosition = position === 'before-ext' ? 'suffix' : position;
  return joinFileName(base, insertInto(ext, value, nextPosition, indexValue));
}

export function numberedValue(
  name: string,
  numberText: string,
  position: NumberPosition,
  separator: string,
  applyPart: ApplyPart,
  isDir: boolean,
): string {
  const glue = separator ?? '';

  const apply = (target: string, treatAsFullName: boolean) => {
    if (treatAsFullName) {
      const { base, ext } = splitFileName(target);
      if (position === 'replace') return joinFileName(numberText, ext);
      if (position === 'prefix') return `${numberText}${glue}${target}`;
      if (position === 'suffix') return `${target}${glue}${numberText}`;
      return joinFileName(`${base}${glue}${numberText}`, ext);
    }

    if (position === 'replace') return numberText;
    if (position === 'prefix') return `${numberText}${glue}${target}`;
    if (position === 'suffix' || position === 'before-ext') return `${target}${glue}${numberText}`;
    return `${target}${glue}${numberText}`;
  };

  if (isDir || applyPart === 'full') {
    return apply(name, !isDir);
  }

  const { base, ext } = splitFileName(name);
  if (applyPart === 'base') {
    return joinFileName(apply(base, false), ext);
  }
  return joinFileName(base, apply(ext, false));
}

export function convertSeparators(value: string, mode: SeparatorMode, collapse: boolean): string {
  let next = value;
  if (mode === 'spaces-to-dashes') next = next.replace(/\s/g, '-');
  if (mode === 'spaces-to-underscores') next = next.replace(/\s/g, '_');
  if (mode === 'underscores-to-spaces') next = next.replace(/_/g, ' ');
  if (mode === 'dashes-to-spaces') next = next.replace(/-/g, ' ');
  if (mode === 'dots-to-spaces') next = next.replace(/\./g, ' ');
  if (collapse) {
    next = next.replace(/([ _.-])\1+/g, '$1');
  }
  return next;
}

export function applySeparatorTransform(
  name: string,
  mode: SeparatorMode,
  collapse: boolean,
  applyPart: ApplyPart,
  isDir: boolean,
): string {
  if (mode === 'dots-to-spaces' && applyPart === 'full' && !isDir) {
    const { base, ext } = splitFileName(name);
    return joinFileName(convertSeparators(base, mode, collapse), ext);
  }
  return applyToPart(name, isDir, applyPart, (value) => convertSeparators(value, mode, collapse));
}

export function sanitizeFileName(name: string, replacement: string): string {
  const token = replacement || '_';
  return name
    .replace(/[/\u0000-\u001f<>:"|?*\\]/g, token)
    .replace(/[ .]+$/g, '')
    .trim();
}

export function extensionMatches(entry: RenameSource, extensions: string[]): boolean {
  if (extensions.length === 0) return true;
  if (entry.is_dir) return false;
  const ext = splitFileName(entry.name).ext.toLowerCase();
  const last = ext.split('.').pop() || '';
  return extensions.includes(ext) || (last !== '' && extensions.includes(last));
}

export function passesAdvancedFilter(entry: RenameSource, settings: AdvancedRenameSettings): FilterResult {
  if (!settings.filter.enabled) {
    return { matched: true, error: null };
  }

  if (settings.filter.kind === 'files' && entry.is_dir) {
    return { matched: false, error: null };
  }
  if (settings.filter.kind === 'folders' && !entry.is_dir) {
    return { matched: false, error: null };
  }

  const filterText = settings.filter.text.trim();
  const extensions = parseFilterExtensions(settings.filter.extensions);
  let matches = true;

  if (filterText) {
    if (settings.filter.regex) {
      try {
        const flags = settings.filter.caseSensitive ? '' : 'i';
        matches = new RegExp(filterText, flags).test(entry.name);
      } catch (error) {
        return {
          matched: false,
          error: error instanceof Error ? error.message : 'Invalid filter regular expression',
        };
      }
    } else if (settings.filter.caseSensitive) {
      matches = entry.name.includes(filterText);
    } else {
      matches = entry.name.toLowerCase().includes(filterText.toLowerCase());
    }
  }

  if (extensions.length > 0) {
    matches = matches && extensionMatches(entry, extensions);
  }

  if (settings.filter.invert) {
    matches = !matches;
  }

  return { matched: matches, error: null };
}

function lookupExif(context: AdvancedRenameFileContext | undefined, tag: string): string {
  if (!context?.exif) return '';
  const wanted = tag.toLowerCase();
  for (const [key, value] of Object.entries(context.exif)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return '';
}

export function templateTokens(
  entry: RenameSource,
  sequenceIndex: number,
  settings: AdvancedRenameSettings,
  context: AdvancedRenameFileContext | undefined,
  now: Date,
): Record<string, string> {
  const { base, ext } = namePartsForEntry(entry);
  const modified = parseModifiedDate(entry.modified) ?? now;
  const fileParts = formatDateParts(modified);
  const nowParts = formatDateParts(now);
  const tags = context?.tags?.filter(Boolean) ?? [];
  const camera = context?.camera || '';
  const dateTaken = context?.dateTaken || '';

  const tokens: Record<string, string> = {
    base,
    ext,
    name: entry.name,
    parent: parentFolderName(entry.path),
    n: sequenceText(settings, sequenceIndex),
    yyyy: fileParts.yyyy,
    mm: fileParts.mm,
    dd: fileParts.dd,
    hh: fileParts.hh,
    min: fileParts.min,
    ss: fileParts.ss,
    date: fileParts.date,
    time: fileParts.time,
    mtime: entry.modified === '-' ? '' : entry.modified,
    now: `${nowParts.date}_${nowParts.time}`,
    now_date: nowParts.date,
    now_time: nowParts.time,
    now_yyyy: nowParts.yyyy,
    now_mm: nowParts.mm,
    now_dd: nowParts.dd,
    now_hh: nowParts.hh,
    now_min: nowParts.min,
    now_ss: nowParts.ss,
    size: String(entry.size ?? 0),
    type: fileTypeLabel(entry),
    kind: entry.is_dir ? 'folder' : 'file',
    width: context?.width != null ? String(context.width) : '',
    height: context?.height != null ? String(context.height) : '',
    camera,
    date_taken: dateTaken,
    tag: context?.colorLabel || tags[0] || '',
    tags: tags.join('-'),
    git: entry.git_status || '',
  };

  if (context?.exif) {
    for (const [key, value] of Object.entries(context.exif)) {
      tokens[`exif:${key}`] = value;
    }
  }

  return tokens;
}

export function renderTemplate(
  pattern: string,
  entry: RenameSource,
  sequenceIndex: number,
  settings: AdvancedRenameSettings,
  context: AdvancedRenameFileContext | undefined,
  now: Date,
): string {
  const tokens = templateTokens(entry, sequenceIndex, settings, context, now);
  return pattern.replace(/\{([^{}]+)\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(tokens, token)) {
      return tokens[token];
    }
    if (token.toLowerCase().startsWith('exif:')) {
      return lookupExif(context, token.slice(5));
    }
    return match;
  });
}

export function isValidRenameName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0
    && !/[/\u0000]/.test(trimmed)
    && trimmed !== '.'
    && trimmed !== '..';
}

export function buildName(
  entry: RenameSource,
  sequenceIndex: number,
  settings: AdvancedRenameSettings,
  context: AdvancedRenameFileContext = {},
  now: Date = new Date(),
): BuildNameResult {
  let name = entry.name;
  const applyPart = settings.applyPart;
  const isDir = entry.is_dir;

  if (settings.template.enabled) {
    const rendered = renderTemplate(
      settings.template.pattern || '{base}_{n}',
      entry,
      sequenceIndex,
      settings,
      context,
      now,
    );
    const { ext } = namePartsForEntry(entry);
    name = settings.template.keepExtension && ext && !rendered.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? joinFileName(rendered, ext)
      : rendered;
  }

  if (settings.remove.enabled) {
    try {
      name = applyToPart(name, isDir, applyPart, (value) => {
        const result = replaceWithOptions(
          value,
          settings.remove.text,
          '',
          settings.remove.regex,
          settings.remove.caseSensitive,
        );
        if (result.error) throw new Error(result.error);
        return result.value;
      });
    } catch (error) {
      return { newName: name, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (settings.replace.enabled) {
    try {
      name = applyToPart(name, isDir, applyPart, (value) => {
        const result = replaceWithOptions(
          value,
          settings.replace.find,
          settings.replace.replaceWith,
          settings.replace.regex,
          settings.replace.caseSensitive,
        );
        if (result.error) throw new Error(result.error);
        return result.value;
      });
    } catch (error) {
      return { newName: name, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (settings.trim.enabled) {
    const mode = settings.trim.mode;
    name = applyToPart(name, isDir, applyPart, (value) => {
      let next = value;
      if (mode === 'start' || mode === 'both') next = next.replace(/^\s+/, '');
      if (mode === 'end' || mode === 'both') next = next.replace(/\s+$/, '');
      if (settings.trim.collapse) next = next.replace(/\s+/g, ' ');
      return next;
    });
  }

  if (settings.add.enabled) {
    name = insertValue(name, settings.add.text, settings.add.position, settings.add.index, applyPart, isDir);
  }

  if (settings.capitalize.enabled) {
    name = applyToPart(name, isDir, applyPart, (value) => capitalizeValue(value, settings.capitalize.mode));
  }

  if (settings.separator.enabled) {
    name = applySeparatorTransform(name, settings.separator.mode, settings.separator.collapse, applyPart, isDir);
  }

  if (settings.number.enabled) {
    name = numberedValue(
      name,
      sequenceText(settings, sequenceIndex),
      settings.number.position,
      settings.number.separator,
      applyPart,
      isDir,
    );
  }

  if (settings.extension.enabled && !isDir) {
    const { base, ext } = splitFileName(name);
    const mode = settings.extension.mode;
    if (mode === 'lower') name = joinFileName(base, ext.toLowerCase());
    if (mode === 'upper') name = joinFileName(base, ext.toUpperCase());
    if (mode === 'set') name = joinFileName(base, settings.extension.custom.replace(/^\./, ''));
    if (mode === 'remove') name = base;
  }

  if (settings.sanitize.enabled) {
    name = sanitizeFileName(name, settings.sanitize.replacement);
  }

  if (!name || name === '.' || name === '..') {
    return { newName: name, error: 'Invalid empty file name' };
  }
  if (!isValidRenameName(name)) {
    return { newName: name, error: 'Invalid file name' };
  }

  return { newName: name, error: null };
}

export function selectMatchingTargets(
  targets: Array<{ entry: RenameSource; parentPath: string; context?: AdvancedRenameFileContext }>,
  settings: AdvancedRenameSettings,
): { targets: AdvancedRenameTarget[]; filterError: string | null } {
  const matched: AdvancedRenameTarget[] = [];
  let filterError: string | null = null;

  for (const target of targets) {
    const result = passesAdvancedFilter(target.entry, settings);
    if (result.error) {
      filterError = result.error;
      continue;
    }
    if (!result.matched) continue;
    matched.push({
      entry: target.entry,
      parentPath: target.parentPath,
      sequenceIndex: matched.length,
      context: target.context,
    });
  }

  return { targets: matched, filterError };
}

export function buildRenamePlans(
  targets: Array<{ entry: RenameSource; parentPath: string; context?: AdvancedRenameFileContext }>,
  settings: AdvancedRenameSettings,
  now: Date = new Date(),
): { plans: AdvancedRenamePlan[]; filterError: string | null } {
  const selected = selectMatchingTargets(targets, settings);
  const duplicateKeys = new Map<string, number>();
  const drafted = selected.targets.map((target) => {
    const built = buildName(target.entry, target.sequenceIndex, settings, target.context, now);
    const key = `${target.parentPath}\0${built.newName}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
    return {
      path: target.entry.path,
      parentPath: target.parentPath,
      oldName: target.entry.name,
      newName: built.newName,
      changed: built.newName !== target.entry.name,
      error: built.error,
      detail: target.parentPath,
      isDir: target.entry.is_dir,
    };
  });

  const plans = drafted.map((plan) => {
    const key = `${plan.parentPath}\0${plan.newName}`;
    let error = plan.error;
    if (!error && (duplicateKeys.get(key) || 0) > 1) {
      error = 'Duplicate target name';
    }
    return { ...plan, error };
  });

  return { plans, filterError: selected.filterError };
}

export function analyzeRenameSelection(entries: RenameSource[]) {
  const files = entries.filter((entry) => !entry.is_dir);
  const folders = entries.filter((entry) => entry.is_dir);
  const images = files.filter((entry) => isImageEntry(entry));
  return {
    count: entries.length,
    fileCount: files.length,
    folderCount: folders.length,
    imageCount: images.length,
    hasFiles: files.length > 0,
    hasFolders: folders.length > 0,
    hasImages: images.length > 0,
    allFolders: entries.length > 0 && files.length === 0,
    allFiles: entries.length > 0 && folders.length === 0,
    allImages: files.length > 0 && images.length === files.length,
  };
}

export function formatExifDate(value: string): string {
  const match = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)
    || /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) {
    return value.replace(/[^\w.-]+/g, '_');
  }
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}_${hour}${minute}${second || '00'}`;
}

export function cameraFromExif(exif: Record<string, string> | undefined): string {
  if (!exif) return '';
  const lookup = (name: string) => {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(exif)) {
      if (key.toLowerCase() === wanted) return value;
    }
    return '';
  };
  return [lookup('Make'), lookup('Model')].filter(Boolean).join(' ').trim();
}

export function dateTakenFromExif(exif: Record<string, string> | undefined): string {
  if (!exif) return '';
  const keys = ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime'];
  for (const key of keys) {
    const wanted = key.toLowerCase();
    for (const [field, value] of Object.entries(exif)) {
      if (field.toLowerCase() === wanted && value) {
        return formatExifDate(value);
      }
    }
  }
  return '';
}
