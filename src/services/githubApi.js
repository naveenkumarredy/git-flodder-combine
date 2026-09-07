const BASE_URL = 'https://api.github.com';

function getHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (token && token.trim() !== '') {
    headers['Authorization'] = `Bearer ${token.trim()}`;
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
      console.warn('Authenticated user fetch failed, falling back to public profile:', e);
    }
  }

  // Fallback to public user profile
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

  // Fallback to public repos for the user
  const url = `${BASE_URL}/users/${fallbackUsername}/repos?sort=${sort}&per_page=${per_page}`;
  const res = await fetch(url, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch repositories for ${fallbackUsername} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchRepoContents(token, owner, repo, path = '') {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = `${BASE_URL}/repos/${owner}/${repo}/contents/${cleanPath}`;
  const res = await fetch(url, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    if (res.status === 404) return []; // Empty repo or path
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch contents for ${path} (HTTP ${res.status})`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export async function fetchRepoFolders(token, owner, repo, path = '') {
  const contents = await fetchRepoContents(token, owner, repo, path);
  // Extract all directories
  return contents.filter(item => item.type === 'dir');
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
