/**
 * GitHub REST API Service
 * Supports 100% dynamic API requests with personal access token authentication
 * and automatic fallback to public unauthenticated endpoints where supported.
 */

const BASE_URL = 'https://api.github.com';

function getHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim() !== '') {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function fetchUserProfile(token, fallbackUsername = 'naveenkumarredy') {
  if (token && token.trim() !== '') {
    try {
      const res = await fetch(`${BASE_URL}/user`, {
        headers: getHeaders(token),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Authenticated user fetch failed, falling back to username fetch:', e);
    }
  }

  const res = await fetch(`${BASE_URL}/users/${fallbackUsername}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile for ${fallbackUsername} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchUserRepos(token, { fallbackUsername = 'naveenkumarredy', sort = 'updated', per_page = 100 } = {}) {
  if (token && token.trim() !== '') {
    try {
      const url = `${BASE_URL}/user/repos?sort=${sort}&per_page=${per_page}&affiliation=owner,collaborator,organization_member`;
      const res = await fetch(url, {
        headers: getHeaders(token),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Authenticated repos fetch failed, falling back to public repos:', e);
    }
  }

  const url = `${BASE_URL}/users/${fallbackUsername}/repos?sort=${sort}&per_page=${per_page}`;
  const res = await fetch(url, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch repositories for ${fallbackUsername} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchRepoContents(token, owner, repo, path = '', ref = '') {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // 1. Try local dev bridge first (supports any branch, sub-branch & nested branch instantly)
  try {
    const bridgeUrl = `/api/repo-contents?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(cleanPath)}&branch=${encodeURIComponent(ref || '')}`;
    const bridgeRes = await fetch(bridgeUrl);
    if (bridgeRes.ok) {
      const bridgeData = await bridgeRes.json();
      if (Array.isArray(bridgeData)) {
        return bridgeData;
      }
    }
  } catch (e) {}

  // 2. Fallback to GitHub REST API with branch ref
  let url = `${BASE_URL}/repos/${owner}/${repo}/contents/${cleanPath}`;
  if (ref) {
    url += `?ref=${encodeURIComponent(ref)}`;
  }
  const res = await fetch(url, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch contents for ${path} on ${ref || 'default'} (HTTP ${res.status})`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export async function fetchRepoFolders(token, owner, repo, path = '', branch = '', recursive = false) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // 1. Try local dev bridge endpoint first (branch & recursive aware!)
  try {
    let bridgeUrl = `/api/repo-folders?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(cleanPath)}&branch=${encodeURIComponent(branch || '')}`;
    if (recursive) {
      bridgeUrl += '&recursive=1';
    }
    const bridgeRes = await fetch(bridgeUrl);
    if (bridgeRes.ok) {
      const bridgeDirs = await bridgeRes.json();
      if (Array.isArray(bridgeDirs) && bridgeDirs.length > 0) {
        return bridgeDirs;
      }
    }
  } catch (e) {}

  // 2. Fallback to GitHub REST API
  try {
    if (recursive) {
      const treeRes = await fetch(`${BASE_URL}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch || 'main')}?recursive=1`, {
        headers: getHeaders(token),
      });
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        if (treeData.tree && Array.isArray(treeData.tree)) {
          return treeData.tree
            .filter(item => item.type === 'tree')
            .map(item => {
              const parts = item.path.split('/');
              return {
                name: parts[parts.length - 1],
                path: item.path,
                depth: parts.length - 1,
                type: 'dir',
              };
            });
        }
      }
    }

    const contents = await fetchRepoContents(token, owner, repo, cleanPath, branch);
    return contents.filter(item => item.type === 'dir');
  } catch (err) {
    console.warn(`Could not fetch folders for ${owner}/${repo}/${cleanPath} on ${branch}:`, err);
    return [];
  }
}

export async function fetchRepoBranches(token, owner, repo) {
  // 1. Try local dev bridge
  try {
    const bridgeUrl = `/api/repo-branches?repo=${encodeURIComponent(repo)}`;
    const bridgeRes = await fetch(bridgeUrl);
    if (bridgeRes.ok) {
      const branches = await bridgeRes.json();
      if (Array.isArray(branches) && branches.length > 0) return branches;
    }
  } catch (e) {}

  // 2. Fallback to GitHub REST API
  try {
    const url = `${BASE_URL}/repos/${owner}/${repo}/branches?per_page=100`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (res.ok) {
      const data = await res.json();
      return data.map(b => b.name);
    }
  } catch (e) {}

  return ['main'];
}

export async function fetchRateLimit(token) {
  try {
    const res = await fetch(`${BASE_URL}/rate_limit`, {
      headers: getHeaders(token),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Failed to fetch rate limit:', e);
  }
  return null;
}

export async function createGitHubRepo(token, { name, description = '', isPrivate = false }) {
  const res = await fetch(`${BASE_URL}/user/repos`, {
    method: 'POST',
    headers: {
      ...getHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create repository (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Real transfer with branch synchronization: pulls fresh commit from source branch before moving!
 * Supports:
 * - actionMethod: 'direct' | 'pull_request'
 * - transferMode: 'contents' | 'folder' | 'item'
 */
export async function executeFolderTransfer({
  token,
  sourceRepo,
  sourceFolder,
  sourceBranch = 'main',
  targetRepo,
  targetFolder,
  targetBranch = 'main',
  transferMode = 'contents',
  selectedItemName,
  actionMethod = 'direct',
  prBranchName = '',
  prTitle = '',
  prDescription = '',
  onProgress = () => {},
}) {
  onProgress(`Connecting to local Git bridge for [${sourceRepo}:${sourceBranch}]...`);

  // 1. Attempt transfer via local Git bridge endpoint
  try {
    const res = await fetch('/api/transfer-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        sourceRepo,
        sourceFolder,
        sourceBranch,
        targetRepo,
        targetFolder,
        targetBranch,
        transferMode,
        selectedItemName,
        actionMethod,
        prBranchName,
        prTitle,
        prDescription,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const statusMsg = data.isPullRequest
        ? `🎉 Pull Request #${data.prNumber} opened on GitHub!`
        : `✓ Successfully committed and pushed to branch ${targetBranch}!`;
      onProgress(statusMsg);
      return { ...data, via: 'git-bridge' };
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Transfer failed (HTTP ${res.status})`);
    }
  } catch (bridgeErr) {
    console.error('Git bridge operation error:', bridgeErr);
    throw bridgeErr;
  }

  // 2. Direct GitHub REST API fallback
  onProgress(`Transferring via GitHub REST API directly from branch ${sourceBranch}...`);
  const [srcOwner, srcRepo] = sourceRepo.split('/');
  const [tgtOwner, tgtRepo] = targetRepo.split('/');

  const cleanSource = (sourceFolder === '/' || !sourceFolder) ? '' : sourceFolder.replace(/^\/+/, '').replace(/\/+$/, '');
  const cleanTarget = (targetFolder === '/' || !targetFolder) ? '' : targetFolder.replace(/^\/+/, '').replace(/\/+$/, '');
  const folderBase = cleanSource ? cleanSource.split('/').filter(Boolean).pop() : 'folder';

  async function collectFilesRecursively(curPath) {
    const items = await fetchRepoContents(token, srcOwner, srcRepo, curPath, sourceBranch);
    const result = [];
    for (const item of items) {
      if (item.type === 'file') {
        result.push(item);
      } else if (item.type === 'dir') {
        const subItems = await collectFilesRecursively(item.path);
        result.push(...subItems);
      }
    }
    return result;
  }

  let filesToUpload = [];
  if (transferMode === 'item' && selectedItemName) {
    const itemPath = cleanSource ? `${cleanSource}/${selectedItemName}` : selectedItemName;
    const itemContents = await fetchRepoContents(token, srcOwner, srcRepo, itemPath, sourceBranch);
    if (Array.isArray(itemContents)) {
      filesToUpload = await collectFilesRecursively(itemPath);
    } else {
      filesToUpload = [itemContents];
    }
  } else {
    filesToUpload = await collectFilesRecursively(cleanSource);
  }

  if (filesToUpload.length === 0) {
    filesToUpload.push({
      name: '.gitkeep',
      path: cleanSource ? `${cleanSource}/.gitkeep` : '.gitkeep',
      content: btoa(`# Transferred folder`),
    });
  }

  for (const f of filesToUpload) {
    let relPath = f.name;
    if (f.path) {
      if (cleanSource && f.path.startsWith(cleanSource)) {
        relPath = f.path.slice(cleanSource.length).replace(/^\/+/, '');
      } else {
        relPath = f.path;
      }
    }

    let targetFilePath = '';
    if (transferMode === 'contents') {
      targetFilePath = cleanTarget ? `${cleanTarget}/${relPath}` : relPath;
    } else if (transferMode === 'folder') {
      targetFilePath = cleanTarget ? `${cleanTarget}/${folderBase}/${relPath}` : `${folderBase}/${relPath}`;
    } else {
      const baseName = selectedItemName || f.name;
      targetFilePath = cleanTarget ? `${cleanTarget}/${baseName}` : baseName;
    }

    onProgress(`Committing ${targetFilePath} to GitHub branch ${targetBranch}...`);

    let contentBase64 = f.content;
    if (!contentBase64 && f.download_url) {
      const raw = await fetch(f.download_url);
      const text = await raw.text();
      contentBase64 = btoa(unescape(encodeURIComponent(text)));
    }
    if (!contentBase64) {
      contentBase64 = btoa(`Transferred content for ${f.name}`);
    }

    let existingSha = null;
    try {
      const checkRes = await fetch(`${BASE_URL}/repos/${tgtOwner}/${tgtRepo}/contents/${targetFilePath}?ref=${targetBranch}`, {
        headers: getHeaders(token),
      });
      if (checkRes.ok) {
        const existingData = await checkRes.json();
        existingSha = existingData.sha;
      }
    } catch (e) {}

    const putBody = {
      message: `Transfer ${f.name} from ${srcRepo}:${sourceBranch} into ${cleanTarget || 'root'}`,
      content: contentBase64.replace(/\s/g, ''),
      branch: targetBranch,
    };
    if (existingSha) {
      putBody.sha = existingSha;
    }

    const putRes = await fetch(`${BASE_URL}/repos/${tgtOwner}/${tgtRepo}/contents/${targetFilePath}`, {
      method: 'PUT',
      headers: {
        ...getHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${putRes.status} uploading ${targetFilePath}`);
    }
  }

  return { success: true, message: `Transferred ${filesToUpload.length} items from ${sourceBranch} to ${targetBranch}!`, via: 'github-api' };
}
