import { exec, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { BASE_WORKSPACE_DIR } from '../config/constants.js';

function execPromise(cmd, options) {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        resolve({ error, stdout, stderr });
      } else {
        resolve({ error: null, stdout, stderr });
      }
    });
  });
}

/**
 * Retrieves authenticated GitHub token from Git Credential Manager or environment variables
 */
export function getSystemGitHubToken() {
  try {
    const res = spawnSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      windowsHide: true,
    });
    if (res.stdout) {
      for (const line of res.stdout.split('\n')) {
        if (line.startsWith('password=')) {
          const pwd = line.slice('password='.length).trim();
          if (pwd) return pwd;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

/**
 * Creates a Pull Request directly on GitHub via REST API
 */
async function createGitHubPullRequest({ token, owner, repo, title, body, head, base }) {
  const candidateTokens = [];
  if (token && token.trim()) candidateTokens.push(token.trim());
  const sysToken = getSystemGitHubToken();
  if (sysToken && !candidateTokens.includes(sysToken)) candidateTokens.push(sysToken);

  if (candidateTokens.length === 0) {
    throw new Error('A GitHub Personal Access Token is required to create a Pull Request directly on GitHub.');
  }

  let lastError = null;

  for (const activeToken of candidateTokens) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'GitFolderCombiner/1.0',
        },
        body: JSON.stringify({
          title,
          body,
          head,
          base,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        return data;
      }

      // If a pull request already exists for this branch, fetch the open PR directly
      const errorList = data.errors || [];
      const isAlreadyExists = errorList.some(e => e.message && e.message.includes('A pull request already exists'));
      if (isAlreadyExists) {
        const existingPrsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${head}&state=open`, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${activeToken}`,
            'User-Agent': 'GitFolderCombiner/1.0',
          },
        });
        if (existingPrsRes.ok) {
          const prs = await existingPrsRes.json();
          if (Array.isArray(prs) && prs.length > 0) {
            return prs[0];
          }
        }
      }

      const errMsg = data.message || (data.errors ? JSON.stringify(data.errors) : `HTTP ${res.status}`);
      lastError = new Error(`GitHub PR API error: ${errMsg}`);

      // If token scope or access error (403/401), try next candidate token
      if (res.status === 403 || res.status === 401) {
        console.warn(`Token attempted failed with HTTP ${res.status} (${errMsg}), trying fallback credential...`);
        continue;
      } else {
        throw lastError;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to create Pull Request directly on GitHub.');
}

/**
 * Lists all branches (standard, sub-branches, and nested branches)
 */
export async function listRepoBranches(repo) {
  const repoName = repo.includes('/') ? repo.split('/')[1] : repo;
  const repoDir = path.join(BASE_WORKSPACE_DIR, repoName);

  if (!fs.existsSync(repoDir)) {
    return ['main'];
  }

  const { error, stdout } = await execPromise('git fetch --all && git branch -a', { cwd: repoDir });
  if (error || !stdout) {
    return ['main'];
  }

  const lines = stdout.split('\n');
  const branchSet = new Set();

  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.includes('->')) continue;
    line = line.replace(/^\*\s*/, '');
    line = line.replace(/^remotes\/origin\//, '');
    if (line) branchSet.add(line);
  }

  const branches = Array.from(branchSet).sort((a, b) => {
    const order = { main: 1, master: 2, production: 3 };
    const orderA = order[a] || 100;
    const orderB = order[b] || 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  return branches.length > 0 ? branches : ['main'];
}

/**
 * Lists folders either recursively or for an immediate path on a specific branch
 */
export async function listRepoFolders(repo, branch = 'main', folderPath = '', isRecursive = false) {
  const repoName = repo.includes('/') ? repo.split('/')[1] : repo;
  const repoDir = path.join(BASE_WORKSPACE_DIR, repoName);
  const cleanPath = (folderPath === '/' || !folderPath) ? '' : folderPath.replace(/^\/+/, '').replace(/\/+$/, '');

  if (!fs.existsSync(repoDir)) {
    return [];
  }

  const activeBranch = branch || 'main';

  // 1. Recursive Tree Listing (All nested folders in hierarchy)
  if (isRecursive) {
    let { error, stdout } = await execPromise(`git ls-tree -d -r --name-only "${activeBranch}"`, { cwd: repoDir });
    if (error || !stdout) {
      const originResult = await execPromise(`git ls-tree -d -r --name-only "origin/${activeBranch}"`, { cwd: repoDir });
      if (!originResult.error && originResult.stdout) {
        stdout = originResult.stdout;
      }
    }

    if (stdout) {
      const lines = stdout.split('\n');
      const dirs = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line === '.git' || line.startsWith('.git/')) continue;
        const parts = line.split('/');
        const name = parts[parts.length - 1];
        dirs.push({
          name,
          path: line,
          depth: parts.length - 1,
          type: 'dir',
        });
      }
      return dirs;
    }
    return [];
  }

  // 2. Immediate Child Folders for a specific path
  const treeRef = cleanPath ? `${activeBranch}:${cleanPath}` : activeBranch;
  let { error, stdout } = await execPromise(`git ls-tree "${treeRef}"`, { cwd: repoDir });

  if (error || !stdout) {
    const originTreeRef = cleanPath ? `origin/${activeBranch}:${cleanPath}` : `origin/${activeBranch}`;
    const originResult = await execPromise(`git ls-tree "${originTreeRef}"`, { cwd: repoDir });
    if (!originResult.error && originResult.stdout) {
      stdout = originResult.stdout;
    }
  }

  if (stdout) {
    const lines = stdout.split('\n');
    const dirs = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 4 && parts[1] === 'tree') {
        const name = line.substring(line.indexOf('\t') + 1).trim();
        if (name && name !== '.git' && name !== 'node_modules') {
          dirs.push({
            name,
            path: cleanPath ? `${cleanPath}/${name}` : name,
            type: 'dir',
          });
        }
      }
    }
    return dirs;
  }

  // Fallback to local filesystem scan
  const targetDir = path.join(repoDir, cleanPath);
  if (fs.existsSync(targetDir)) {
    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules')
        .map(e => ({
          name: e.name,
          path: cleanPath ? `${cleanPath}/${e.name}` : e.name,
          type: 'dir',
        }));
    } catch (e) {
      return [];
    }
  }

  return [];
}

/**
 * Lists contents (files & directories with sizes) on a specific branch and path
 */
export async function listRepoContents(repo, branch = 'main', folderPath = '') {
  const repoName = repo.includes('/') ? repo.split('/')[1] : repo;
  const repoDir = path.join(BASE_WORKSPACE_DIR, repoName);
  const cleanPath = (folderPath === '/' || !folderPath) ? '' : folderPath.replace(/^\/+/, '').replace(/\/+$/, '');

  if (!fs.existsSync(repoDir)) {
    return [];
  }

  const activeBranch = branch || 'main';
  const treeRef = cleanPath ? `${activeBranch}:${cleanPath}` : activeBranch;

  let { error, stdout } = await execPromise(`git ls-tree -l "${treeRef}"`, { cwd: repoDir });

  if (error || !stdout) {
    const originTreeRef = cleanPath ? `origin/${activeBranch}:${cleanPath}` : `origin/${activeBranch}`;
    const originResult = await execPromise(`git ls-tree -l "${originTreeRef}"`, { cwd: repoDir });
    if (!originResult.error && originResult.stdout) {
      stdout = originResult.stdout;
    }
  }

  if (stdout) {
    const lines = stdout.split('\n');
    const items = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const tabIdx = line.indexOf('\t');
      if (tabIdx === -1) continue;
      const meta = line.substring(0, tabIdx).trim().split(/\s+/);
      const name = line.substring(tabIdx + 1).trim();
      if (!name || name === '.git' || name === 'node_modules') continue;

      const itemType = meta[1] === 'tree' ? 'dir' : 'file';
      const size = meta[3] && meta[3] !== '-' ? parseInt(meta[3], 10) : 0;

      items.push({
        name,
        path: cleanPath ? `${cleanPath}/${name}` : name,
        type: itemType,
        size,
      });
    }
    return items;
  }

  return [];
}

/**
 * Transfers entire folder contents, subfolder directory, or specific items across repositories.
 * Supports:
 * 1. actionMethod = 'direct' (commits and pushes directly to targetBranch)
 * 2. actionMethod = 'pull_request' (creates feature branch, pushes changes, and opens a GitHub Pull Request)
 */
export async function executeTransfer({
  sourceRepo,
  sourceFolder,
  sourceBranch = 'main',
  targetRepo,
  targetFolder,
  targetBranch = 'main',
  transferMode = 'contents',
  selectedItemName,
  actionMethod = 'direct', // 'direct' | 'pull_request'
  prBranchName,
  prTitle,
  prDescription,
  token,
}) {
  const srcName = sourceRepo.includes('/') ? sourceRepo.split('/')[1] : sourceRepo;
  const tgtName = targetRepo.includes('/') ? targetRepo.split('/')[1] : targetRepo;
  const [tgtOwner, tgtRepoName] = targetRepo.includes('/') ? targetRepo.split('/') : ['naveenkumarredy', tgtName];

  const srcRepoDir = path.join(BASE_WORKSPACE_DIR, srcName);
  const tgtRepoDir = path.join(BASE_WORKSPACE_DIR, tgtName);

  if (!fs.existsSync(srcRepoDir)) {
    throw new Error(`Source repository directory not found: ${srcRepoDir}`);
  }
  if (!fs.existsSync(tgtRepoDir)) {
    throw new Error(`Target repository directory not found: ${tgtRepoDir}`);
  }

  const branchToSync = sourceBranch || 'main';
  const baseTargetBranch = targetBranch || 'main';
  const isPrMode = actionMethod === 'pull_request';

  // 1. Fetch & checkout source branch (supports nested branches)
  const srcSyncCmd = `git fetch origin ${branchToSync} && (git checkout ${branchToSync} || git checkout -b ${branchToSync} origin/${branchToSync}) && git pull origin ${branchToSync}`;
  await execPromise(srcSyncCmd, { cwd: srcRepoDir });

  const cleanSourcePath = (sourceFolder === '/' || !sourceFolder) ? '' : sourceFolder.replace(/^\/+/, '').replace(/\/+$/, '');
  const srcItemPath = path.join(BASE_WORKSPACE_DIR, srcName, cleanSourcePath);

  if (!fs.existsSync(srcItemPath)) {
    throw new Error(`Source path not found on branch ${branchToSync}: ${srcItemPath}`);
  }

  // 2. Determine target branch to push to
  let activePushBranch = baseTargetBranch;
  let generatedPrBranch = '';

  if (isPrMode) {
    const rawName = selectedItemName || (cleanSourcePath ? cleanSourcePath.split('/').pop() : 'transfer');
    const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const isDistinctCustomBranch = prBranchName && prBranchName.trim() && prBranchName.trim() !== baseTargetBranch;
    generatedPrBranch = isDistinctCustomBranch
      ? prBranchName.trim()
      : `pr/${baseTargetBranch}-${safeName}-${Date.now().toString().slice(-4)}`;
    activePushBranch = generatedPrBranch;

    // Checkout base target branch, pull latest, then create new feature branch
    const tgtBranchPrepCmd = `git fetch origin ${baseTargetBranch} && (git checkout ${baseTargetBranch} || git checkout -b ${baseTargetBranch} origin/${baseTargetBranch}) && (git pull origin ${baseTargetBranch} || true) && git checkout -B ${activePushBranch}`;
    await execPromise(tgtBranchPrepCmd, { cwd: tgtRepoDir });
  } else {
    // Direct mode: checkout base target branch and pull
    const tgtSyncCmd = `git fetch origin ${baseTargetBranch} && (git checkout ${baseTargetBranch} || git checkout -b ${baseTargetBranch} origin/${baseTargetBranch} || git checkout -b ${baseTargetBranch}) && (git pull --rebase origin ${baseTargetBranch} || git pull origin ${baseTargetBranch} || true)`;
    await execPromise(tgtSyncCmd, { cwd: tgtRepoDir });
  }

  // 3. Copy files according to transferMode
  const cleanTgtFolder = (targetFolder === '/' || !targetFolder) ? '' : targetFolder.replace(/^\/+/, '').replace(/\/+$/, '');
  const tgtBaseDir = path.join(BASE_WORKSPACE_DIR, tgtName, cleanTgtFolder);
  fs.mkdirSync(tgtBaseDir, { recursive: true });

  let commitMsg = '';

  if (transferMode === 'contents') {
    const entries = fs.readdirSync(srcItemPath);
    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules') continue;
      const srcChild = path.join(srcItemPath, entry);
      const tgtChild = path.join(tgtBaseDir, entry);
      fs.cpSync(srcChild, tgtChild, { recursive: true, force: true });
    }
    const folderDesc = cleanSourcePath ? `folder ${cleanSourcePath}` : 'root';
    commitMsg = `Transfer entire contents of ${folderDesc} from ${srcName}:${branchToSync} into ${cleanTgtFolder || 'root'} on ${activePushBranch}`;
  } else if (transferMode === 'folder') {
    const folderName = path.basename(srcItemPath) || 'folder';
    const tgtDestDir = path.join(tgtBaseDir, folderName);
    fs.mkdirSync(tgtDestDir, { recursive: true });
    fs.cpSync(srcItemPath, tgtDestDir, { recursive: true, force: true });
    commitMsg = `Transfer folder ${folderName} from ${srcName}:${branchToSync} into ${cleanTgtFolder || 'root'} on ${activePushBranch}`;
  } else {
    const itemName = selectedItemName || path.basename(srcItemPath);
    const itemSrcPath = selectedItemName ? path.join(srcItemPath, selectedItemName) : srcItemPath;
    if (!fs.existsSync(itemSrcPath)) {
      throw new Error(`Item not found: ${itemSrcPath}`);
    }
    const stat = fs.statSync(itemSrcPath);
    if (stat.isDirectory()) {
      const tgtDestDir = path.join(tgtBaseDir, itemName);
      fs.mkdirSync(tgtDestDir, { recursive: true });
      fs.cpSync(itemSrcPath, tgtDestDir, { recursive: true, force: true });
    } else {
      fs.copyFileSync(itemSrcPath, path.join(tgtBaseDir, itemName));
    }
    commitMsg = `Transfer ${itemName} from ${srcName}:${branchToSync} into ${cleanTgtFolder || 'root'} on ${activePushBranch}`;
  }

  // 4. Commit and push
  const { stdout: statusOut } = await execPromise('git status --porcelain', { cwd: tgtRepoDir });
  if (!statusOut || !statusOut.trim()) {
    if (isPrMode) {
      const defaultPrTitle = prTitle && prTitle.trim()
        ? prTitle.trim()
        : `Transfer ${selectedItemName || (cleanSourcePath ? '/' + cleanSourcePath : 'root contents')} from ${srcName}:${branchToSync} into ${cleanTgtFolder || 'root'}`;

      const defaultPrBody = prDescription && prDescription.trim()
        ? prDescription.trim()
        : `Automated Pull Request from \`${sourceRepo}:${branchToSync}\` into \`${targetRepo}:${baseTargetBranch}\`.\n\n- **Source Folder**: \`/${cleanSourcePath || 'root'}\`\n- **Target Folder**: \`/${cleanTgtFolder || 'root'}\`\n- **Transfer Mode**: \`${transferMode}\`\n- **Branch**: \`${activePushBranch}\` -> \`${baseTargetBranch}\``;

      const prResult = await createGitHubPullRequest({
        token,
        owner: tgtOwner,
        repo: tgtRepoName,
        title: defaultPrTitle,
        body: defaultPrBody,
        head: activePushBranch,
        base: baseTargetBranch,
      });

      if (prResult && prResult.html_url) {
        return {
          success: true,
          isPullRequest: true,
          prNumber: prResult.number,
          prUrl: prResult.html_url,
          prBranch: activePushBranch,
          baseBranch: baseTargetBranch,
          message: `🎉 Pull Request #${prResult.number} opened successfully on GitHub!`,
          stdout: 'Existing changes submitted as Pull Request.',
        };
      }
    }
    return {
      success: true,
      isPullRequest: isPrMode,
      prBranch: activePushBranch,
      baseBranch: baseTargetBranch,
      message: `All contents from branch ${branchToSync} are already up-to-date on target branch ${baseTargetBranch}!`,
      stdout: 'Working tree clean, no new changes needed.',
    };
  }

  const pushCmd = `git add . && git commit -m "${commitMsg}" && git push -u origin ${activePushBranch}`;
  let pushResult = await execPromise(pushCmd, { cwd: tgtRepoDir });

  if (pushResult.error) {
    const retryCmd = `git pull --rebase origin ${activePushBranch} && git push -u origin ${activePushBranch}`;
    pushResult = await execPromise(retryCmd, { cwd: tgtRepoDir });
    if (pushResult.error) {
      throw new Error(pushResult.stderr || pushResult.error.message);
    }
  }

  // 5. If PR Mode: Open Pull Request directly via GitHub REST API
  if (isPrMode) {
    const defaultPrTitle = prTitle && prTitle.trim()
      ? prTitle.trim()
      : `Transfer ${selectedItemName || (cleanSourcePath ? '/' + cleanSourcePath : 'root contents')} from ${srcName}:${branchToSync} into ${cleanTgtFolder || 'root'}`;

    const defaultPrBody = prDescription && prDescription.trim()
      ? prDescription.trim()
      : `Automated Pull Request from \`${sourceRepo}:${branchToSync}\` into \`${targetRepo}:${baseTargetBranch}\`.\n\n- **Source Folder**: \`/${cleanSourcePath || 'root'}\`\n- **Target Folder**: \`/${cleanTgtFolder || 'root'}\`\n- **Transfer Mode**: \`${transferMode}\`\n- **Branch**: \`${activePushBranch}\` -> \`${baseTargetBranch}\``;

    const prResult = await createGitHubPullRequest({
      token,
      owner: tgtOwner,
      repo: tgtRepoName,
      title: defaultPrTitle,
      body: defaultPrBody,
      head: activePushBranch,
      base: baseTargetBranch,
    });

    if (prResult && prResult.html_url) {
      return {
        success: true,
        isPullRequest: true,
        prNumber: prResult.number,
        prUrl: prResult.html_url,
        prBranch: activePushBranch,
        baseBranch: baseTargetBranch,
        message: `🎉 Pull Request #${prResult.number} opened successfully on GitHub!`,
        stdout: pushResult.stdout,
      };
    } else {
      throw new Error(`Failed to create Pull Request directly on GitHub.`);
    }
  }

  return {
    success: true,
    isPullRequest: false,
    message: `Successfully committed and pushed directly to branch ${baseTargetBranch} on GitHub!`,
    stdout: pushResult.stdout,
  };
}
