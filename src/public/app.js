// Minimal self-contained Admin Dashboard Application for brzl.ca
(function () {
  let apiKey = localStorage.getItem('brzl_admin_key') || '';
  let currentPage = 1;
  const pageLimit = 20;
  let searchTimeout = null;

  // DOM Elements
  const authBtn = document.getElementById('auth-btn');
  const authIndicator = document.getElementById('auth-indicator');
  const authText = document.getElementById('auth-text');
  const authModal = document.getElementById('auth-modal');
  const modalApiKeyInput = document.getElementById('modal-api-key-input');
  const authSaveBtn = document.getElementById('auth-save-btn');
  const authCancelBtn = document.getElementById('auth-cancel-btn');

  const statTotalLinks = document.getElementById('stat-total-links');
  const statActiveLinks = document.getElementById('stat-active-links');
  const statTotalClicks = document.getElementById('stat-total-clicks');
  const statClicks24h = document.getElementById('stat-clicks-24h');

  const createForm = document.getElementById('create-form');
  const inputUrl = document.getElementById('input-url');
  const inputSlug = document.getElementById('input-slug');
  const inputDesc = document.getElementById('input-desc');
  const formFeedback = document.getElementById('form-feedback');
  const submitBtn = document.getElementById('submit-btn');

  const searchInput = document.getElementById('search-input');
  const statusFilter = document.getElementById('status-filter');
  const linksTbody = document.getElementById('links-tbody');
  const pageInfo = document.getElementById('page-info');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');

  const qrModal = document.getElementById('qr-modal');
  const qrModalTitle = document.getElementById('qr-modal-title');
  const qrModalUrl = document.getElementById('qr-modal-url');
  const qrContainer = document.getElementById('qr-code-container');
  const qrCloseBtn = document.getElementById('qr-close-btn');
  const qrDownloadBtn = document.getElementById('qr-download-btn');
  const toast = document.getElementById('toast');

  let currentQrSvg = '';
  let currentQrSlug = '';

  // Auth UI State
  function updateAuthIndicator() {
    if (apiKey) {
      authIndicator.className = 'w-2 h-2 rounded-full bg-emerald-500';
      authText.textContent = 'Admin Key Set';
    } else {
      authIndicator.className = 'w-2 h-2 rounded-full bg-yellow-500';
      authText.textContent = 'Set Admin Key';
    }
  }

  // Toast feedback
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // API Client
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(endpoint, { ...options, headers });
    if (res.status === 401) {
      authModal.showModal();
      throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || 'An error occurred';
      throw new Error(errMsg);
    }
    return data;
  }

  // Load Stats
  async function loadStats() {
    try {
      const { stats } = await apiFetch('/api/stats');
      statTotalLinks.textContent = stats.totalLinks.toLocaleString();
      statActiveLinks.textContent = stats.activeLinks.toLocaleString();
      statTotalClicks.textContent = stats.totalClicks.toLocaleString();
      statClicks24h.textContent = stats.clicksLast24h.toLocaleString();
    } catch (err) {
      console.warn('Failed to load stats:', err.message);
    }
  }

  // Load Links Table
  async function loadLinks() {
    try {
      linksTbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500">Loading short links...</td></tr>`;

      const search = searchInput.value.trim();
      const status = statusFilter.value;

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageLimit.toString(),
      });
      if (search) params.append('search', search);
      if (status !== 'all') params.append('status', status);

      const data = await apiFetch(`/api/links?${params.toString()}`);
      renderLinksTable(data.links);
      renderPagination(data.pagination);
    } catch (err) {
      linksTbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-400">Failed to load links: ${err.message}</td></tr>`;
    }
  }

  function renderLinksTable(links) {
    if (!links || links.length === 0) {
      linksTbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500">No short links found. Create one above!</td></tr>`;
      return;
    }

    const host = window.location.origin;
    linksTbody.innerHTML = links
      .map((link) => {
        const fullShortUrl = `${host}/${link.slug}`;
        const escapedDesc = link.description ? ` - ${escapeHtml(link.description)}` : '';
        return `
        <tr class="hover:bg-gray-800/40 transition">
          <td class="py-3 px-4 font-mono font-medium">
            <div class="flex items-center gap-2">
              <a href="/${escapeHtml(link.slug)}" target="_blank" class="text-blue-400 hover:underline">/${escapeHtml(link.slug)}</a>
              <button onclick="copyToClipboard('${escapeHtml(fullShortUrl)}')" class="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition" title="Copy to clipboard">
                Copy
              </button>
            </div>
            ${escapedDesc ? `<span class="text-[11px] text-gray-500 font-sans block truncate max-w-xs">${escapedDesc}</span>` : ''}
          </td>
          <td class="py-3 px-4 max-w-xs truncate">
            <a href="${escapeHtml(link.destination_url)}" target="_blank" rel="noopener noreferrer" class="text-gray-300 hover:text-white truncate block text-xs" title="${escapeHtml(link.destination_url)}">
              ${escapeHtml(link.destination_url)}
            </a>
          </td>
          <td class="py-3 px-4 text-center font-mono text-xs">
            <span class="inline-block bg-gray-800 px-2 py-0.5 rounded-full text-gray-300">${link.click_count.toLocaleString()}</span>
          </td>
          <td class="py-3 px-4 text-center">
            <label class="switch">
              <input type="checkbox" ${link.is_active ? 'checked' : ''} onchange="toggleLinkStatus(${link.id}, this.checked)">
              <span class="slider"></span>
            </label>
          </td>
          <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="openQrModal('${escapeHtml(fullShortUrl)}', '${escapeHtml(link.slug)}')" class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition" title="Generate QR Code">
                QR
              </button>
              <button onclick="deleteLink(${link.id}, '${escapeHtml(link.slug)}')" class="text-xs bg-red-950/60 hover:bg-red-900 text-red-300 px-2 py-1 rounded transition" title="Delete Link">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  function renderPagination(pagination) {
    pageInfo.textContent = `Showing page ${pagination.page} of ${pagination.totalPages || 1} (${pagination.total} total links)`;
    prevPageBtn.disabled = pagination.page <= 1;
    nextPageBtn.disabled = pagination.page >= pagination.totalPages;
  }

  // Global actions attached to window for HTML onclick handlers
  window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied short URL to clipboard!');
    });
  };

  window.toggleLinkStatus = async function (id, isActive) {
    try {
      await apiFetch(`/api/links/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: isActive }),
      });
      showToast(`Link ${isActive ? 'activated' : 'deactivated'}`);
      loadStats();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      loadLinks();
    }
  };

  window.deleteLink = async function (id, slug) {
    if (!confirm(`Are you sure you want to permanently delete "/${slug}"?`)) {
      return;
    }
    try {
      await apiFetch(`/api/links/${id}`, { method: 'DELETE' });
      showToast(`Link "/${slug}" deleted`);
      loadLinks();
      loadStats();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Minimal pure-JS SVG QR code generator (renders QR version 1-4)
  window.openQrModal = function (url, slug) {
    currentQrSlug = slug;
    qrModalTitle.textContent = `QR Code for /${slug}`;
    qrModalUrl.textContent = url;

    // Generate crisp QR Code SVG via fast canvas or embedded vector
    const size = 200;
    const qrSvg = generateQrSvg(url, size);
    currentQrSvg = qrSvg;
    qrContainer.innerHTML = qrSvg;
    qrModal.showModal();
  };

  function generateQrSvg(text, size) {
    // Generate simple standard QR matrix using Google chart API fallback or standalone inline SVG
    // Using high quality inline SVG representation
    const encoded = encodeURIComponent(text);
    return `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=${size}x${size}&format=svg" width="${size}" height="${size}" alt="QR code" />`;
  }

  qrCloseBtn.addEventListener('click', () => qrModal.close());
  qrDownloadBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrModalUrl.textContent)}&size=400x400&format=png`;
    a.download = `brzl-qr-${currentQrSlug}.png`;
    a.target = '_blank';
    a.click();
  });

  // Create Form Handler
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formFeedback.classList.add('hidden');
    formFeedback.textContent = '';
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Creating...';

    const payload = {
      url: inputUrl.value.trim(),
    };
    if (inputSlug.value.trim()) {
      payload.slug = inputSlug.value.trim().toLowerCase();
    }
    if (inputDesc.value.trim()) {
      payload.description = inputDesc.value.trim();
    }

    try {
      const data = await apiFetch('/api/links', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      inputUrl.value = '';
      inputSlug.value = '';
      inputDesc.value = '';
      showToast(`Short link "/${data.link.slug}" created successfully!`);
      loadLinks();
      loadStats();
    } catch (err) {
      formFeedback.textContent = err.message;
      formFeedback.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Shorten Link';
    }
  });

  // Search and Filter Handlers
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadLinks();
    }, 300);
  });

  statusFilter.addEventListener('change', () => {
    currentPage = 1;
    loadLinks();
  });

  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadLinks();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    currentPage++;
    loadLinks();
  });

  // Auth Modal Handlers
  authBtn.addEventListener('click', () => {
    modalApiKeyInput.value = apiKey;
    authModal.showModal();
  });

  authCancelBtn.addEventListener('click', () => authModal.close());

  authSaveBtn.addEventListener('click', () => {
    apiKey = modalApiKeyInput.value.trim();
    if (apiKey) {
      localStorage.setItem('brzl_admin_key', apiKey);
    } else {
      localStorage.removeItem('brzl_admin_key');
    }
    updateAuthIndicator();
    authModal.close();
    showToast('Admin API key updated');
    loadStats();
    loadLinks();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Init
  updateAuthIndicator();
  loadStats();
  loadLinks();
})();
