export function formatBytes(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

export function safeApkName(name) {
  const clean = name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'application';
  return clean.toLowerCase().endsWith('.apk') ? clean : clean + '.apk';
}

export function planApkPaths(files) {
  const used = new Set();
  return files.map(file => {
    const safeName = safeApkName(file.name);
    const stem = safeName.slice(0, -4) || 'application';
    let candidate = safeName;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) candidate = stem + '-' + suffix++ + '.apk';
    used.add(candidate.toLowerCase());
    return { file, path: '/' + candidate };
  });
}

export function safeGuestFilePath(rawPath) {
  const path = String(rawPath).trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Enter a relative file path without empty, dot or parent-directory segments.');
  }
  if (!/^[a-zA-Z0-9._/-]+$/.test(path)) {
    throw new Error('Use only letters, numbers, dots, underscores, hyphens and forward slashes in the path.');
  }
  return '/' + path;
}
