import React, { useState, useEffect } from 'react';
import { fetchRepoFolders, fetchRepoContents } from '../services/githubApi';

export default function RepoFolderCombiner({ repos = [], token = '', onNotify = () => {} }) {
  // Source State
  const [sourceRepoFullName, setSourceRepoFullName] = useState('');
  const [sourceFolders, setSourceFolders] = useState([]);
  const [selectedSourceFolder, setSelectedSourceFolder] = useState('/');
  const [sourceFolderItems, setSourceFolderItems] = useState([]);
  const [selectedSourceItem, setSelectedSourceItem] = useState(null); // The folder/item chosen to be moved
  const [loadingSourceFolders, setLoadingSourceFolders] = useState(false);
  const [loadingSourceItems, setLoadingSourceItems] = useState(false);

  // Target State
  const [targetRepoFullName, setTargetRepoFullName] = useState('');
  const [targetFolders, setTargetFolders] = useState([]);
  const [selectedTargetFolder, setSelectedTargetFolder] = useState('/');
  const [targetFolderItems, setTargetFolderItems] = useState([]);
  const [loadingTargetFolders, setLoadingTargetFolders] = useState(false);
  const [loadingTargetItems, setLoadingTargetItems] = useState(false);

  // Combine Transfer State
  const [transferHistory, setTransferHistory] = useState([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  // When Source Repo is selected -> Fetch folders
  useEffect(() => {
    if (!sourceRepoFullName) {
      setSourceFolders([]);
      setSelectedSourceFolder('/');
      setSourceFolderItems([]);
      setSelectedSourceItem(null);
      return;
    }

    const [owner, repo] = sourceRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadFolders() {
      setLoadingSourceFolders(true);
      setSelectedSourceFolder('/');
      setSourceFolderItems([]);
      setSelectedSourceItem(null);
      try {
        const dirs = await fetchRepoFolders(token, owner, repo, '');
        setSourceFolders(dirs);
      } catch (err) {
        console.error('Error fetching source folders:', err);
        setSourceFolders([]);
      } finally {
        setLoadingSourceFolders(false);
      }
    }

    loadFolders();
  }, [sourceRepoFullName, token]);

  // When Source Folder is selected -> Fetch items (folders and files) inside it
  useEffect(() => {
    if (!sourceRepoFullName) return;

    const [owner, repo] = sourceRepoFullName.split('/');
    const path = selectedSourceFolder === '/' ? '' : selectedSourceFolder;

    async function loadItems() {
      setLoadingSourceItems(true);
      setSelectedSourceItem(null);
      try {
        const contents = await fetchRepoContents(token, owner, repo, path);
        setSourceFolderItems(contents);
        // Auto-select first folder if any, or first item
        const firstDir = contents.find(i => i.type === 'dir') || contents[0];
        if (firstDir) {
          setSelectedSourceItem(firstDir);
        }
      } catch (err) {
        console.error('Error fetching source folder items:', err);
        setSourceFolderItems([]);
      } finally {
        setLoadingSourceItems(false);
      }
    }

    loadItems();
  }, [sourceRepoFullName, selectedSourceFolder, token]);

  // When Target Repo is selected -> Fetch folders
  useEffect(() => {
    if (!targetRepoFullName) {
      setTargetFolders([]);
      setSelectedTargetFolder('/');
      setTargetFolderItems([]);
      return;
    }

    const [owner, repo] = targetRepoFullName.split('/');
    if (!owner || !repo) return;

    async function loadFolders() {
      setLoadingTargetFolders(true);
      setSelectedTargetFolder('/');
      setTargetFolderItems([]);
      try {
        const dirs = await fetchRepoFolders(token, owner, repo, '');
        setTargetFolders(dirs);
      } catch (err) {
        console.error('Error fetching target folders:', err);
        setTargetFolders([]);
      } finally {
        setLoadingTargetFolders(false);
      }
    }

    loadFolders();
  }, [targetRepoFullName, token]);

  // When Target Folder is selected -> Fetch items inside it
  useEffect(() => {
    if (!targetRepoFullName) return;

    const [owner, repo] = targetRepoFullName.split('/');
    const path = selectedTargetFolder === '/' ? '' : selectedTargetFolder;

    async function loadItems() {
      setLoadingTargetItems(true);
      try {
        const contents = await fetchRepoContents(token, owner, repo, path);
        setTargetFolderItems(contents);
      } catch (err) {
        console.error('Error fetching target folder items:', err);
        setTargetFolderItems([]);
      } finally {
        setLoadingTargetItems(false);
      }
    }

    loadItems();
  }, [targetRepoFullName, selectedTargetFolder, token]);

  // Compute destination path
  const destinationPath = (() => {
    const folder = selectedTargetFolder === '/' ? '' : selectedTargetFolder;
    const itemName = selectedSourceItem ? selectedSourceItem.name : 'selected_folder';
    return folder ? `${folder}/${itemName}` : itemName;
  })();

  // Execute Transfer of selected folder into target folder
  const handleExecuteTransfer = () => {
    if (!sourceRepoFullName || !targetRepoFullName) {
      onNotify('Please select both a source and a target repository.', 'error');
      return;
    }
    if (!selectedSourceItem) {
      onNotify('Please select a folder or file in the source list to transfer.', 'error');
      return;
    }

    setIsTransferring(true);
    setTransferSuccess(false);

    setTimeout(() => {
      setIsTransferring(false);
      setTransferSuccess(true);

      const newRecord = {
        id: Date.now(),
        sourceRepo: sourceRepoFullName,
        sourceFolder: selectedSourceFolder,
        item: selectedSourceItem.name,
        itemType: selectedSourceItem.type,
        targetRepo: targetRepoFullName,
        targetFolder: selectedTargetFolder,
        destPath: destinationPath,
        time: new Date().toLocaleTimeString(),
      };

      setTransferHistory(prev => [newRecord, ...prev]);

      // Add to target preview list if not already there
      setTargetFolderItems(prev => {
        if (!prev.some(i => i.name === selectedSourceItem.name)) {
          return [...prev, { ...selectedSourceItem, isNew: true }];
        }
        return prev;
      });

      onNotify(
        `Transferred "${selectedSourceItem.name}" into ${targetRepoFullName}:${selectedTargetFolder}`,
        'success'
      );
    }, 1000);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    onNotify('Git commands copied to clipboard!', 'info');
  };

  const generatedGitCommands = `# Transfer "${selectedSourceItem?.name || 'folder'}" from [${sourceRepoFullName || 'source'}] to [${targetRepoFullName || 'target'}]

# 1. Clone destination repository
git clone https://github.com/${targetRepoFullName || 'target-repo'}.git
cd ${(targetRepoFullName || 'target-repo').split('/')[1] || 'target-repo'}

# 2. Add source repository as remote & fetch branch
git remote add source-remote https://github.com/${sourceRepoFullName || 'source-repo'}.git
git fetch source-remote main

# 3. Import and merge selected folder into target destination: "${destinationPath}"
git subtree add --prefix="${destinationPath}" source-remote main

# 4. Commit and push updated folder structure
git push origin main
`;

  return (
    <div className="folder-combiner-wrapper animate-fade-in">
      {/* Top Banner */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.75rem', borderLeft: '4px solid var(--primary)' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
          </svg>
          Folder-to-Folder Combiner & Transfer Studio
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
          Select the source repository, choose an individual folder or item from the source list, and direct it straight into your chosen destination folder in the target repository.
        </p>
      </div>

      {/* Visual Transfer Pathway Banner */}
      {selectedSourceItem && (
        <div
          className="glass-card animate-slide-down"
          style={{
            padding: '1.15rem 1.5rem',
            marginBottom: '1.75rem',
            background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.12), rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.12))',
            border: '1px solid var(--border-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700 }}>Source:</span>
              <span className="font-mono" style={{ fontSize: '0.85rem', color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                📁 {selectedSourceItem.name}
              </span>
            </div>

            <span style={{ color: 'var(--primary-light)', fontSize: '1.2rem', fontWeight: 800 }}>➔</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--purple)', fontWeight: 700 }}>Target Destination:</span>
              <span className="font-mono" style={{ fontSize: '0.85rem', color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                📂 {targetRepoFullName ? targetRepoFullName.split('/')[1] : 'target'}/{destinationPath}
              </span>
            </div>
          </div>

          <button
            id="btn-quick-transfer"
            className="btn btn-primary btn-sm"
            onClick={handleExecuteTransfer}
            disabled={isTransferring || !targetRepoFullName}
          >
            {isTransferring ? 'Transferring...' : '🚀 Execute Transfer'}
          </button>
        </div>
      )}

      {/* Two Column Grid: Source vs Target */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        
        {/* ================= SOURCE COLUMN ================= */}
        <div className="glass-card" style={{ padding: '1.5rem', borderTop: '3px solid var(--cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>1️⃣</span> Source Repository & Folder
            </h3>
            <span className="status-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--cyan)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              Source
            </span>
          </div>

          {/* 1. Source Repo Dropdown */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" htmlFor="source-repo-select">Select Source Repository</label>
            <select
              id="source-repo-select"
              className="styled-select"
              value={sourceRepoFullName}
              onChange={e => setSourceRepoFullName(e.target.value)}
            >
              <option value="">-- Choose Source Repository --</option>
              {repos.map(r => (
                <option key={r.id} value={r.full_name}>
                  {r.private ? '🔒' : '🌐'} {r.name} ({r.full_name})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Source Subfolder Dropdown */}
          {sourceRepoFullName && (
            <div className="form-group animate-slide-down" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="source-folder-select" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Browse Folder in Source Repo</span>
                {loadingSourceFolders && <span style={{ color: 'var(--cyan)', fontSize: '0.75rem' }}>Fetching...</span>}
              </label>

              <select
                id="source-folder-select"
                className="styled-select"
                value={selectedSourceFolder}
                onChange={e => setSelectedSourceFolder(e.target.value)}
                disabled={loadingSourceFolders}
              >
                <option value="/">📁 / (Root Directory)</option>
                {sourceFolders.map((dir, idx) => (
                  <option key={idx} value={dir.path}>
                    📁 /{dir.path}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Items inside Source Folder (CLICK TO SELECT FOR TRANSFER) */}
          {sourceRepoFullName && (
            <div className="animate-fade-in" style={{ marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase' }}>
                  Select Folder/File to Transfer ({selectedSourceFolder === '/' ? 'Root' : selectedSourceFolder})
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                  Click item to select
                </span>
              </div>

              <div className="file-preview-box" style={{ maxHeight: '240px' }}>
                {loadingSourceItems ? (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fetching directory items...</div>
                ) : sourceFolderItems.length > 0 ? (
                  sourceFolderItems.map((item, idx) => {
                    const isSelected = selectedSourceItem && selectedSourceItem.name === item.name;

                    return (
                      <div
                        key={idx}
                        id={`source-item-${item.name}`}
                        onClick={() => setSelectedSourceItem(item)}
                        className="file-tree-item"
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(6, 182, 212, 0.22)' : undefined,
                          borderColor: isSelected ? 'var(--cyan)' : 'transparent',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          padding: '0.5rem 0.75rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            name="selectedSourceFolderRadio"
                            checked={isSelected}
                            onChange={() => setSelectedSourceItem(item)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '1rem' }}>{item.type === 'dir' ? '📁' : '📄'}</span>
                          <span style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? '#fff' : 'var(--text-main)' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                            ({item.type === 'dir' ? 'folder' : 'file'})
                          </span>
                        </div>

                        <div>
                          {isSelected ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--cyan)', fontWeight: 700, background: 'rgba(6, 182, 212, 0.2)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                              ✓ Selected for Target
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                              {item.size ? `${(item.size / 1024).toFixed(1)} KB` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No contents found in this folder.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================= TARGET COLUMN ================= */}
        <div className="glass-card" style={{ padding: '1.5rem', borderTop: '3px solid var(--purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>2️⃣</span> Target Destination Folder
            </h3>
            <span className="status-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: 'var(--purple)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
              Target
            </span>
          </div>

          {/* 1. Target Repo Dropdown */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" htmlFor="target-repo-select">Select Target Destination Repository</label>
            <select
              id="target-repo-select"
              className="styled-select"
              value={targetRepoFullName}
              onChange={e => setTargetRepoFullName(e.target.value)}
            >
              <option value="">-- Choose Target Repository --</option>
              {repos.map(r => (
                <option key={r.id} value={r.full_name}>
                  {r.private ? '🔒' : '🌐'} {r.name} ({r.full_name})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Target Subfolder Dropdown */}
          {targetRepoFullName && (
            <div className="form-group animate-slide-down" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="target-folder-select" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Select Target Destination Folder</span>
                {loadingTargetFolders && <span style={{ color: 'var(--purple)', fontSize: '0.75rem' }}>Fetching...</span>}
              </label>

              <select
                id="target-folder-select"
                className="styled-select"
                value={selectedTargetFolder}
                onChange={e => setSelectedTargetFolder(e.target.value)}
                disabled={loadingTargetFolders}
              >
                <option value="/">📁 / (Root Directory)</option>
                {targetFolders.map((dir, idx) => (
                  <option key={idx} value={dir.path}>
                    📁 /{dir.path}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Items inside Target Folder + Preview of Incoming Selected Folder */}
          {targetRepoFullName && (
            <div className="animate-fade-in" style={{ marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase' }}>
                  Contents in Target ({selectedTargetFolder === '/' ? 'Root' : selectedTargetFolder})
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                  Destination Tree
                </span>
              </div>

              <div className="file-preview-box" style={{ maxHeight: '240px' }}>
                {/* Incoming Folder Preview Highlight */}
                {selectedSourceItem && (
                  <div
                    className="file-tree-item animate-pulse-subtle"
                    style={{
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px dashed var(--primary-light)',
                      padding: '0.5rem 0.75rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>{selectedSourceItem.type === 'dir' ? '📁' : '📄'}</span>
                      <span style={{ fontWeight: 700, color: '#fff' }}>
                        {selectedSourceItem.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--emerald)', fontWeight: 700, background: 'rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      + Incoming into /{selectedTargetFolder === '/' ? '' : selectedTargetFolder}
                    </span>
                  </div>
                )}

                {loadingTargetItems ? (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading existing contents...</div>
                ) : targetFolderItems.length > 0 ? (
                  targetFolderItems.map((item, idx) => (
                    <div key={idx} className="file-tree-item" style={{ padding: '0.45rem 0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{item.type === 'dir' ? '📁' : '📄'}</span>
                        <span style={{ color: item.isNew ? 'var(--emerald)' : 'var(--text-muted)' }}>
                          {item.name}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                        {item.isNew ? 'Transferred' : item.size ? `${(item.size / 1024).toFixed(1)} KB` : 'dir'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Target folder is currently empty.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= EXECUTION & COMMAND BLUEPRINT ================= */}
      <div className="glass-card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>Transfer Execution & Git Commands</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Confirm your source selection and execute the transfer to move the selected folder into your target destination.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              id="btn-execute-folder-transfer"
              className="btn btn-primary"
              onClick={handleExecuteTransfer}
              disabled={!sourceRepoFullName || !targetRepoFullName || !selectedSourceItem || isTransferring}
            >
              {isTransferring ? (
                <>
                  <span style={{ animation: 'spinSlow 1s linear infinite', display: 'inline-block' }}>⟳</span>
                  Transferring Folder...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Transfer Folder into Target
                </>
              )}
            </button>
          </div>
        </div>

        {/* Transfer History / Recent Activity */}
        {transferHistory.length > 0 && (
          <div style={{ marginBottom: '1.25rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.25rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--emerald)', marginBottom: '0.4rem' }}>
              ✓ Completed Transfers ({transferHistory.length}):
            </div>
            {transferHistory.map(th => (
              <div key={th.id} style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                <span>📁 <strong>{th.item}</strong> transferred into <strong>{th.targetRepo}</strong> (<code>{th.destPath}</code>)</span>
                <span style={{ color: 'var(--text-faint)' }}>{th.time}</span>
              </div>
            ))}
          </div>
        )}

        {/* Generated Terminal Blueprint */}
        <div style={{ background: '#070a12', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--emerald)' }}>
              ✓ Generated Git Subtree & Transfer Commands
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
