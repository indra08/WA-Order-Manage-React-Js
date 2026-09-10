/**
 * app.js - Vanilla JS SPA untuk dashboard admin (DashLite Style)
 * WA Book Order Management System
 */

const API = '/api/admin';

// Page metadata
const PAGE_META = {
  dashboard: ['Dashboard', 'Ringkasan aktivitas penjualan buku via WhatsApp Group'],
  whatsapp: ['WhatsApp Connection', 'Hubungkan nomor WhatsApp admin untuk mulai memonitor group'],
  groups: ['Groups', 'Kelola group WhatsApp yang dimonitor sistem'],
  books: ['Buku', 'Kelola katalog & stok buku'],
  replies: ['Incoming Replies', 'Antrian konfirmasi order dari customer'],
  invoice: ['Cek Rekapan', 'Cek tagihan customer berdasarkan Group + Kode'],
  reports: ['Reports', 'Laporan penjualan, produk, dan performa group'],
};

// Icon SVG templates for stat cards
const ICONS = {
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  dollar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  customer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

// Toast notification
function toast(message, type = 'default') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : 
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
    </svg>
    <span class="toast-content">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  container.appendChild(toast);
  
  // Auto remove after 3.5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Format currency to Rupiah
function rupiah(n) {
  if (n == null) return '-';
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

// Format date
function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

// API helper
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getToken(),
      ...(options.headers || {}),
    },
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `Request gagal (${res.status})`);
  }
  return data;
}

// Get stored token
function getToken() {
  return localStorage.getItem('adminToken') || '';
}

// =====================
// TABS NAVIGATION
// =====================
function initTabs() {
  document.querySelectorAll('.sidebar-nav button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      // Update active nav button
      document.querySelectorAll('.sidebar-nav button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update active panel
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      document.getElementById('panel-' + tab)?.classList.add('active');
      
      // Update page title
      const [title, sub] = PAGE_META[tab] || [tab, ''];
      document.getElementById('pageTitle').textContent = title;
      document.getElementById('pageSub').textContent = sub;
      
      // Load tab data
      loadTab(tab);
      
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('is-open');
    });
  });
}

function loadTab(tab) {
  if (tab === 'dashboard') loadSummary();
  if (tab === 'whatsapp') { refreshWaStatus(); loadWaGroups(); }
  if (tab === 'groups') loadGroups();
  if (tab === 'books') loadBooks();
  if (tab === 'replies') loadReplies();
  if (tab === 'reports') loadReports();
}

// =====================
// TOKEN MANAGEMENT
// =====================
document.getElementById('saveTokenBtn').addEventListener('click', () => {
  const token = document.getElementById('adminToken').value.trim();
  localStorage.setItem('adminToken', token);
  toast('Token tersimpan', 'success');
  loadTab('dashboard');
  refreshWaStatus();
});
document.getElementById('adminToken').value = getToken();

// =====================
// DASHBOARD
// =====================
async function loadSummary() {
  try {
    const s = await api('/reports/summary');
    
    const stats = [
      { label: 'Group Aktif', value: `${s.activeGroups}/${s.totalGroups}`, icon: 'users', variant: 'primary' },
      { label: 'Total Buku', value: s.totalBooks || 0, icon: 'book', variant: 'primary' },
      { label: 'Total Posting', value: s.totalPosts || 0, icon: 'send', variant: 'primary' },
      { label: 'Menunggu Cek Stok', value: s.waitingStockCheck || 0, icon: 'clock', variant: 'warning' },
      { label: 'Confirmed / Invoiced', value: s.confirmedOrInvoiced || 0, icon: 'check', variant: 'success' },
      { label: 'Rejected', value: s.rejected || 0, icon: 'x', variant: 'danger' },
      { label: 'Menunggu Fix Ulang', value: s.waitingRetry || 0, icon: 'refresh', variant: 'warning' },
      { label: 'Total Revenue', value: rupiah(s.totalRevenue), icon: 'dollar', variant: 'success' },
      { label: 'Total Customer', value: s.totalCustomers || 0, icon: 'customer', variant: 'primary' },
    ];
    
    document.getElementById('summaryGrid').innerHTML = stats
      .map(stat => `
        <div class="stat-card">
          <div class="stat-card-icon ${stat.variant}">
            ${ICONS[stat.icon]}
          </div>
          <div class="stat-card-content">
            <div class="stat-card-label">${stat.label}</div>
            <div class="stat-card-value ${stat.variant === 'success' ? 'success' : stat.variant === 'primary' ? 'primary' : ''}">${stat.value}</div>
          </div>
        </div>
      `)
      .join('');
  } catch (err) {
    // Show empty state if API not available
    document.getElementById('summaryGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-card-content">
          <div class="stat-card-label text-muted">Memuat data...</div>
        </div>
      </div>
    `;
  }
}

// =====================
// WHATSAPP CONNECTION
// =====================
const WA_LABELS = {
  DISCONNECTED: 'Terputus',
  CONNECTING: 'Menghubungkan...',
  QR_READY: 'Menunggu Scan QR',
  CONNECTED: 'Terhubung',
};

function applyWaStatus(data) {
  const statusText = document.getElementById('waStatusText');
  const statusChip = document.getElementById('waStatusChip');
  const dot = statusChip?.querySelector('.dot');
  
  if (dot) {
    dot.className = 'dot';
    if (data.status === 'CONNECTED') {
      dot.classList.add('connected');
    } else if (data.status === 'DISCONNECTED') {
      dot.classList.add('disconnected');
    } else {
      dot.classList.add('connecting');
    }
  }
  
  if (statusText) {
    statusText.textContent = data.status === 'CONNECTED' && data.waNumber 
      ? `WhatsApp: +${data.waNumber}` 
      : WA_LABELS[data.status] || data.status;
  }
  
  // Nav dot indicator
  const navDot = document.getElementById('waNavDot');
  if (navDot) {
    if (data.status === 'CONNECTED') {
      navDot.style.display = 'none';
    } else {
      navDot.style.display = 'inline-flex';
      navDot.className = 'badge-count';
      navDot.style.background = data.status === 'DISCONNECTED' ? 'var(--danger)' : 'var(--warning)';
    }
  }
  
  // Badge status
  const badge = document.getElementById('waStatusBadge');
  if (badge) {
    badge.textContent = WA_LABELS[data.status] || data.status;
    badge.className = 'badge badge-lg';
    if (data.status === 'CONNECTED') badge.classList.add('success');
    else if (data.status === 'DISCONNECTED') badge.classList.add('danger');
    else badge.classList.add('warning');
  }
  
  // Phone number
  const numberText = document.getElementById('waNumberText');
  if (numberText) {
    numberText.textContent = data.status === 'CONNECTED' && data.waNumber 
      ? `Nomor aktif: +${data.waNumber}` 
      : '';
  }
  
  // QR Box
  const qrBox = document.getElementById('waQrBox');
  if (qrBox) {
    if (data.status === 'QR_READY' && data.qrDataUrl) {
      qrBox.innerHTML = `<img src="${data.qrDataUrl}" alt="QR WhatsApp" />`;
    } else if (data.status === 'CONNECTED') {
      qrBox.innerHTML = `
        <div style="text-align:center;color:var(--success);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div style="font-weight:600;">Terhubung</div>
          <div style="font-size:12px;color:var(--text-muted);">+${data.waNumber || '-'}</div>
        </div>
      `;
    } else if (data.status === 'CONNECTING') {
      qrBox.innerHTML = `
        <div style="text-align:center;color:var(--warning);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;animation:pulse 1.5s infinite;">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <div style="font-weight:600;">Menghubungkan...</div>
        </div>
      `;
    } else {
      qrBox.innerHTML = `
        <div style="text-align:center;color:var(--text-muted);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <div style="font-size:12px;">Belum terhubung.<br/>Klik "Hubungkan" untuk memulai.</div>
        </div>
      `;
    }
  }
}

async function refreshWaStatus() {
  try {
    const data = await api('/whatsapp/status');
    applyWaStatus(data);
  } catch (err) {
    // Silently fail - token might not be set
  }
}

async function loadWaGroups() {
  const tbody = document.getElementById('waGroupsTbody');
  try {
    const groups = await api('/whatsapp/groups');
    if (!groups.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Belum ada group ditemukan untuk nomor ini.</td></tr>';
      return;
    }
    tbody.innerHTML = groups
      .map(g => `
        <tr>
          <td><strong>${g.name}</strong></td>
          <td class="text-muted">${g.participants ?? '-'} anggota</td>
          <td>${g.registered 
            ? `<span class="badge ${g.active ? 'success' : 'secondary'}">${g.code || ''} ${g.active ? '(Aktif)' : '(Nonaktif)'}</span>`
            : '<span class="badge secondary">Belum Terdaftar</span>'
          }</td>
          <td>
            <button class="btn btn-sm ${g.registered && g.active ? 'btn-ghost' : 'btn-success'}" 
                    onclick='registerWaGroup(${JSON.stringify(g.waGroupId)}, ${JSON.stringify(g.name)})'
                    ${g.registered && g.active ? 'disabled' : ''}>
              ${g.registered ? (g.active ? '✓ Aktif' : 'Aktifkan') : 'Daftarkan'}
            </button>
          </td>
        </tr>
      `)
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">${err.message}</td></tr>`;
  }
}

window.registerWaGroup = async (waGroupId, name) => {
  try {
    await api('/whatsapp/groups/register', { 
      method: 'POST', 
      body: JSON.stringify({ waGroupId, name }) 
    });
    toast(`Group "${name}" berhasil didaftarkan & diaktifkan`, 'success');
    loadWaGroups();
  } catch (err) {
    toast(err.message, 'error');
  }
};

document.getElementById('waConnectBtn').addEventListener('click', async () => {
  try {
    await api('/whatsapp/connect', { method: 'POST' });
    toast('Menghubungkan... QR akan muncul beberapa detik lagi', 'default');
    setTimeout(refreshWaStatus, 1500);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('waLogoutBtn').addEventListener('click', async () => {
  if (!confirm('Putuskan sesi WhatsApp? Anda perlu scan QR ulang setelah ini.')) return;
  try {
    await api('/whatsapp/logout', { method: 'POST' });
    toast('Sesi WhatsApp diputus', 'success');
    refreshWaStatus();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('refreshWaGroupsBtn').addEventListener('click', loadWaGroups);

// Poll status every 3 seconds
setInterval(refreshWaStatus, 3000);

// =====================
// GROUPS
// =====================
async function loadGroups() {
  try {
    const groups = await api('/groups');
    document.getElementById('groupsTbody').innerHTML = groups
      .map(g => `
        <tr>
          <td><strong>${g.code}</strong></td>
          <td>${g.name}</td>
          <td class="text-muted">${g.waGroupId || '-'}</td>
          <td><span class="badge ${g.active ? 'success' : 'secondary'}">${g.active ? 'Aktif' : 'Nonaktif'}</span></td>
          <td>
            <button class="btn btn-sm ${g.active ? 'btn-ghost' : 'btn-success'}" 
                    onclick="toggleGroup('${g.id}', ${!g.active})">
              ${g.active ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </td>
        </tr>
      `)
      .join('') || '<tr><td colspan="5" class="text-muted">Belum ada group terdaftar.</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('groupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api('/groups', { 
      method: 'POST', 
      body: JSON.stringify(Object.fromEntries(form)) 
    });
    e.target.reset();
    toast('Group ditambahkan', 'success');
    loadGroups();
  } catch (err) {
    toast(err.message, 'error');
  }
});

window.toggleGroup = async (id, activate) => {
  try {
    await api(`/groups/${id}/${activate ? 'activate' : 'deactivate'}`, { method: 'POST' });
    loadGroups();
    toast(`Group berhasil ${activate ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
};

// =====================
// BOOKS
// =====================
async function loadBooks() {
  try {
    const books = await api('/books');
    document.getElementById('booksTbody').innerHTML = books
      .map(b => `
        <tr>
          <td><strong>${b.title}</strong></td>
          <td><span class="badge secondary">${b.prefix || '-'}</span></td>
          <td>${rupiah(b.nettPrice ?? b.price)}</td>
          <td>${b.stock}</td>
          <td><span class="badge ${b.status === 'Active' ? 'success' : 'secondary'}">${b.status || 'Active'}</span></td>
        </tr>
      `)
      .join('') || '<tr><td colspan="5" class="text-muted">Belum ada buku.</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('bookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  form.nettPrice = Number(form.nettPrice);
  form.stock = Number(form.stock);
  try {
    await api('/books', { 
      method: 'POST', 
      body: JSON.stringify(form) 
    });
    e.target.reset();
    toast('Buku ditambahkan', 'success');
    loadBooks();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// =====================
// REPLIES
// =====================
async function loadReplies() {
  try {
    const status = document.getElementById('statusFilter').value;
    const replies = await api('/replies' + (status ? `?status=${status}` : ''));
    
    // Update badge count
    const repliesCount = document.getElementById('repliesCount');
    const waitingCount = replies.filter(r => r.status === 'WAITING_STOCK_CHECK').length;
    if (repliesCount) {
      if (waitingCount > 0) {
        repliesCount.style.display = 'inline-flex';
        repliesCount.textContent = waitingCount;
      } else {
        repliesCount.style.display = 'none';
      }
    }
    
    document.getElementById('repliesTbody').innerHTML =
      replies
        .map(r => {
          const actions = [];
          if (r.status === 'WAITING_STOCK_CHECK') {
            actions.push(`<button class="btn btn-success btn-sm" onclick="confirmReply('${r.id}')">Confirm</button>`);
            actions.push(`<button class="btn btn-danger btn-sm" onclick="rejectReply('${r.id}')">Reject</button>`);
          }
          if (r.status === 'REJECTED') {
            actions.push(`<button class="btn btn-warning btn-sm" onclick="retryReply('${r.id}')">Fix Ulang</button>`);
          }
          return `
            <tr>
              <td class="text-muted" style="white-space:nowrap;">${fmtDate(r.replyTimestamp)}</td>
              <td>
                <strong>${r.customer ? r.customer.name : '-'}</strong>
                <div class="text-muted" style="font-size:11px;">${r.customer ? r.customer.phone : ''}</div>
              </td>
              <td>${r.book ? r.book.title : '-'}</td>
              <td><em>"${r.replyText}"</em></td>
              <td>${r.quantity || 1}</td>
              <td><span class="badge ${r.status}">${r.status}</span></td>
              <td><div class="d-flex gap-sm">${actions.join('')}</div></td>
            </tr>
          `;
        })
        .join('') || '<tr><td colspan="7" class="text-muted">Belum ada reply masuk.</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('statusFilter').addEventListener('change', loadReplies);
document.getElementById('refreshRepliesBtn').addEventListener('click', loadReplies);

window.confirmReply = async (id) => {
  try {
    await api(`/replies/${id}/confirm`, { 
      method: 'POST', 
      body: JSON.stringify({ adminName: 'admin' }) 
    });
    toast('Order dikonfirmasi — masuk tagihan', 'success');
    loadReplies();
    loadSummary();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.rejectReply = async (id) => {
  try {
    await api(`/replies/${id}/reject`, { 
      method: 'POST', 
      body: JSON.stringify({ adminName: 'admin', reason: 'Stock unavailable' }) 
    });
    toast('Order ditolak — tidak masuk tagihan', 'success');
    loadReplies();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.retryReply = async (id) => {
  try {
    await api(`/replies/${id}/retry`, { 
      method: 'POST', 
      body: JSON.stringify({ adminName: 'admin' }) 
    });
    toast('Fix ulang dibuat, menunggu konfirmasi stok lagi', 'success');
    loadReplies();
  } catch (err) {
    toast(err.message, 'error');
  }
};

// =====================
// INVOICE CHECK
// =====================
document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const resultEl = document.getElementById('invoiceResult');
  resultEl.innerHTML = '<div class="text-muted">Memuat...</div>';
  
  try {
    const data = await api(`/invoices/${encodeURIComponent(form.group)}/${encodeURIComponent(form.code)}`);
    resultEl.innerHTML = `
      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <h3>${data.customer.name} — ${data.customer.code}</h3>
          <span class="badge">${data.group.code}</span>
        </div>
        <div class="card-body">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Buku</th>
                  <th>Harga</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.length > 0 
                  ? data.items.map((item, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td><strong>${item.title}</strong></td>
                        <td>${rupiah(item.price)}</td>
                        <td>${item.quantity}</td>
                        <td><strong>${rupiah(item.subtotal)}</strong></td>
                        <td><span class="badge ${item.status}">${item.status}</span></td>
                      </tr>
                    `).join('')
                  : '<tr><td colspan="6" class="text-muted">Belum ada order yang masuk tagihan.</td></tr>'
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" class="text-right"><strong>TOTAL TAGIHAN:</strong></td>
                  <td colspan="2"><strong class="text-primary" style="font-size:16px;">${rupiah(data.total)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<div class="card" style="margin-top:20px;"><div class="card-body"><div class="text-muted">${err.message}</div></div></div>`;
  }
});

// =====================
// REPORTS
// =====================
async function loadReports() {
  try {
    const [sales, products, groupsReport] = await Promise.all([
      api('/reports/sales'),
      api('/reports/products'),
      api('/reports/groups'),
    ]);

    document.getElementById('salesTbody').innerHTML =
      sales.map(s => `
        <tr>
          <td>${s.date}</td>
          <td><strong>${s.orders}</strong></td>
          <td class="text-success fw-semibold">${rupiah(s.revenue)}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="text-muted">Belum ada data.</td></tr>';

    document.getElementById('productsTbody').innerHTML =
      products.map(p => `
        <tr>
          <td><strong>${p.title}</strong></td>
          <td>${p.qtySold}</td>
          <td class="text-success fw-semibold">${rupiah(p.revenue)}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="text-muted">Belum ada data.</td></tr>';

    document.getElementById('groupsReportTbody').innerHTML =
      groupsReport.map(g => `
        <tr>
          <td><strong>${g.code}</strong></td>
          <td>${g.orders}</td>
          <td class="text-success fw-semibold">${rupiah(g.revenue)}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="text-muted">Belum ada data.</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
}

// =====================
// INITIALIZE
// =====================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadSummary();
  refreshWaStatus();
});
