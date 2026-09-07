import React, { useState, useEffect } from 'react';
import { fetchRepoFolders, fetchRepoContents, fetchRepoBranches, executeFolderTransfer } from '../services/githubApi';

export default function RepoFolderCombiner({ repos = [], token = '', onNotify = () => {} }) {
  // Source State
  const [sourceRepoFullName, setSourceRepoFullName] = useState('');
  const [sourceBranches, setSourceBranches] = useState(['main']);
  const [selectedSourceBranch, setSelectedSourceBranch] = useState('main');
  const [customSourceBranch, setCustomSourceBranch] = useState('');
  const [sourceFolders, setSourceFolders] = useState([]);
  const [selectedSourceFolder, setSelectedSourceFolder] = useState('/');
  const [customSourceFolder, setCustomSourceFolder] = useState('');
  const [sourceFolderItems, setSourceFolderItems] = useState([]);
  const [selectedSourceItem, setSelectedSourceItem] = useState(null);
  const [transferMode, setTransferMode] = useState('contents'); // 'contents' | 'folder' | 'item'
  const [loadingSourceBranches, setLoadingSourceBranches] = useState(false);
  const [loadingSourceFolders, setLoadingSourceFolders] = useState(false);
  const [loadingSourceItems, setLoadingSourceItems] = useState(false);

  // Target State
  const [targetRepoFullName, setTargetRepoFullName] = useState('');
  const [targetBranches, setTargetBranches] = useState(['main']);
  const [selectedTargetBranch, setSelectedTargetBranch] = useState('main');
  const [customTargetBranch, setCustomTargetBranch] = useState('');
  const [targetFolders, setTargetFolders] = useState([]);
  const [selectedTargetFolder, setSelectedTargetFolder] = useState('/');
  const [targetSubfolders, setTargetSubfolders] = useState([]);
  const [activeDestinationTarget, setActiveDestinationTarget] = useState('/');
  const [customTargetFolder, setCustomTargetFolder] = useState('');
  const [loadingTargetBranches, setLoadingTargetBranches] = useState(false);
  const [loadingTargetFolders, setLoadingTargetFolders] = useState(false);
  const [loadingTargetSubfolders, setLoadingTargetSubfolders] = useState(false);

  // Transfer & Pull Request Mode
  const [actionMethod, setActionMethod] = useState('direct'); // 'direct' | 'pull_request'
  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');

  // Transfer Execution State
  const [transferHistory, setTransferHistory] = useState([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgressText, setTransferProgressText] = useState('');

  // Effective Branches & Folders
  const effectiveSourceBranch = customSourceBranch.trim() !== ''
    ? customSourceBranch.trim()
    : selectedSourceBranch;

  const effectiveSourceFolder = customSourceFolder.trim() !== ''
    ? customSourceFolder.trim().replace(/^\/+/, '')
    : (selectedSourceFolder === '/' ? '' : selectedSourceFolder.replace(/^\/+/, ''));

  const effectiveTargetBranch = customTargetBranch.trim() !== ''
    ? customTargetBranch.trim()
    : selectedTargetBranch;

  const effectiveTargetFolder = customTargetFolder.trim() !== ''
    ? customTargetFolder.trim()
    : activeDestinationTarget;

  // 1. When Source Repo is selected -> Fetch branches
  useEffect(() => {
    if (!sourceRepoFullName) {
      setSourceBranches(['main']);
      setSelectedSourceBranch('main');
      setCustomSourceBranch('');
      setSourceFolders([]);
      setSelectedSourceFolder('/');
      setCustomSourceFolder('');
      setSourceFolderItems([]);
      setSelectedSourceItem(null);
      return;
    }

    const [owner, repo] = sourceRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadSourceBranches() {
      setLoadingSourceBranches(true);
      try {
        const branches = await fetchRepoBranches(token, owner, repo);
        setSourceBranches(branches);

        const preferred = branches.includes('production')
          ? 'production'
          : (branches.includes('main') ? 'main' : branches[0] || 'main');
        setSelectedSourceBranch(preferred);
        setCustomSourceBranch('');
      } catch (err) {
        onNotify(`Error loading source branches: ${err.message}`, 'error');
      } finally {
        setLoadingSourceBranches(false);
      }
    }

    loadSourceBranches();
  }, [sourceRepoFullName, token]);

  // 2. When Effective Source Branch changes -> Fetch ALL recursive nested folders
  useEffect(() => {
    if (!sourceRepoFullName) return;
    const [owner, repo] = sourceRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadBranchFolders() {
      setLoadingSourceFolders(true);
      setSelectedSourceFolder('/');
      setCustomSourceFolder('');
      setTransferMode('contents');
      try {
        const dirs = await fetchRepoFolders(token, owner, repo, '', effectiveSourceBranch, true);
        setSourceFolders(dirs);
      } catch (err) {
        console.warn('Error loading branch folders:', err);
        setSourceFolders([]);
      } finally {
        setLoadingSourceFolders(false);
      }
    }

    loadBranchFolders();
  }, [sourceRepoFullName, effectiveSourceBranch, token]);

  // 3. When Source Folder or Branch changes -> Load folder contents on that branch
  useEffect(() => {
    if (!sourceRepoFullName) return;
    const [owner, repo] = sourceRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadSourceItems() {
      setLoadingSourceItems(true);
      setTransferMode('contents');
      setSelectedSourceItem(null);
      try {
        const items = await fetchRepoContents(token, owner, repo, effectiveSourceFolder, effectiveSourceBranch);
        const validItems = Array.isArray(items) ? items : [items];
        setSourceFolderItems(validItems);

        if (validItems.length > 0) {
          setSelectedSourceItem(validItems[0]);
        }
      } catch (err) {
        console.warn('Could not load folder contents:', err);
        setSourceFolderItems([]);
      } finally {
        setLoadingSourceItems(false);
      }
    }

    loadSourceItems();
  }, [sourceRepoFullName, effectiveSourceFolder, effectiveSourceBranch, token]);

  // 4. When Target Repo is selected -> Fetch branches
  useEffect(() => {
    if (!targetRepoFullName) {
      setTargetBranches(['main']);
      setSelectedTargetBranch('main');
      setCustomTargetBranch('');
      setTargetFolders([]);
      setSelectedTargetFolder('/');
      setTargetSubfolders([]);
      setActiveDestinationTarget('/');
      setCustomTargetFolder('');
      return;
    }

    const [owner, repo] = targetRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadTargetBranches() {
      setLoadingTargetBranches(true);
      try {
        const branches = await fetchRepoBranches(token, owner, repo);
        setTargetBranches(branches);
        setSelectedTargetBranch(branches.includes('main') ? 'main' : branches[0] || 'main');
        setCustomTargetBranch('');
      } catch (err) {
        onNotify(`Error loading target branches: ${err.message}`, 'error');
      } finally {
        setLoadingTargetBranches(false);
      }
    }

    loadTargetBranches();
  }, [targetRepoFullName, token]);

  // 5. When Target Branch changes -> Fetch all recursive folders for target branch
  useEffect(() => {
    if (!targetRepoFullName) return;
    const [owner, repo] = targetRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadTargetFolders() {
      setLoadingTargetFolders(true);
      setSelectedTargetFolder('/');
      setActiveDestinationTarget('/');
      try {
        const dirs = await fetchRepoFolders(token, owner, repo, '', effectiveTargetBranch, true);
        setTargetFolders(dirs);
      } catch (err) {
        console.warn('Error loading target folders:', err);
        setTargetFolders([]);
      } finally {
        setLoadingTargetFolders(false);
      }
    }

    loadTargetFolders();
  }, [targetRepoFullName, effectiveTargetBranch, token]);

  // 6. When Target Folder is inspected -> Fetch nested subfolders ONLY
  useEffect(() => {
    if (!targetRepoFullName) return;
    const [owner, repo] = targetRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadTargetSubfolders() {
      setLoadingTargetSubfolders(true);
      try {
        const cleanPath = selectedTargetFolder === '/' ? '' : selectedTargetFolder;
        const subdirs = await fetchRepoFolders(token, owner, repo, cleanPath, effectiveTargetBranch, false);
        setTargetSubfolders(subdirs);
        setActiveDestinationTarget(selectedTargetFolder);
      } catch (err) {
        console.warn('Could not load subfolders:', err);
        setTargetSubfolders([]);
      } finally {
        setLoadingTargetSubfolders(false);
      }
    }

    loadTargetSubfolders();
  }, [targetRepoFullName, selectedTargetFolder, effectiveTargetBranch, token]);

  // Navigation helpers for Source
  const currentBrowsingFolderName = !effectiveSourceFolder
    ? 'Root'
    : effectiveSourceFolder.split('/').filter(Boolean).pop();

  const sourceBreadcrumbParts = effectiveSourceFolder
    ? effectiveSourceFolder.split('/').filter(Boolean)
    : [];

  function handleNavigateUpSource() {
    if (!effectiveSourceFolder) return;
    const parts = effectiveSourceFolder.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    setSelectedSourceFolder(parentPath || '/');
    setCustomSourceFolder('');
  }

  function handleSourceBreadcrumbClick(idx) {
    if (idx < 0) {
      setSelectedSourceFolder('/');
      setCustomSourceFolder('');
      return;
    }
    const parts = effectiveSourceFolder.split('/').filter(Boolean);
    const newPath = parts.slice(0, idx + 1).join('/');
    setSelectedSourceFolder(newPath);
    setCustomSourceFolder('');
  }

  // Branch categorization
  const sourceStandardBranches = sourceBranches.filter(b => !b.includes('/') && !b.toLowerCase().includes('sub'));
  const sourceNestedBranches = sourceBranches.filter(b => b.includes('/') || b.toLowerCase().includes('sub'));

  const targetStandardBranches = targetBranches.filter(b => !b.includes('/') && !b.toLowerCase().includes('sub'));
  const targetNestedBranches = targetBranches.filter(b => b.includes('/') || b.toLowerCase().includes('sub'));

  // Handle Transfer Execution
  async function handleExecuteTransfer() {
    if (!sourceRepoFullName) {
      onNotify('Please select a source repository.', 'error');
      return;
    }
    if (!targetRepoFullName) {
      onNotify('Please select a target repository.', 'error');
      return;
    }

    setIsTransferring(true);
    const actionDesc = actionMethod === 'pull_request' ? `Opening Pull Request into [${effectiveTargetBranch}]...` : `Synchronizing direct commit into [${effectiveTargetBranch}]...`;
    setTransferProgressText(actionDesc);

    try {
      const result = await executeFolderTransfer({
        token,
        sourceRepo: sourceRepoFullName,
        sourceFolder: effectiveSourceFolder,
        sourceBranch: effectiveSourceBranch,
        targetRepo: targetRepoFullName,
        targetFolder: effectiveTargetFolder,
        targetBranch: effectiveTargetBranch,
        transferMode,
        selectedItemName: selectedSourceItem?.name,
        actionMethod,
        prBranchName: effectiveTargetBranch, // Locked to target branch
        prTitle,
        prDescription,
        onProgress: setTransferProgressText,
      });

      let transferredSummary = '';
      if (transferMode === 'contents') {
        transferredSummary = `Entire Content of /${effectiveSourceFolder || 'root'}`;
      } else if (transferMode === 'folder') {
        transferredSummary = `Folder /${currentBrowsingFolderName}`;
      } else {
        transferredSummary = selectedSourceItem ? selectedSourceItem.name : 'Selected Item';
      }

      const notifMsg = result.isPullRequest
        ? `🎉 Pull Request #${result.prNumber} created directly on GitHub!`
        : `✓ Success: ${transferredSummary} transferred directly to ${targetRepoFullName} [${effectiveTargetBranch}]!`;

      onNotify(notifMsg, 'success');

      // Record in history
      const [tgtOwner, tgtRepo] = targetRepoFullName.split('/');
      const defaultGhUrl = `https://github.com/${tgtOwner}/${tgtRepo}/tree/${encodeURIComponent(result.prBranch || effectiveTargetBranch)}/${effectiveTargetFolder === '/' ? '' : effectiveTargetFolder}`;

      setTransferHistory(prev => [
        {
          id: Date.now(),
          item: transferredSummary,
          sourceRepo: sourceRepoFullName,
          sourceBranch: effectiveSourceBranch,
          targetRepo: targetRepoFullName,
          targetBranch: effectiveTargetBranch,
          targetFolder: effectiveTargetFolder,
          githubUrl: result.prUrl || defaultGhUrl,
          isPullRequest: result.isPullRequest,
          prNumber: result.prNumber,
          prBranch: result.prBranch,
          transferMode,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
      onNotify(`Operation failed: ${err.message}`, 'error');
    } finally {
      setIsTransferring(false);
      setTransferProgressText('');
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    onNotify('Git commands copied to clipboard!', 'success');
  }

  // Generated Git Blueprint Commands
  const srcName = sourceRepoFullName ? sourceRepoFullName.split('/')[1] : 'source-repo';
  const tgtName = targetRepoFullName ? targetRepoFullName.split('/')[1] : 'target-repo';
  const cleanSrcFolder = effectiveSourceFolder.replace(/^\/+/, '');
  const cleanTgtFolder = effectiveTargetFolder === '/' ? '' : effectiveTargetFolder.replace(/^\/+/, '');

  let gitCopyStep = '';
  if (transferMode === 'contents') {
    gitCopyStep = `# Copy entire folder contents into target destination
cp -r ${cleanSrcFolder ? cleanSrcFolder + '/*' : '*'} D:\\Naveen\\${tgtName}\\${cleanTgtFolder}\\`;
  } else if (transferMode === 'folder') {
    gitCopyStep = `# Copy subfolder into target destination
cp -r ${cleanSrcFolder} D:\\Naveen\\${tgtName}\\${cleanTgtFolder}\\`;
  } else {
    gitCopyStep = `# Copy selected item/subfolder into target destination
cp -r ${cleanSrcFolder ? cleanSrcFolder + '/' : ''}${selectedSourceItem?.name || 'item'} D:\\Naveen\\${tgtName}\\${cleanTgtFolder}\\`;
  }

  let generatedGitCommands = '';
  if (actionMethod === 'pull_request') {
    generatedGitCommands = `# 1. Fetch & checkout source branch
cd D:\\Naveen\\${srcName}
git fetch origin ${effectiveSourceBranch} && git checkout ${effectiveSourceBranch} && git pull origin ${effectiveSourceBranch}

# 2. Checkout target branch (${effectiveTargetBranch}) and create PR working branch
cd D:\\Naveen\\${tgtName}
git fetch origin ${effectiveTargetBranch} && git checkout ${effectiveTargetBranch} && git pull origin ${effectiveTargetBranch}
git checkout -B pr/${effectiveTargetBranch}-sync

# 3. Synchronize files into target folder
${gitCopyStep}

# 4. Commit and push feature branch to GitHub
git add .
git commit -m "${prTitle || 'Transfer ' + (cleanSrcFolder || 'root') + ' into ' + (cleanTgtFolder || 'root')}"
git push -u origin pr/${effectiveTargetBranch}-sync

# 5. Open Pull Request on GitHub:
# Merges: pr/${effectiveTargetBranch}-sync ➔ ${effectiveTargetBranch}`;
  } else {
    generatedGitCommands = `# 1. Fetch & checkout source branch
cd D:\\Naveen\\${srcName}
git fetch origin ${effectiveSourceBranch} && git checkout ${effectiveSourceBranch} && git pull origin ${effectiveSourceBranch}

# 2. Synchronize files into target folder
${gitCopyStep}

# 3. Checkout target branch, commit and push directly to GitHub
cd D:\\Naveen\\${tgtName}
git fetch origin ${effectiveTargetBranch} && git checkout ${effectiveTargetBranch} && git pull origin ${effectiveTargetBranch}
git add .
git commit -m "Transfer ${transferMode === 'contents' ? 'entire contents of ' + (cleanSrcFolder || 'root') : (transferMode === 'folder' ? 'folder ' + currentBrowsingFolderName : selectedSourceItem?.name)} from ${srcName}:${effectiveSourceBranch} into ${cleanTgtFolder || 'root'}"
git push origin ${effectiveTargetBranch}`;
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{ padding: '1.5rem 2rem', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)', border: '1px solid var(--border-glow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.6rem' }}>🔀</span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                GitHub Folder Combiner Studio
              </h2>
              <span className="status-badge status-badge-active" style={{ fontSize: '0.75rem' }}>
                Direct Transfer & Pull Requests
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
              Choose whether to <strong>direct transfer</strong> into target branch or <strong>open a Pull Request</strong> for review across repositories.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status:</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--emerald)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--emerald)' }}></span>
              PR & Direct Push Engine Ready
            </span>
          </div>
        </div>
      </div>

      {/* ================= DUAL REPOSITORY GRID ================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.5rem' }}>

        {/* ================= 1. SOURCE COLUMN ================= */}
        <div className="glass-card" style={{ padding: '1.5rem', borderTop: '3px solid var(--cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>1️⃣</span> Source Repository & Folders
            </h3>
            <span className="status-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--cyan)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              Source Origin
            </span>
          </div>

          {/* Source Repo Dropdown */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" htmlFor="source-repo-select">Select Source Repository</label>
            <select
              id="source-repo-select"
              className="styled-select"
              value={sourceRepoFullName}
              onChange={e => {
                setSourceRepoFullName(e.target.value);
                setSelectedSourceFolder('/');
                setCustomSourceFolder('');
                setSelectedSourceItem(null);
              }}
            >
              <option value="">-- Choose Source Repository --</option>
              {repos.map(r => (
                <option key={r.id} value={r.full_name}>
                  {r.private ? '🔒' : '🌐'} {r.name} ({r.full_name})
                </option>
              ))}
            </select>
          </div>

          {/* Source Branch Selection */}
          {sourceRepoFullName && (
            <div className="form-group animate-slide-down" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="form-label" htmlFor="source-branch-select" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>Source Branch</span>
                  {effectiveSourceBranch.includes('/') && (
                    <span style={{ fontSize: '0.68rem', background: 'rgba(6, 182, 212, 0.25)', color: 'var(--cyan)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                      Nested Branch
                    </span>
                  )}
                </label>
                {loadingSourceBranches ? (
                  <span style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>Loading branches...</span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                    {sourceBranches.length} branch(es)
                  </span>
                )}
              </div>

              <select
                id="source-branch-select"
                className="styled-select"
                value={selectedSourceBranch}
                onChange={e => {
                  setSelectedSourceBranch(e.target.value);
                  setCustomSourceBranch('');
                }}
              >
                {sourceNestedBranches.length > 0 && (
                  <optgroup label="🌿 Sub-Branches & Nested Branches">
                    {sourceNestedBranches.map(b => (
                      <option key={b} value={b}>
                        🌿 {b}
                      </option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="🌱 Standard Branches">
                  {sourceStandardBranches.map(b => (
                    <option key={b} value={b}>
                      🌱 {b} {b === 'production' ? '★ (Production)' : ''}
                    </option>
                  ))}
                </optgroup>
              </select>

              {/* Custom branch input */}
              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input font-mono"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  placeholder="Or type custom branch (e.g. envi/sb5)..."
                  value={customSourceBranch}
                  onChange={e => setCustomSourceBranch(e.target.value)}
                />
                {customSourceBranch && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem' }}
                    onClick={() => setCustomSourceBranch('')}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Choose Source Folder Dropdown */}
          {sourceRepoFullName && (
            <div className="form-group animate-slide-down" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="form-label" htmlFor="source-folder-select" style={{ margin: 0 }}>
                  Select Folder / Subfolder ({sourceFolders.length} available)
                </label>
                {loadingSourceFolders && <span style={{ color: 'var(--cyan)', fontSize: '0.75rem' }}>Scanning tree...</span>}
              </div>

              <select
                id="source-folder-select"
                className="styled-select"
                value={selectedSourceFolder}
                onChange={e => {
                  setSelectedSourceFolder(e.target.value);
                  setCustomSourceFolder('');
                }}
              >
                <option value="/">📁 / (Root Directory)</option>
                {sourceFolders.map(dir => {
                  const depth = dir.depth || 0;
                  const indent = '— '.repeat(depth);
                  const icon = depth === 0 ? '📁' : '📂';
                  return (
                    <option key={dir.path} value={dir.path}>
                      {indent}{icon} /{dir.path} {depth > 0 ? '(subfolder)' : ''}
                    </option>
                  );
                })}
              </select>

              {/* Direct Nested Path Input */}
              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input font-mono"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  placeholder="Or type direct nested path (e.g. folder_01/er)..."
                  value={customSourceFolder}
                  onChange={e => setCustomSourceFolder(e.target.value)}
                />
                {customSourceFolder && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem' }}
                    onClick={() => setCustomSourceFolder('')}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Interactive Breadcrumb Bar for Source */}
          {sourceRepoFullName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.35rem',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.45rem 0.75rem',
                marginBottom: '1rem',
                fontSize: '0.8rem',
              }}
            >
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: !effectiveSourceFolder ? 'var(--cyan)' : 'transparent',
                  color: !effectiveSourceFolder ? '#030712' : 'var(--text-muted)',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  fontSize: '0.75rem',
                }}
                onClick={() => handleSourceBreadcrumbClick(-1)}
              >
                📁 Root
              </button>

              {sourceBreadcrumbParts.map((part, idx) => {
                const isLast = idx === sourceBreadcrumbParts.length - 1;
                return (
                  <React.Fragment key={idx}>
                    <span style={{ color: 'var(--text-faint)' }}>/</span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: isLast ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                        color: isLast ? 'var(--cyan)' : 'var(--text-muted)',
                        fontWeight: isLast ? 800 : 500,
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.75rem',
                        border: isLast ? '1px solid var(--cyan)' : 'none',
                      }}
                      onClick={() => handleSourceBreadcrumbClick(idx)}
                    >
                      📂 {part}
                    </button>
                  </React.Fragment>
                );
              })}

              {effectiveSourceFolder && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '0.15rem 0.55rem' }}
                  onClick={handleNavigateUpSource}
                  title="Go Up One Directory"
                >
                  ⬆️ Up
                </button>
              )}
            </div>
          )}

          {/* WHAT TO TRANSFER SELECTION AREA */}
          {sourceRepoFullName && (
            <div className="animate-fade-in" style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📦 Choose Transfer Scope (/{effectiveSourceFolder || 'root'})
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                  Branch: <strong style={{ color: 'var(--cyan)' }}>{effectiveSourceBranch}</strong>
                </span>
              </div>

              {/* OPTION 1: TRANSFER ENTIRE FOLDER CONTENT (RECOMMENDED & DEFAULT) */}
              <div
                id="opt-transfer-entire-contents"
                onClick={() => setTransferMode('contents')}
                className="file-tree-item"
                style={{
                  padding: '0.85rem 1rem',
                  marginBottom: '0.65rem',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  border: transferMode === 'contents' ? '2px solid var(--cyan)' : '1px solid var(--border-subtle)',
                  background: transferMode === 'contents' ? 'rgba(6, 182, 212, 0.14)' : 'rgba(255, 255, 255, 0.02)',
                  boxShadow: transferMode === 'contents' ? '0 0 16px rgba(6, 182, 212, 0.25)' : 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="radio"
                    name="transferScopeMode"
                    checked={transferMode === 'contents'}
                    onChange={() => setTransferMode('contents')}
                    style={{ cursor: 'pointer', accentColor: 'var(--cyan)', transform: 'scale(1.15)' }}
                  />
                  <span style={{ fontSize: '1.3rem' }}>📦</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>Transfer Entire Folder Content</span>
                      <span style={{ fontSize: '0.65rem', background: 'var(--cyan)', color: '#030712', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        RECOMMENDED
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Transfers all files & subfolders from <code>{effectiveSourceBranch}:/{effectiveSourceFolder || 'root'}</code> directly into destination
                      {sourceFolderItems.length > 0 && ` (${sourceFolderItems.length} items: ${sourceFolderItems.map(i => i.name).slice(0, 3).join(', ')}${sourceFolderItems.length > 3 ? '...' : ''})`}
                    </div>
                  </div>
                </div>

                {transferMode === 'contents' && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--cyan)', fontWeight: 800, background: 'rgba(6, 182, 212, 0.25)', padding: '0.25rem 0.65rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                    ✓ Active Selection
                  </span>
                )}
              </div>

              {/* OPTION 2: TRANSFER FOLDER ITSELF AS A DIRECTORY (Only if not at root) */}
              {effectiveSourceFolder !== '' && (
                <div
                  id="opt-transfer-folder-dir"
                  onClick={() => setTransferMode('folder')}
                  className="file-tree-item"
                  style={{
                    padding: '0.75rem 1rem',
                    marginBottom: '0.65rem',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    border: transferMode === 'folder' ? '2px solid var(--primary-light)' : '1px solid var(--border-subtle)',
                    background: transferMode === 'folder' ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.02)',
                    boxShadow: transferMode === 'folder' ? '0 0 16px rgba(99, 102, 241, 0.25)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="radio"
                      name="transferScopeMode"
                      checked={transferMode === 'folder'}
                      onChange={() => setTransferMode('folder')}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary-light)', transform: 'scale(1.15)' }}
                    />
                    <span style={{ fontSize: '1.25rem' }}>📁</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                        Transfer Folder Itself as Directory (/{currentBrowsingFolderName})
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Places <code>{currentBrowsingFolderName}</code> as a subfolder inside destination
                      </div>
                    </div>
                  </div>

                  {transferMode === 'folder' && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary-light)', fontWeight: 800, background: 'rgba(99, 102, 241, 0.25)', padding: '0.25rem 0.65rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                      ✓ Active Selection
                    </span>
                  )}
                </div>
              )}

              {/* OPTION 3: INDIVIDUAL CHILD ITEMS & SUBFOLDERS */}
              <div style={{ marginTop: '0.75rem', marginBottom: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Or select a subfolder or file inside <code>/{effectiveSourceFolder || 'root'}</code>:
              </div>

              <div className="file-preview-box" style={{ maxHeight: '200px' }}>
                {loadingSourceItems ? (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading directory items...</div>
                ) : sourceFolderItems.length > 0 ? (
                  sourceFolderItems.map((item, idx) => {
                    const isSelected = transferMode === 'item' && selectedSourceItem?.name === item.name;
                    return (
                      <div
                        key={idx}
                        id={`source-item-${item.name}`}
                        onClick={() => {
                          setTransferMode('item');
                          setSelectedSourceItem(item);
                        }}
                        className="file-tree-item"
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                          border: isSelected ? '1px solid var(--cyan)' : '1px solid transparent',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            name="transferScopeMode"
                            checked={isSelected}
                            onChange={() => {
                              setTransferMode('item');
                              setSelectedSourceItem(item);
                            }}
                            style={{ cursor: 'pointer', accentColor: 'var(--cyan)' }}
                          />
                          <span style={{ fontSize: '1rem' }}>{item.type === 'dir' ? '📂' : '📄'}</span>
                          <span style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? '#fff' : 'var(--text-main)' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                            ({item.type === 'dir' ? 'subfolder' : 'file'})
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isSelected && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--cyan)', fontWeight: 700, background: 'rgba(6, 182, 212, 0.2)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                              ✓ Selected to Move
                            </span>
                          )}

                          {item.type === 'dir' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}
                              title={`Open ${item.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newPath = effectiveSourceFolder ? `${effectiveSourceFolder}/${item.name}` : item.name;
                                setSelectedSourceFolder(newPath);
                                setCustomSourceFolder('');
                              }}
                            >
                              Open ➔
                            </button>
                          )}

                          {item.type === 'file' && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                              {(item.size ? (item.size / 1024).toFixed(1) : '0.0')} KB
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No items found in this directory.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================= 2. TARGET COLUMN ================= */}
        <div className="glass-card" style={{ padding: '1.5rem', borderTop: '3px solid var(--purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>2️⃣</span> Target Destination & Folders
            </h3>
            <span className="status-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: 'var(--purple)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
              Folders Only
            </span>
          </div>

          {/* Target Repo Dropdown */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" htmlFor="target-repo-select">Select Target Repository</label>
            <select
              id="target-repo-select"
              className="styled-select"
              value={targetRepoFullName}
              onChange={e => {
                setTargetRepoFullName(e.target.value);
                setSelectedTargetFolder('/');
                setActiveDestinationTarget('/');
                setCustomTargetFolder('');
              }}
            >
              <option value="">-- Choose Target Repository --</option>
              {repos.map(r => (
                <option key={r.id} value={r.full_name}>
                  {r.private ? '🔒' : '🌐'} {r.name} ({r.full_name})
                </option>
              ))}
            </select>
          </div>

          {/* Target Branch Dropdown */}
          {targetRepoFullName && (
            <div className="form-group animate-slide-down" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="form-label" htmlFor="target-branch-select" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>Target Base Branch</span>
                  {effectiveTargetBranch.includes('/') && (
                    <span style={{ fontSize: '0.68rem', background: 'rgba(168, 85, 247, 0.25)', color: 'var(--purple)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                      Nested Branch
                    </span>
                  )}
                </label>
                {loadingTargetBranches ? (
                  <span style={{ fontSize: '0.7rem', color: 'var(--purple)' }}>Loading...</span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                    {targetBranches.length} branch(es)
                  </span>
                )}
              </div>

              <select
                id="target-branch-select"
                className="styled-select"
                value={selectedTargetBranch}
                onChange={e => {
                  setSelectedTargetBranch(e.target.value);
                  setCustomTargetBranch('');
                }}
              >
                {targetNestedBranches.length > 0 && (
                  <optgroup label="🌿 Sub-Branches & Nested Branches">
                    {targetNestedBranches.map(b => (
                      <option key={b} value={b}>
                        🌿 {b}
                      </option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="🌱 Standard Branches">
                  {targetStandardBranches.map(b => (
                    <option key={b} value={b}>
                      🌱 {b}
                    </option>
                  ))}
                </optgroup>
              </select>

              {/* Custom target branch input */}
              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input font-mono"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  placeholder="Or specify custom target branch (e.g. feat/v1)..."
                  value={customTargetBranch}
                  onChange={e => setCustomTargetBranch(e.target.value)}
                />
                {customTargetBranch && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem' }}
                    onClick={() => setCustomTargetBranch('')}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Choose Target Folder Dropdown */}
          {targetRepoFullName && (
            <div className="form-group animate-slide-down" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="target-folder-select" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Select Target Directory / Subfolder ({targetFolders.length} found)</span>
                {loadingTargetFolders && <span style={{ color: 'var(--purple)', fontSize: '0.75rem' }}>Scanning...</span>}
              </label>

              <select
                id="target-folder-select"
                className="styled-select"
                value={selectedTargetFolder}
                onChange={e => {
                  setSelectedTargetFolder(e.target.value);
                  setActiveDestinationTarget(e.target.value);
                  setCustomTargetFolder('');
                }}
              >
                <option value="/">📁 / (Root Directory)</option>
                {targetFolders.map(dir => {
                  const depth = dir.depth || 0;
                  const indent = '— '.repeat(depth);
                  const icon = depth === 0 ? '📁' : '📂';
                  return (
                    <option key={dir.path} value={dir.path}>
                      {indent}{icon} /{dir.path} {depth > 0 ? '(subfolder)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Nested Subfolders List & Direct Subfolder Drilldown */}
          {targetRepoFullName && (
            <div className="animate-fade-in" style={{ marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase' }}>
                  Available Destination Subfolders ({selectedTargetFolder === '/' ? 'Root' : selectedTargetFolder})
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--emerald)', fontWeight: 600 }}>
                  ✓ Target: /{effectiveTargetFolder === '/' ? '' : effectiveTargetFolder}
                </span>
              </div>

              <div className="file-preview-box" style={{ maxHeight: '180px' }}>
                <div
                  className="file-tree-item"
                  style={{
                    background: activeDestinationTarget === selectedTargetFolder ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                    border: activeDestinationTarget === selectedTargetFolder ? '1px solid var(--purple)' : '1px solid transparent',
                    cursor: 'pointer',
                    padding: '0.5rem 0.75rem',
                    marginBottom: '0.35rem',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => {
                    setActiveDestinationTarget(selectedTargetFolder);
                    setCustomTargetFolder('');
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="destTargetRadio"
                      checked={activeDestinationTarget === selectedTargetFolder && !customTargetFolder}
                      onChange={() => {
                        setActiveDestinationTarget(selectedTargetFolder);
                        setCustomTargetFolder('');
                      }}
                      style={{ cursor: 'pointer', accentColor: 'var(--purple)' }}
                    />
                    <span style={{ fontSize: '1rem' }}>📁</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>
                      Place in {selectedTargetFolder === '/' ? 'Root (/)' : `/${selectedTargetFolder}`}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--purple)', fontWeight: 700 }}>
                    Direct Target
                  </span>
                </div>

                {loadingTargetSubfolders ? (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Loading subfolders...
                  </div>
                ) : targetSubfolders.length > 0 ? (
                  targetSubfolders.map(dir => {
                    const isSelected = activeDestinationTarget === dir.path && !customTargetFolder;
                    return (
                      <div
                        key={dir.path}
                        className="file-tree-item"
                        style={{
                          background: isSelected ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                          border: isSelected ? '1px solid var(--purple)' : '1px solid transparent',
                          cursor: 'pointer',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onClick={() => {
                          setActiveDestinationTarget(dir.path);
                          setCustomTargetFolder('');
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            name="destTargetRadio"
                            checked={isSelected}
                            onChange={() => {
                              setActiveDestinationTarget(dir.path);
                              setCustomTargetFolder('');
                            }}
                            style={{ cursor: 'pointer', accentColor: 'var(--purple)' }}
                          />
                          <span style={{ fontSize: '1rem' }}>📂</span>
                          <span style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? '#fff' : 'var(--text-main)' }}>
                            {dir.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                            (subfolder)
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isSelected && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--purple)', fontWeight: 700, background: 'rgba(168, 85, 247, 0.25)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                              ✓ Target
                            </span>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}
                            title="Inspect subfolders"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTargetFolder(dir.path);
                            }}
                          >
                            Inspect ➔
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                    No nested subfolders inside {selectedTargetFolder === '/' ? 'Root' : `/${selectedTargetFolder}`}.
                  </div>
                )}
              </div>

              {/* Or Specify Custom Subfolder */}
              <div style={{ marginTop: '0.75rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Or type custom destination subfolder path:</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
                  placeholder="e.g. folder_03/er/deep_target"
                  value={customTargetFolder}
                  onChange={e => setCustomTargetFolder(e.target.value)}
                />
              </div>

              {/* Destination Placement Preview */}
              {effectiveTargetFolder && (
                <div style={{ marginTop: '0.85rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Destination Placement Preview:
                  </div>
                  <div
                    className="file-tree-item"
                    style={{
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px dashed var(--primary-light)',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{transferMode === 'contents' ? '📦' : transferMode === 'folder' ? '📂' : '📄'}</span>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>
                        {transferMode === 'contents'
                          ? `Entire Content of /${effectiveSourceFolder || 'root'}`
                          : transferMode === 'folder'
                          ? `Subfolder /${currentBrowsingFolderName}`
                          : `Item: ${selectedSourceItem?.name || 'Selected Item'}`}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--emerald)', fontWeight: 700 }}>
                      ➔ Target: <code>{targetRepoFullName}:{effectiveTargetBranch}</code> @ /{effectiveTargetFolder === '/' ? '(Repository Root)' : effectiveTargetFolder}
                      {transferMode === 'folder' && `/${currentBrowsingFolderName}`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================= 3. TRANSFER METHOD & EXECUTION ================= */}
      <div className="glass-card" style={{ padding: '1.75rem', borderTop: '3px solid var(--emerald)' }}>
        {/* Method Selector: Direct Transfer vs Pull Request */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🎯</span> Choose Transfer Method (Decide What Should Happen)
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* METHOD 1: DIRECT TRANSFER */}
            <div
              id="opt-method-direct"
              onClick={() => setActionMethod('direct')}
              className="file-tree-item"
              style={{
                padding: '1rem',
                cursor: 'pointer',
                borderRadius: '8px',
                border: actionMethod === 'direct' ? '2px solid var(--emerald)' : '1px solid var(--border-subtle)',
                background: actionMethod === 'direct' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                boxShadow: actionMethod === 'direct' ? '0 0 16px rgba(16, 185, 129, 0.2)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
                <input
                  type="radio"
                  name="actionMethodRadio"
                  checked={actionMethod === 'direct'}
                  onChange={() => setActionMethod('direct')}
                  style={{ cursor: 'pointer', accentColor: 'var(--emerald)', transform: 'scale(1.2)' }}
                />
                <span style={{ fontSize: '1.3rem' }}>🚀</span>
                <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem' }}>
                  Direct Transfer (Push to Branch)
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, paddingLeft: '2.1rem' }}>
                Directly commits and pushes files into <code>{effectiveTargetBranch}</code>. Changes appear immediately on GitHub without review.
              </p>
            </div>

            {/* METHOD 2: CREATE PULL REQUEST */}
            <div
              id="opt-method-pr"
              onClick={() => setActionMethod('pull_request')}
              className="file-tree-item"
              style={{
                padding: '1rem',
                cursor: 'pointer',
                borderRadius: '8px',
                border: actionMethod === 'pull_request' ? '2px solid var(--purple)' : '1px solid var(--border-subtle)',
                background: actionMethod === 'pull_request' ? 'rgba(168, 85, 247, 0.14)' : 'rgba(255, 255, 255, 0.02)',
                boxShadow: actionMethod === 'pull_request' ? '0 0 16px rgba(168, 85, 247, 0.25)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
                <input
                  type="radio"
                  name="actionMethodRadio"
                  checked={actionMethod === 'pull_request'}
                  onChange={() => setActionMethod('pull_request')}
                  style={{ cursor: 'pointer', accentColor: 'var(--purple)', transform: 'scale(1.2)' }}
                />
                <span style={{ fontSize: '1.3rem' }}>🔀</span>
                <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem' }}>
                  Create Pull Request (PR)
                </span>
                <span style={{ fontSize: '0.65rem', background: 'var(--purple)', color: '#fff', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: 'auto' }}>
                  REVIEWABLE
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, paddingLeft: '2.1rem' }}>
                Pushes changes to feature branch and opens a GitHub Pull Request into <code>{effectiveTargetBranch}</code> for safe code review.
              </p>
            </div>
          </div>
        </div>

        {/* PR Details Inputs (Shown only when Pull Request mode is selected) */}
        {actionMethod === 'pull_request' && (
          <div className="animate-slide-down" style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--purple)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📝</span> Pull Request Configuration
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '0.85rem' }}>
              {/* DISABLED BRANCH NAME INPUT - ALWAYS MATCHES TARGET REPO BRANCH */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', margin: 0 }}>
                    Branch Name (Target Repo Branch):
                  </label>
                  <span style={{ fontSize: '0.68rem', color: 'var(--purple)', fontWeight: 700, background: 'rgba(168, 85, 247, 0.2)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                    🔒 Disabled (Locked to Target Branch)
                  </span>
                </div>
                <input
                  type="text"
                  className="form-input font-mono"
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.75rem',
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#94a3b8',
                    cursor: 'not-allowed',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    opacity: 0.85,
                  }}
                  value={effectiveTargetBranch}
                  disabled
                  readOnly
                  title="Branch name is locked to the selected target repository branch"
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>Pull Request Title:</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
                  placeholder={`Transfer ${effectiveSourceFolder ? '/' + effectiveSourceFolder : 'root'} into ${effectiveTargetFolder || 'root'}`}
                  value={prTitle}
                  onChange={e => setPrTitle(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Description / PR Summary Notes (Optional):</label>
              <textarea
                className="form-input"
                rows={2}
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', width: '100%' }}
                placeholder="Automated transfer summary notes..."
                value={prDescription}
                onChange={e => setPrDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Action Button & Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
              {actionMethod === 'pull_request' ? 'Execute & Open Pull Request' : 'Execute Direct Transfer'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {actionMethod === 'pull_request'
                ? `Syncs from ${sourceRepoFullName || 'source'}:${effectiveSourceBranch} and creates a Pull Request into ${targetRepoFullName || 'target'}:${effectiveTargetBranch}!`
                : `Pulls fresh updates from ${sourceRepoFullName || 'source'}:${effectiveSourceBranch} and commits directly into ${targetRepoFullName || 'target'}:${effectiveTargetBranch}!`}
            </p>
          </div>

          <button
            id="btn-execute-folder-transfer"
            className="btn btn-primary"
            onClick={handleExecuteTransfer}
            disabled={!sourceRepoFullName || !targetRepoFullName || isTransferring}
            style={{
              padding: '0.85rem 1.75rem',
              fontSize: '0.95rem',
              fontWeight: 800,
              background: actionMethod === 'pull_request'
                ? 'linear-gradient(135deg, var(--purple) 0%, #7c3aed 100%)'
                : 'linear-gradient(135deg, var(--cyan) 0%, var(--emerald) 100%)',
              color: '#fff',
              boxShadow: actionMethod === 'pull_request'
                ? '0 4px 20px rgba(168, 85, 247, 0.4)'
                : '0 4px 20px rgba(16, 185, 129, 0.4)',
            }}
          >
            {isTransferring ? (
              <>
                <span style={{ animation: 'spinSlow 1s linear infinite', display: 'inline-block' }}>⟳</span>
                {transferProgressText || 'Processing...'}
              </>
            ) : actionMethod === 'pull_request' ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="18" cy="18" r="3"></circle>
                  <circle cx="6" cy="6" r="3"></circle>
                  <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
                  <line x1="6" y1="9" x2="6" y2="21"></line>
                </svg>
                Create Pull Request into [{effectiveTargetBranch}]
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Direct Transfer into [{effectiveTargetBranch}]
              </>
            )}
          </button>
        </div>

        {/* Live Progress Indicator */}
        {isTransferring && transferProgressText && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-sm)', color: 'var(--primary-light)', fontSize: '0.85rem' }}>
            ⏳ {transferProgressText}
          </div>
        )}

        {/* Transfer History with direct GitHub links */}
        {transferHistory.length > 0 && (
          <div style={{ marginBottom: '1.25rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--emerald)', marginBottom: '0.5rem' }}>
              ✓ Completed Operations ({transferHistory.length}):
            </div>
            {transferHistory.map(th => (
              <div key={th.id} style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>
                  {th.isPullRequest ? '🔀' : '🚀'} <strong>{th.item}</strong> (from <code>{th.sourceBranch}</code>) ➔ <strong>{th.targetRepo}</strong>{' '}
                  {th.isPullRequest ? (
                    <span style={{ color: 'var(--purple)', fontWeight: 700 }}>
                      [PR #{th.prNumber || 'Open'} ➔ {th.targetBranch}]
                    </span>
                  ) : (
                    <span>(branch <code>{th.targetBranch}</code>: <code>/{th.targetFolder}</code>)</span>
                  )}
                </span>
                <a
                  href={th.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--cyan)', textDecoration: 'underline', marginLeft: '0.5rem', fontWeight: 700 }}
                >
                  {th.isPullRequest ? 'View Pull Request ↗' : 'View on GitHub ↗'}
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Generated Terminal Blueprint */}
        <div style={{ background: '#070a12', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--emerald)' }}>
              ✓ Git Blueprint ({actionMethod === 'pull_request' ? 'Pull Request Flow' : 'Direct Push Flow'})
            </span>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => copyToClipboard(generatedGitCommands)}
            >
              📋 Copy Commands
            </button>
          </div>

          <pre className="font-mono" style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.7', overflowX: 'auto', margin: 0 }}>
            {generatedGitCommands}
          </pre>
        </div>
      </div>
    </div>
  );
}
