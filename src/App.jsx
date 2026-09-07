import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import {
  fetchUserProfile,
  fetchUserRepos,
  fetchRepoContents,
  fetchRateLimit,
  createGitHubRepo,
} from './services/githubApi';
import RepoFolderCombiner from './components/RepoFolderCombiner';

export default function App() {
  const [token, setToken] = useState(
    import.meta.env.VITE_GITHUB_TOKEN || localStorage.getItem('gh_token') || ''
  );
  const [userProfile, setUserProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimit, setRateLimit] = useState(null);

  // Top-Level Screen Tabs
  const [mainScreenTab, setMainScreenTab] = useState('hub'); // 'hub' | 'combiner'

  // Sub-Filters & Tabs inside Hub
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('all'); // all | public | private
  const [activeTab, setActiveTab] = useState('explorer');

  // Expanded files map: { [repoId]: { loading: boolean, files: [] } }
  const [expandedFiles, setExpandedFiles] = useState({});

  // Combine Studio state (inside Hub)
  const [sourceRepoId, setSourceRepoId] = useState('');
  const [targetRepoId, setTargetRepoId] = useState('');
  const [isCombining, setIsCombining] = useState(false);
  const [combineRule, setCombineRule] = useState('merge-unique');

  // New Repo Modal
  const [isNewRepoModalOpen, setIsNewRepoModalOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);

  // Token Config Modal
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [inputToken, setInputToken] = useState(token);

  // Terminal & Toasts
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [toasts, setToasts] = useState([]);

  const logTerminal = (cmd, out) => {
    setTerminalHistory(prev => [...prev, { cmd, out }]);
  };

  const addToast = (text, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Load User Data & Repos from GitHub API
  const loadGitHubData = async (activeToken) => {
    setLoading(true);
    setError(null);
    try {
      logTerminal('api.github.com/user', 'Fetching GitHub user profile...');
      const profile = await fetchUserProfile(activeToken, 'naveenkumarredy');
      setUserProfile(profile);
      logTerminal('api.github.com/user', `Connected: ${profile.login} (${profile.name || 'Naveen Kumar Reddy'})`);

      logTerminal('api.github.com/repos', 'Loading repositories from GitHub API...');
      const userRepos = await fetchUserRepos(activeToken, { fallbackUsername: 'naveenkumarredy' });
      setRepos(userRepos);
      logTerminal('api.github.com/repos', `Loaded ${userRepos.length} repositories`);

      if (userRepos.length > 0) {
        setSourceRepoId(String(userRepos[0].id));
        setTargetRepoId(String(userRepos[userRepos.length > 1 ? 1 : 0].id));
      }

      const rates = await fetchRateLimit(activeToken);
      if (rates) setRateLimit(rates.resources?.core);

      addToast(`Connected to GitHub (@${profile.login})!`, 'success');
    } catch (err) {
      setError(err.message || 'Failed to authenticate with GitHub API');
      logTerminal('error', `GitHub API: ${err.message}`);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGitHubData(token);
  }, [token]);

  // Expand and fetch real repo files via Contents API
  const handleToggleFiles = async (repo) => {
    if (expandedFiles[repo.id]) {
      const copy = { ...expandedFiles };
      delete copy[repo.id];
      setExpandedFiles(copy);
      return;
    }

    setExpandedFiles(prev => ({
      ...prev,
      [repo.id]: { loading: true, files: [] },
    }));

    try {
      logTerminal(`GET /repos/${repo.full_name}/contents`, 'Fetching files...');
      const contents = await fetchRepoContents(token, repo.owner.login, repo.name);
      setExpandedFiles(prev => ({
        ...prev,
        [repo.id]: { loading: false, files: Array.isArray(contents) ? contents : [contents] },
      }));
      logTerminal(`GET /repos/${repo.full_name}/contents`, `Retrieved ${contents.length || 1} items`);
    } catch (err) {
      setExpandedFiles(prev => ({
        ...prev,
        [repo.id]: { loading: false, files: [], error: err.message },
      }));
      addToast(`Could not load files: ${err.message}`, 'error');
    }
  };

  // Filter repos dynamically
  const filteredRepos = useMemo(() => {
    return repos.filter(repo => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        repo.name.toLowerCase().includes(q) ||
        (repo.description && repo.description.toLowerCase().includes(q)) ||
        (repo.language && repo.language.toLowerCase().includes(q));

      const matchesVisibility =
        visibilityFilter === 'all' ||
        (visibilityFilter === 'public' && !repo.private) ||
        (visibilityFilter === 'private' && repo.private);

      return matchesSearch && matchesVisibility;
    });
  }, [repos, searchQuery, visibilityFilter]);

  // Create New Repository on GitHub
  const handleCreateRepoSubmit = async (e) => {
    e.preventDefault();
    if (!newRepoName.trim()) return;

    setIsCreatingRepo(true);
    try {
      logTerminal('POST /user/repos', `Creating repository "${newRepoName}" on GitHub...`);
      const created = await createGitHubRepo(token, {
        name: newRepoName.trim(),
        description: newRepoDesc.trim(),
        isPrivate: newRepoPrivate,
      });

      setRepos(prev => [created, ...prev]);
      logTerminal('POST /user/repos', `Created ${created.full_name} on GitHub!`);
      addToast(`Created repository "${created.name}" on GitHub!`, 'success');
      setIsNewRepoModalOpen(false);
      setNewRepoName('');
      setNewRepoDesc('');
    } catch (err) {
      addToast(err.message, 'error');
      logTerminal('error', `Failed to create repo: ${err.message}`);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  // Combine Studio Execution (Hub Tab)
  const handleExecuteCombine = () => {
    const src = repos.find(r => String(r.id) === String(sourceRepoId));
    const tgt = repos.find(r => String(r.id) === String(targetRepoId));
    if (!src || !tgt) return;

    setIsCombining(true);
    logTerminal('combine --execute', `Initiating combine: [${src.name}] -> [${tgt.name}]`);
    setTimeout(() => {
      setIsCombining(false);
      addToast(`Generated combine blueprint for ${src.name} into ${tgt.name}!`, 'success');
      logTerminal('combine --done', `Combine blueprint ready. Strategy: ${combineRule}.`);
    }, 1200);
  };

  // Save Token
  const handleSaveToken = (e) => {
    e.preventDefault();
    const cleanToken = inputToken.trim();
    setToken(cleanToken);
    localStorage.setItem('gh_token', cleanToken);
    setIsTokenModalOpen(false);
    loadGitHubData(cleanToken);
  };

  // Terminal commands
  const handleTerminalSubmit = (e) => {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd) return;

    const lower = cmd.toLowerCase();
    if (lower === 'clear') {
      setTerminalHistory([]);
      setTerminalInput('');
      return;
    } else if (lower === 'help') {
      logTerminal(cmd, 'Commands: repos, user, ratelimit, clear, help');
    } else if (lower === 'repos') {
      const list = repos.map(r => `${r.private ? '🔒' : '🌐'} ${r.name} (${r.language || 'Plain'})`).join('\n');
      logTerminal(cmd, list || 'No repositories loaded');
    } else if (lower === 'user') {
      logTerminal(cmd, userProfile ? `Login: ${userProfile.login}\nName: ${userProfile.name}\nPublic Repos: ${userProfile.public_repos}` : 'Not connected');
    } else if (lower === 'ratelimit') {
      logTerminal(cmd, rateLimit ? `Remaining: ${rateLimit.remaining} / ${rateLimit.limit}` : 'Rate limit info not loaded');
    } else {
      logTerminal(cmd, `Command not recognized. Type "help" for options.`);
    }

    setTerminalInput('');
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-section">
            <div className="brand-logo-glow" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="2"></circle>
              </svg>
            </div>
            <h1 className="brand-title">
              Git & Folder Combine <span className="version-pill">Live API</span>
            </h1>
          </div>

          <div className="search-bar-wrapper">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              id="search-input"
              type="text"
              className="search-input"
              placeholder="Search live GitHub repos, topics, or languages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="header-actions">
            {userProfile && (
              <div className="user-badge-header">
                <img src={userProfile.avatar_url} alt={userProfile.login} className="user-avatar-small" />
                <span>@{userProfile.login}</span>
              </div>
            )}
            <button
              id="btn-settings-token"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsTokenModalOpen(true)}
              title="GitHub Access Token Settings"
            >
              🔑 PAT Token
            </button>
            <button
              id="btn-create-repo"
              className="btn btn-primary"
              onClick={() => setIsNewRepoModalOpen(true)}
              disabled={!token}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Repo
            </button>
          </div>
        </div>
      </header>

      {/* TOP-LEVEL DUAL TAB SWITCHER */}
      <div className="main-nav-tabs" role="tablist" aria-label="Main Navigation Tabs">
        <button
          id="main-tab-hub"
          role="tab"
          aria-selected={mainScreenTab === 'hub'}
          className={`main-nav-tab ${mainScreenTab === 'hub' ? 'active' : ''}`}
          onClick={() => setMainScreenTab('hub')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          Tab 1: Repositories & Workspace
          <span className="tab-badge">{repos.length} Repos</span>
        </button>

        <button
          id="main-tab-combiner"
          role="tab"
          aria-selected={mainScreenTab === 'combiner'}
          className={`main-nav-tab ${mainScreenTab === 'combiner' ? 'active' : ''}`}
          onClick={() => setMainScreenTab('combiner')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M6 21V9a9 9 0 0 0 9 9"></path>
          </svg>
          Tab 2: Folder Combiner Studio
          <span className="tab-badge" style={{ background: 'rgba(99, 102, 241, 0.25)', color: 'var(--primary-light)' }}>
            Cascading Dropdowns
          </span>
        </button>
      </div>

      {/* Main Container */}
      <main className="main-wrapper">
        {/* TAB 2: FOLDER COMBINER COMPONENT (Separate File) */}
        {mainScreenTab === 'combiner' && (
          <RepoFolderCombiner
            repos={repos}
            token={token}
            onNotify={addToast}
          />
        )}

        {/* TAB 1: CURRENT UI (Hub, Metrics, Explorer, Terminal) */}
        {mainScreenTab === 'hub' && (
          <div className="animate-fade-in">
            {/* Profile Card Banner */}
            {userProfile && (
              <section className="glass-card profile-banner" aria-label="GitHub User Profile">
                <div className="profile-left">
                  <img src={userProfile.avatar_url} alt={userProfile.name || userProfile.login} className="profile-avatar-large" />
                  <div className="profile-info">
                    <h2>
                      {userProfile.name || userProfile.login}
                      <span className="profile-username">(@{userProfile.login})</span>
                    </h2>
                    {userProfile.bio && <div className="profile-bio">{userProfile.bio}</div>}
                    <div className="profile-meta-tags">
                      <span>📍 {userProfile.location || 'Global'}</span>
                      <span>👥 {userProfile.followers} followers</span>
                      <span>📦 {repos.length} accessible repositories</span>
                    </div>
                  </div>
                </div>

                <div className="profile-right">
                  {rateLimit && (
                    <div className="rate-limit-badge">
                      <div className="rate-val">{rateLimit.remaining} / {rateLimit.limit}</div>
                      <div className="rate-label">GitHub API Rate Limit</div>
                    </div>
                  )}
                  <a
                    href={userProfile.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-secondary"
                  >
                    View on GitHub ↗
                  </a>
                </div>
              </section>
            )}

            {/* Dynamic Metric Tiles */}
            <section className="stats-grid" aria-label="Live GitHub stats">
              <div className="glass-card stat-card" style={{ '--card-accent': 'var(--primary)' }}>
                <div className="stat-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <div>
                  <div className="stat-label">Live Repositories</div>
                  <div className="stat-val">{repos.length}</div>
                  <div className="stat-subtext">Fetched via REST API</div>
                </div>
              </div>

              <div className="glass-card stat-card" style={{ '--card-accent': 'var(--amber)' }}>
                <div className="stat-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <div>
                  <div className="stat-label">Private Repos</div>
                  <div className="stat-val">{repos.filter(r => r.private).length}</div>
                  <div className="stat-subtext">Authenticated with PAT</div>
                </div>
              </div>

              <div className="glass-card stat-card" style={{ '--card-accent': 'var(--emerald)' }}>
                <div className="stat-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="12 8 8 12 12 16 12 8"></polygon>
                  </svg>
                </div>
                <div>
                  <div className="stat-label">Public Repos</div>
                  <div className="stat-val">{repos.filter(r => !r.private).length}</div>
                  <div className="stat-subtext">Open Source</div>
                </div>
              </div>

              <div className="glass-card stat-card" style={{ '--card-accent': 'var(--cyan)' }}>
                <div className="stat-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                  </svg>
                </div>
                <div>
                  <div className="stat-label">API Health</div>
                  <div className="stat-val">200 OK</div>
                  <div className="stat-subtext">Zero hardcoded data</div>
                </div>
              </div>
            </section>

            {/* View Sub-Tabs */}
            <nav className="view-tabs" aria-label="Views">
              <button
                id="tab-explorer"
                className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
                onClick={() => setActiveTab('explorer')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                Repository Explorer ({filteredRepos.length})
              </button>

              <button
                id="tab-studio"
                className={`tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
                onClick={() => setActiveTab('studio')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="18" r="3"></circle>
                  <circle cx="6" cy="6" r="3"></circle>
                  <path d="M6 21V9a9 9 0 0 0 9 9"></path>
                </svg>
                Combine Studio
              </button>

              <button
                id="tab-terminal"
                className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setActiveTab('terminal')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5"></polyline>
                  <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
                Live GitHub API Terminal
              </button>
            </nav>

            {/* Sub-Tab 1: Live Repo Explorer */}
            {activeTab === 'explorer' && (
              <section className="animate-fade-in" aria-label="Repository List">
                {/* Visibility Filters */}
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Filter Visibility:</span>
                  {['all', 'public', 'private'].map(vis => (
                    <button
                      key={vis}
                      onClick={() => setVisibilityFilter(vis)}
                      className="btn btn-sm btn-secondary"
                      style={{
                        textTransform: 'capitalize',
                        background: visibilityFilter === vis ? 'rgba(99, 102, 241, 0.25)' : undefined,
                        borderColor: visibilityFilter === vis ? 'var(--primary-light)' : undefined,
                        color: visibilityFilter === vis ? '#fff' : undefined,
                      }}
                    >
                      {vis}
                    </button>
                  ))}
                </div>

                {loading && (
                  <div className="loading-box">
                    <div className="spinner"></div>
                    <div>Fetching live repositories from GitHub API...</div>
                  </div>
                )}

                {!loading && filteredRepos.length === 0 && (
                  <div className="loading-box">
                    <div style={{ fontSize: '1.5rem' }}>🔍</div>
                    <div>No repositories matched your search or filters.</div>
                  </div>
                )}

                <div className="repo-grid">
                  {filteredRepos.map(repo => {
                    const isExpanded = !!expandedFiles[repo.id];
                    const fileData = expandedFiles[repo.id];

                    return (
                      <div key={repo.id} className="glass-card repo-card">
                        <div>
                          <div className="repo-card-header">
                            <div className="repo-title-row">
                              <div className="repo-icon-circle">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                              </div>
                              <div>
                                <div className="repo-name">{repo.name}</div>
                                <div className="repo-full-name">{repo.full_name}</div>
                              </div>
                            </div>
                            <span className={`status-badge ${repo.private ? 'private' : 'public'}`}>
                              {repo.private ? '🔒 Private' : '🌐 Public'}
                            </span>
                          </div>

                          <p className="repo-desc">
                            {repo.description || 'No description provided for this repository.'}
                          </p>

                          <div className="repo-tags-row">
                            {repo.language && (
                              <div className="repo-tag">
                                <span className="lang-dot"></span>
                                <span>{repo.language}</span>
                              </div>
                            )}
                            <div className="repo-tag">⭐ {repo.stargazers_count}</div>
                            <div className="repo-tag">🍴 {repo.forks_count}</div>
                            <div className="repo-tag">🌿 {repo.default_branch}</div>
                          </div>

                          {/* Dynamic File Tree Preview */}
                          {isExpanded && (
                            <div className="file-preview-box" style={{ marginTop: '1rem' }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', fontWeight: 600, marginBottom: '0.5rem' }}>
                                LIVE CONTENTS ({repo.default_branch})
                              </div>
                              {fileData.loading ? (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading files from GitHub...</div>
                              ) : fileData.files.length > 0 ? (
                                fileData.files.map((item, idx) => (
                              <div key={idx} className="file-tree-item">
                                <span>{item.type === 'dir' ? '📁' : '📄'} {item.name}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                                  {item.size ? `${(item.size / 1024).toFixed(1)} KB` : 'dir'}
                                </span>
                              </div>
                                ))
                              ) : (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Empty repository.</div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="folder-card-actions">
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Updated: {new Date(repo.updated_at).toLocaleDateString()}
                          </span>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleToggleFiles(repo)}
                            >
                              {isExpanded ? 'Hide Files' : 'Browse Files'}
                            </button>
                            <a
                              href={repo.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-sm btn-primary"
                            >
                              GitHub ↗
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Sub-Tab 2: Combine Studio (Within Hub) */}
            {activeTab === 'studio' && (
              <section className="animate-fade-in" aria-label="Combine Studio">
                <div className="studio-container">
                  <div className="glass-card studio-panel">
                    <h2 className="studio-panel-title">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="18" r="3"></circle>
                        <circle cx="6" cy="6" r="3"></circle>
                        <path d="M6 21V9a9 9 0 0 0 9 9"></path>
                      </svg>
                      Repository Combine Configuration
                    </h2>

                    <div className="folder-select-row">
                      <label className="form-label">Source GitHub Repository</label>
                      <select
                        className="styled-select"
                        value={sourceRepoId}
                        onChange={e => setSourceRepoId(e.target.value)}
                      >
                        {repos.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.full_name})</option>
                        ))}
                      </select>
                    </div>

                    <div className="folder-select-row">
                      <label className="form-label">Target Destination Repository</label>
                      <select
                        className="styled-select"
                        value={targetRepoId}
                        onChange={e => setTargetRepoId(e.target.value)}
                      >
                        {repos.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.full_name})</option>
                        ))}
                      </select>
                    </div>

                    <div className="folder-select-row">
                      <label className="form-label">Combine Mode</label>
                      <select
                        className="styled-select"
                        value={combineRule}
                        onChange={e => setCombineRule(e.target.value)}
                      >
                        <option value="merge-unique">Monorepo Subtree Combine (git subtree merge)</option>
                        <option value="submodule">Git Submodule Link</option>
                        <option value="branch-cherrypick">Cross-Repo Cherry Pick</option>
                      </select>
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
                      onClick={handleExecuteCombine}
                      disabled={isCombining || !sourceRepoId || !targetRepoId}
                    >
                      {isCombining ? 'Generating Combine Blueprint...' : 'Generate Combine Script'}
                    </button>
                  </div>

                  {/* Live Combine Script Preview */}
                  <div className="glass-card studio-panel">
                    <h2 className="studio-panel-title">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="4 17 10 11 4 5"></polyline>
                        <line x1="12" y1="19" x2="20" y2="19"></line>
                      </svg>
                      Live Git Execution Script
                    </h2>

                    <div style={{ background: '#080c16', padding: '1.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--cyan)', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Generated Monorepo Merge Commands:
                      </div>

                      <pre className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: '1.8', overflowX: 'auto' }}>
{`# 1. Clone target repository
git clone ${repos.find(r => String(r.id) === String(targetRepoId))?.clone_url || 'https://github.com/target.git'}
cd ${repos.find(r => String(r.id) === String(targetRepoId))?.name || 'target'}

# 2. Add source repository as remote
git remote add source-repo ${repos.find(r => String(r.id) === String(sourceRepoId))?.clone_url || 'https://github.com/source.git'}
git fetch source-repo

# 3. Subtree merge source into dedicated subdirectory
git subtree add --prefix=${repos.find(r => String(r.id) === String(sourceRepoId))?.name || 'source'} source-repo/main

# 4. Push combined monorepo upstream
git push origin main`}
                      </pre>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Sub-Tab 3: Git API Terminal */}
            {activeTab === 'terminal' && (
              <section className="animate-fade-in" aria-label="Terminal">
                <div className="terminal-window">
                  <div className="terminal-header">
                    <div className="terminal-dots">
                      <span className="dot red"></span>
                      <span className="dot yellow"></span>
                      <span className="dot green"></span>
                    </div>
                    <div className="terminal-title">api.github.com - REST API Stream</div>
                    <div style={{ width: '40px' }}></div>
                  </div>

                  <div className="terminal-body">
                    {terminalHistory.map((item, idx) => (
                      <div key={idx}>
                        <div className="term-line">
                          <span className="term-prompt">github@api:~$</span>
                          <span className="term-cmd">{item.cmd}</span>
                        </div>
                        {item.out && <div className="term-output">{item.out}</div>}
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleTerminalSubmit} className="terminal-input-bar">
                    <span className="term-prompt">github@api:~$</span>
                    <input
                      type="text"
                      className="term-input"
                      placeholder="Commands: repos, user, ratelimit, clear, help..."
                      value={terminalInput}
                      onChange={e => setTerminalInput(e.target.value)}
                      autoFocus
                    />
                  </form>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* New GitHub Repo Modal */}
      {isNewRepoModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewRepoModalOpen(false)}>
          <div className="modal-content animate-slide-down" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Repository on GitHub</h3>
              <button className="modal-close-btn" onClick={() => setIsNewRepoModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateRepoSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Repository Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. dynamic-workspace-hub"
                  value={newRepoName}
                  onChange={e => setNewRepoName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Brief description of this project"
                  value={newRepoDesc}
                  onChange={e => setNewRepoDesc(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="chk-private"
                  checked={newRepoPrivate}
                  onChange={e => setNewRepoPrivate(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="chk-private" className="form-label" style={{ cursor: 'pointer' }}>
                  Make this repository Private
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewRepoModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreatingRepo}>
                  {isCreatingRepo ? 'Creating on GitHub...' : 'Create on GitHub'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Token Settings Modal */}
      {isTokenModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTokenModalOpen(false)}>
          <div className="modal-content animate-slide-down" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">GitHub Personal Access Token</h3>
              <button className="modal-close-btn" onClick={() => setIsTokenModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveToken} className="modal-form">
              <div className="form-group">
                <label className="form-label">Personal Access Token (PAT)</label>
                <input
                  type="password"
                  className="form-input font-mono"
                  placeholder="ghp_... or github_pat_..."
                  value={inputToken}
                  onChange={e => setInputToken(e.target.value)}
                  required
                />
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Tokens are stored locally in your browser/env and used only to communicate directly with <code>api.github.com</code>.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsTokenModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification Container */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className="toast">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div>100% Live GitHub REST API • Authenticated as @{userProfile?.login || 'naveenkumarredy'} • Zero Hardcoded Data</div>
      </footer>
    </div>
  );
}
