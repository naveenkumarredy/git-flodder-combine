import * as gitService from '../services/gitService.js';

export async function getBranches(req, res) {
  try {
    const repo = req.query.repo || '';
    if (!repo) {
      return res.status(400).json({ error: 'Repository name is required' });
    }
    const branches = await gitService.listRepoBranches(repo);
    return res.json(branches);
  } catch (err) {
    console.error('Error in getBranches:', err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getFolders(req, res) {
  try {
    const repo = req.query.repo || '';
    const branch = req.query.branch || 'main';
    const folderPath = req.query.path || '';
    const isRecursive = req.query.recursive === '1' || req.query.recursive === 'true';

    if (!repo) {
      return res.status(400).json({ error: 'Repository name is required' });
    }

    const folders = await gitService.listRepoFolders(repo, branch, folderPath, isRecursive);
    return res.json(folders);
  } catch (err) {
    console.error('Error in getFolders:', err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getContents(req, res) {
  try {
    const repo = req.query.repo || '';
    const branch = req.query.branch || 'main';
    const folderPath = req.query.path || '';

    if (!repo) {
      return res.status(400).json({ error: 'Repository name is required' });
    }

    const contents = await gitService.listRepoContents(repo, branch, folderPath);
    return res.json(contents);
  } catch (err) {
    console.error('Error in getContents:', err);
    return res.status(500).json({ error: err.message });
  }
}

export async function transferFolder(req, res) {
  try {
    const {
      sourceRepo,
      sourceFolder,
      sourceBranch,
      targetRepo,
      targetFolder,
      targetBranch,
      transferMode = 'contents',
      selectedItemName,
      actionMethod = 'direct', // 'direct' | 'pull_request'
      prBranchName,
      prTitle,
      prDescription,
      token,
    } = req.body;

    if (!sourceRepo || !targetRepo) {
      return res.status(400).json({ error: 'sourceRepo and targetRepo are required' });
    }

    const result = await gitService.executeTransfer({
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
      token,
    });

    return res.json(result);
  } catch (err) {
    console.error('Error in transferFolder:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
