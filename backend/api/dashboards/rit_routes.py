from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List
import logging
from services.supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

ALL_TABLES = [
    "users", "cases", "interactions", "counsellors", "sos_events", 
    "case_updates", "staff", "staff_audit_log", "tasks", "milestones", 
    "referrals", "consents", "victim_profiles", "safety_settings",
    "otp_codes", "scheduled_calls", "victim_memory", "legal_documents"
]

class CreateUserPayload(BaseModel):
    username: str
    password: str
    role: str = "counsellor"
    name: Optional[str] = None
    phone_number: Optional[str] = None
    district: Optional[str] = "Central"
    state: Optional[str] = "Delhi"
    preferred_language: Optional[str] = "en"

class SetPasswordPayload(BaseModel):
    user_id: str
    new_password: str

class UpdateRolePayload(BaseModel):
    user_id: str
    role: str

# ---------------------------------------------------------------------------
# 1. HTML UI Endpoint at GET /rit and GET /rit/
# ---------------------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def superadmin_ui(request: Request):
    html_content = """<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AAVAZ SuperAdmin Console</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            brand: {
              50: '#f5f3ff',
              100: '#ede9fe',
              500: '#8b5cf6',
              600: '#7c3aed',
              700: '#6d28d9',
              800: '#5b21b6',
              900: '#4c1d95',
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      background: radial-gradient(circle at 15% 15%, #18122B 0%, #0F0C20 40%, #090714 100%);
      color: #F3F4F6;
      min-height: 100vh;
    }
    .glass-panel {
      background: rgba(25, 20, 45, 0.65);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .glass-card {
      background: rgba(30, 25, 55, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(139, 92, 246, 0.3);
      border-radius: 9999px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(139, 92, 246, 0.6);
    }
  </style>
</head>
<body class="font-sans antialiased text-slate-100 flex flex-col min-h-screen">

  <!-- Top Navigation Bar -->
  <header class="glass-panel sticky top-0 z-40 border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
        <i data-lucide="shield-alert" class="w-5 h-5 text-white"></i>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="font-bold text-lg tracking-tight text-white">AAVAZ <span class="text-purple-400 font-extrabold">SUPERADMIN</span></h1>
          <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full animate-pulse">
            Unrestricted Dev Access
          </span>
        </div>
        <p class="text-xs text-white/50">Full Database Manipulation & User Role Administration</p>
      </div>
    </div>

    <!-- Right Controls -->
    <div class="flex items-center gap-3">
      <div class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span class="w-2 h-2 rounded-full bg-emerald-400 -ml-3.5"></span>
        <span class="font-mono text-emerald-400 font-medium">PostgreSQL Connected</span>
      </div>
      <a href="/login" target="_blank" class="px-3.5 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-lg transition-all flex items-center gap-1.5">
        <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Test Login Portal
      </a>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
    
    <!-- Tab Switcher -->
    <div class="flex items-center justify-between border-b border-white/10 pb-4">
      <div class="flex items-center gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
        <button id="tab-btn-db" onclick="switchTab('db')" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all bg-purple-600 text-white shadow-lg shadow-purple-600/30">
          <i data-lucide="database" class="w-4 h-4"></i> Complete Database Explorer
        </button>
        <button id="tab-btn-users" onclick="switchTab('users')" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all text-white/60 hover:text-white hover:bg-white/5">
          <i data-lucide="users" class="w-4 h-4"></i> User Roles & Passwords
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="refreshCurrentView()" class="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all active:scale-95" title="Refresh">
          <i data-lucide="refresh-cw" class="w-4 h-4" id="refresh-icon"></i>
        </button>
      </div>
    </div>

    <!-- TAB 1: DATABASE EXPLORER -->
    <div id="tab-db" class="space-y-6">
      
      <!-- Tables Carousel / Grid -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-white/60 uppercase tracking-wider">Select Database Table (<span id="table-count">18</span> available)</span>
          <span class="text-xs text-purple-400 font-mono" id="active-table-label">Active: users</span>
        </div>
        <div id="tables-container" class="flex flex-wrap gap-2">
          <!-- Populated by JS -->
          <div class="text-xs text-white/40 animate-pulse">Loading database schema...</div>
        </div>
      </div>

      <!-- Table Toolbar -->
      <div class="glass-panel p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-1">
          <div class="relative flex-1 max-w-md">
            <i data-lucide="search" class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"></i>
            <input type="text" id="search-input" oninput="handleSearch(this.value)" placeholder="Search current table rows..." class="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:border-purple-500 transition-colors">
          </div>
          <span class="text-xs text-white/50 whitespace-nowrap" id="row-count-badge">0 rows loaded</span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openInsertModal()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 active:scale-95">
            <i data-lucide="plus-circle" class="w-4 h-4"></i> Insert Record
          </button>
          <button onclick="exportTableJson()" class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95">
            <i data-lucide="download" class="w-4 h-4"></i> Export JSON
          </button>
        </div>
      </div>

      <!-- Table Data Grid -->
      <div class="glass-panel rounded-2xl overflow-hidden border border-white/10">
        <div class="overflow-x-auto custom-scrollbar max-h-[620px]">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-black/60 sticky top-0 z-10 border-b border-white/10">
              <tr id="table-header-row">
                <th class="px-4 py-3 font-bold text-white/70">Columns</th>
              </tr>
            </thead>
            <tbody id="table-body" class="divide-y divide-white/5 font-mono">
              <tr>
                <td class="px-4 py-8 text-center text-white/40" colspan="100%">Loading records...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: USER ROLES & PASSWORDS -->
    <div id="tab-users" class="hidden space-y-6">
      
      <!-- User Creation Form Card -->
      <div class="glass-panel p-6 rounded-2xl border border-white/10">
        <div class="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
          <div class="p-2 rounded-lg bg-purple-500/20 text-purple-300">
            <i data-lucide="user-plus" class="w-5 h-5"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-white">Create New User & Assign Role</h2>
            <p class="text-xs text-white/50">Provisions directly into Supabase Auth with custom password & role metadata</p>
          </div>
        </div>

        <form id="create-user-form" onsubmit="handleCreateUser(event)" class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-white/70 uppercase mb-1.5">Username / Email *</label>
            <input type="text" id="new-user-username" required placeholder="counsellor_delhi or name@gov.in" class="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500">
            <span class="text-[11px] text-white/40 mt-1 block">Plain usernames auto-mapped to @sih.gov.in</span>
          </div>

          <div>
            <label class="block text-xs font-bold text-white/70 uppercase mb-1.5">Full Name *</label>
            <input type="text" id="new-user-name" required placeholder="Dr. Rajesh Kumar" class="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500">
          </div>

          <div>
            <label class="block text-xs font-bold text-white/70 uppercase mb-1.5">Assign Role *</label>
            <select id="new-user-role" class="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500">
              <option value="super_admin">⚡ super_admin (Full Access)</option>
              <option value="admin_national">🇮🇳 admin_national (National Admin)</option>
              <option value="admin_state">🏛️ admin_state (State Officer)</option>
              <option value="admin_district">📍 admin_district (District Officer)</option>
              <option value="counsellor" selected>🤝 counsellor (Case Counsellor)</option>
              <option value="victim">👤 victim (Citizen / Victim)</option>
              <option value="witness">👁️ witness (Witness)</option>
              <option value="family">👨‍👩‍👧 family (Family Member)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-white/70 uppercase mb-1.5">Set Password *</label>
            <div class="relative">
              <input type="text" id="new-user-password" required placeholder="Min 6 characters" value="Admin@123" class="w-full pl-3.5 pr-10 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white font-mono placeholder-white/30 focus:outline-none focus:border-purple-500">
              <button type="button" onclick="generateRandomPassword()" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-purple-400 hover:text-purple-300 font-bold px-2 py-1 bg-white/5 rounded">Gen</button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-white/70 uppercase mb-1.5">Phone Number</label>
            <input type="text" id="new-user-phone" placeholder="+91 9876543210" class="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500">
          </div>

          <div>
            <label class="block text-xs font-bold text-white/70 uppercase mb-1.5">District & Language</label>
            <div class="flex gap-2">
              <input type="text" id="new-user-district" placeholder="District" value="Delhi Central" class="w-2/3 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white">
              <select id="new-user-lang" class="w-1/3 px-2 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-sm text-white">
                <option value="en">EN</option>
                <option value="hi" selected>HI</option>
                <option value="ta">TA</option>
                <option value="ml">ML</option>
              </select>
            </div>
          </div>

          <div class="md:col-span-3 flex justify-end pt-2">
            <button type="submit" id="btn-create-user" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-purple-600/30 transition-all active:scale-95 flex items-center gap-2">
              <i data-lucide="user-check" class="w-4 h-4"></i> Create User & Set Role
            </button>
          </div>
        </form>
      </div>

      <!-- Users Directory Table -->
      <div class="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-white">Active Users Directory</h2>
            <p class="text-xs text-white/50" id="users-count-label">Loading registered users...</p>
          </div>
          <button onclick="fetchUsers()" class="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh Users
          </button>
        </div>

        <div class="overflow-x-auto custom-scrollbar border border-white/10 rounded-xl">
          <table class="w-full text-left text-xs border-collapse font-sans">
            <thead class="bg-black/60 border-b border-white/10">
              <tr>
                <th class="px-4 py-3 font-bold text-white/70">User / Email</th>
                <th class="px-4 py-3 font-bold text-white/70">Name</th>
                <th class="px-4 py-3 font-bold text-white/70">Assigned Role</th>
                <th class="px-4 py-3 font-bold text-white/70">User ID</th>
                <th class="px-4 py-3 font-bold text-white/70">Created At</th>
                <th class="px-4 py-3 font-bold text-white/70 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="users-table-body" class="divide-y divide-white/5 font-mono">
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-white/40">Loading users...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- MODAL: Insert / Edit Record -->
  <div id="record-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="glass-panel max-w-2xl w-full p-6 rounded-2xl border border-white/15 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 id="record-modal-title" class="font-bold text-base text-white">Insert Record</h3>
        <button onclick="closeRecordModal()" class="text-white/50 hover:text-white">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div>
        <label class="block text-xs font-mono text-purple-300 mb-1">Payload (JSON Object):</label>
        <textarea id="record-json-editor" rows="12" class="w-full p-3 bg-black/60 border border-white/15 rounded-xl font-mono text-xs text-emerald-400 focus:outline-none focus:border-purple-500 custom-scrollbar"></textarea>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2">
        <button onclick="closeRecordModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold">Cancel</button>
        <button id="btn-save-record" onclick="saveRecord()" class="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30">Save Record</button>
      </div>
    </div>
  </div>

  <!-- MODAL: Set Password -->
  <div id="password-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="glass-panel max-w-md w-full p-6 rounded-2xl border border-white/15 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 class="font-bold text-base text-white flex items-center gap-2">
          <i data-lucide="key" class="w-4 h-4 text-amber-400"></i> Set New Password
        </h3>
        <button onclick="closePasswordModal()" class="text-white/50 hover:text-white">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div>
        <p class="text-xs text-white/60 mb-2">Changing password for: <span id="pwd-modal-user" class="font-mono text-purple-300 font-bold"></span></p>
        <label class="block text-xs font-bold text-white/70 uppercase mb-1">New Password *</label>
        <input type="text" id="pwd-modal-input" placeholder="Enter new password (min 6 chars)" class="w-full px-3.5 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-purple-500">
      </div>

      <div class="flex items-center justify-end gap-3 pt-2">
        <button onclick="closePasswordModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold">Cancel</button>
        <button onclick="submitPasswordChange()" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/30">Update Password</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div id="toast-container" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- Frontend Logic -->
  <script>
    let activeTab = 'db';
    let activeTable = 'users';
    let currentTableData = [];
    let allUsers = [];
    let editingRowId = null;
    let selectedUserIdForPassword = null;

    // Toast helper
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xl transition-all duration-300 pointer-events-auto border ${
        type === 'success' ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40' : 'bg-rose-950/90 text-rose-200 border-rose-500/40'
      }`;
      toast.innerHTML = `<span class="${type === 'success' ? 'text-emerald-400' : 'text-rose-400'}">●</span> ${message}`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    function switchTab(tab) {
      activeTab = tab;
      const dbTab = document.getElementById('tab-db');
      const usersTab = document.getElementById('tab-users');
      const dbBtn = document.getElementById('tab-btn-db');
      const usersBtn = document.getElementById('tab-btn-users');

      if (tab === 'db') {
        dbTab.classList.remove('hidden');
        usersTab.classList.add('hidden');
        dbBtn.className = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all bg-purple-600 text-white shadow-lg shadow-purple-600/30';
        usersBtn.className = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all text-white/60 hover:text-white hover:bg-white/5';
      } else {
        dbTab.classList.add('hidden');
        usersTab.classList.remove('hidden');
        usersBtn.className = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all bg-purple-600 text-white shadow-lg shadow-purple-600/30';
        dbBtn.className = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all text-white/60 hover:text-white hover:bg-white/5';
        fetchUsers();
      }
      lucide.createIcons();
    }

    function refreshCurrentView() {
      const icon = document.getElementById('refresh-icon');
      icon.classList.add('animate-spin');
      if (activeTab === 'db') {
        fetchTables().then(() => fetchTableData(activeTable)).finally(() => icon.classList.remove('animate-spin'));
      } else {
        fetchUsers().finally(() => icon.classList.remove('animate-spin'));
      }
    }

    // -----------------------------------------------------------------------
    // DB Explorer
    // -----------------------------------------------------------------------
    async function fetchTables() {
      try {
        const res = await fetch('/rit/api/tables', { headers: { 'ngrok-skip-browser-warning': '1' } });
        const json = await res.json();
        const container = document.getElementById('tables-container');
        container.innerHTML = '';
        document.getElementById('table-count').innerText = json.tables.length;

        json.tables.forEach(t => {
          const btn = document.createElement('button');
          btn.onclick = () => selectDbTable(t.name);
          const isActive = t.name === activeTable;
          btn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
            isActive 
              ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20' 
              : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
          }`;
          btn.innerHTML = `
            <span>${t.name}</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono ${isActive ? 'bg-purple-800 text-white' : 'bg-black/40 text-white/60'}">${t.count}</span>
          `;
          container.appendChild(btn);
        });
      } catch (err) {
        showToast('Failed to load database tables: ' + err.message, 'error');
      }
    }

    function selectDbTable(tableName) {
      activeTable = tableName;
      document.getElementById('active-table-label').innerText = 'Active: ' + tableName;
      fetchTables();
      fetchTableData(tableName);
    }

    async function fetchTableData(tableName) {
      const tbody = document.getElementById('table-body');
      const thead = document.getElementById('table-header-row');
      tbody.innerHTML = '<tr><td class="px-4 py-8 text-center text-white/40" colspan="100%">Loading records from ' + tableName + '...</td></tr>';
      
      try {
        const res = await fetch(`/rit/api/tables/${tableName}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
        const json = await res.json();
        currentTableData = json.data || [];
        renderTable(currentTableData);
      } catch (err) {
        tbody.innerHTML = '<tr><td class="px-4 py-8 text-center text-rose-400" colspan="100%">Error: ' + err.message + '</td></tr>';
        showToast('Error loading table ' + tableName, 'error');
      }
    }

    function renderTable(data) {
      const thead = document.getElementById('table-header-row');
      const tbody = document.getElementById('table-body');
      document.getElementById('row-count-badge').innerText = `${data.length} rows loaded`;

      if (data.length === 0) {
        thead.innerHTML = '<th class="px-4 py-3 font-bold text-white/70">Columns</th><th class="px-4 py-3 text-right">Actions</th>';
        tbody.innerHTML = '<tr><td class="px-4 py-8 text-center text-white/40 italic" colspan="100%">Table is empty. Use "Insert Record" to add data.</td></tr>';
        return;
      }

      const columns = Object.keys(data[0]);
      thead.innerHTML = columns.map(c => `<th class="px-4 py-3 font-bold text-white/70 tracking-wider whitespace-nowrap">${c}</th>`).join('') + '<th class="px-4 py-3 text-right sticky right-0 bg-black/80">Actions</th>';

      tbody.innerHTML = data.map(row => {
        const rowId = row.id || row.user_id || Object.values(row)[0];
        const cells = columns.map(c => {
          let val = row[c];
          if (val === null || val === undefined) return '<td class="px-4 py-2.5 text-white/30 italic">null</td>';
          if (typeof val === 'object') val = JSON.stringify(val);
          return `<td class="px-4 py-2.5 text-slate-200 whitespace-nowrap max-w-[240px] truncate" title="${String(val).replace(/"/g, '&quot;')}">${String(val)}</td>`;
        }).join('');

        return `
          <tr class="hover:bg-white/5 transition-colors">
            ${cells}
            <td class="px-4 py-2.5 text-right whitespace-nowrap sticky right-0 bg-slate-950/80">
              <button onclick="editRow('${rowId}')" class="p-1 text-white/60 hover:text-purple-400 hover:bg-white/5 rounded transition-all mr-1" title="Edit JSON">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="deleteRow('${rowId}')" class="p-1 text-white/60 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all" title="Delete">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
      lucide.createIcons();
    }

    function handleSearch(term) {
      if (!term.trim()) {
        renderTable(currentTableData);
        return;
      }
      const lower = term.toLowerCase();
      const filtered = currentTableData.filter(row => 
        Object.values(row).some(v => String(v).toLowerCase().includes(lower))
      );
      renderTable(filtered);
    }

    function openInsertModal() {
      editingRowId = null;
      document.getElementById('record-modal-title').innerText = `Insert into ${activeTable}`;
      let sample = {};
      if (currentTableData.length > 0) {
        Object.keys(currentTableData[0]).forEach(k => {
          if (k !== 'id' && k !== 'created_at' && k !== 'updated_at') {
            sample[k] = "";
          }
        });
      } else {
        sample = { name: "Test Record" };
      }
      document.getElementById('record-json-editor').value = JSON.stringify(sample, null, 2);
      document.getElementById('record-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function editRow(rowId) {
      editingRowId = rowId;
      const row = currentTableData.find(r => (r.id || r.user_id || Object.values(r)[0]) == rowId);
      if (!row) return;
      document.getElementById('record-modal-title').innerText = `Edit row in ${activeTable} (${rowId})`;
      document.getElementById('record-json-editor').value = JSON.stringify(row, null, 2);
      document.getElementById('record-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeRecordModal() {
      document.getElementById('record-modal').classList.add('hidden');
    }

    async function saveRecord() {
      const editor = document.getElementById('record-json-editor');
      let payload;
      try {
        payload = JSON.parse(editor.value);
      } catch (e) {
        showToast('Invalid JSON: ' + e.message, 'error');
        return;
      }

      try {
        let res;
        if (editingRowId) {
          res = await fetch(`/rit/api/tables/${activeTable}/${editingRowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
            body: JSON.stringify(payload)
          });
        } else {
          res = await fetch(`/rit/api/tables/${activeTable}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
            body: JSON.stringify(payload)
          });
        }
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Save failed');
        }
        showToast(editingRowId ? 'Record updated!' : 'Record inserted!');
        closeRecordModal();
        fetchTableData(activeTable);
        fetchTables();
      } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
      }
    }

    async function deleteRow(rowId) {
      if (!confirm(`Are you sure you want to delete row ${rowId} from ${activeTable}?`)) return;
      try {
        const res = await fetch(`/rit/api/tables/${activeTable}/${rowId}`, {
          method: 'DELETE',
          headers: { 'ngrok-skip-browser-warning': '1' }
        });
        if (!res.ok) throw new Error('Delete failed');
        showToast(`Row ${rowId} deleted`);
        fetchTableData(activeTable);
        fetchTables();
      } catch (err) {
        showToast('Delete error: ' + err.message, 'error');
      }
    }

    function exportTableJson() {
      const blob = new Blob([JSON.stringify(currentTableData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTable}_export.json`;
      a.click();
    }

    // -----------------------------------------------------------------------
    // User & Role Management
    // -----------------------------------------------------------------------
    function generateRandomPassword() {
      const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
      let pwd = "";
      for (let i = 0; i < 10; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      document.getElementById('new-user-password').value = pwd;
    }

    async function handleCreateUser(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-create-user');
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Creating...`;

      const payload = {
        username: document.getElementById('new-user-username').value.trim(),
        name: document.getElementById('new-user-name').value.trim(),
        role: document.getElementById('new-user-role').value,
        password: document.getElementById('new-user-password').value.trim(),
        phone_number: document.getElementById('new-user-phone').value.trim() || undefined,
        district: document.getElementById('new-user-district').value.trim() || "Central",
        preferred_language: document.getElementById('new-user-lang').value
      };

      try {
        const res = await fetch('/rit/api/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || 'Creation failed');

        showToast(`User ${payload.username} (${payload.role}) created successfully!`);
        document.getElementById('create-user-form').reset();
        document.getElementById('new-user-password').value = "Admin@123";
        fetchUsers();
      } catch (err) {
        showToast('Create user failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="user-check" class="w-4 h-4"></i> Create User & Set Role`;
        lucide.createIcons();
      }
    }

    async function fetchUsers() {
      const tbody = document.getElementById('users-table-body');
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-white/40">Fetching users...</td></tr>';
      try {
        const res = await fetch('/rit/api/users', { headers: { 'ngrok-skip-browser-warning': '1' } });
        const json = await res.json();
        allUsers = json.users || [];
        document.getElementById('users-count-label').innerText = `${allUsers.length} total registered users`;

        if (allUsers.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-white/40">No users found in database.</td></tr>';
          return;
        }

        tbody.innerHTML = allUsers.map(u => {
          const roleColor = {
            super_admin: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
            admin_national: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
            admin_state: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
            admin_district: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
            counsellor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
            victim: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }[u.role] || 'bg-white/10 text-white/80 border-white/20';

          return `
            <tr class="hover:bg-white/5 transition-colors font-sans">
              <td class="px-4 py-3">
                <div class="font-bold text-white text-xs">${u.email || u.username || 'No Email'}</div>
                <div class="text-[11px] text-white/40">${u.phone || 'No phone'}</div>
              </td>
              <td class="px-4 py-3 text-white/90 text-xs font-medium">${u.name || '-'}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${roleColor}">
                  ${u.role}
                </span>
              </td>
              <td class="px-4 py-3 text-white/40 font-mono text-[11px] truncate max-w-[140px]" title="${u.id}">${u.id.substring(0, 8)}...</td>
              <td class="px-4 py-3 text-white/40 text-xs">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button onclick="openPasswordModal('${u.id}', '${u.email || u.username}')" class="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold mr-1 transition-all">
                  Key
                </button>
                <button onclick="promptChangeRole('${u.id}', '${u.role}')" class="px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold mr-1 transition-all">
                  Role
                </button>
                <button onclick="deleteUser('${u.id}')" class="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all">
                  Del
                </button>
              </td>
            </tr>
          `;
        }).join('');
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-rose-400">Failed: ' + err.message + '</td></tr>';
      }
    }

    function openPasswordModal(userId, identifier) {
      selectedUserIdForPassword = userId;
      document.getElementById('pwd-modal-user').innerText = identifier;
      document.getElementById('pwd-modal-input').value = "";
      document.getElementById('password-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closePasswordModal() {
      document.getElementById('password-modal').classList.add('hidden');
    }

    async function submitPasswordChange() {
      const pwd = document.getElementById('pwd-modal-input').value.trim();
      if (!pwd || pwd.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
      }

      try {
        const res = await fetch('/rit/api/users/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ user_id: selectedUserIdForPassword, new_password: pwd })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Password update failed');
        }
        showToast('Password updated successfully!');
        closePasswordModal();
      } catch (err) {
        showToast('Failed to update password: ' + err.message, 'error');
      }
    }

    async function promptChangeRole(userId, currentRole) {
      const newRole = prompt(`Enter new role for user (super_admin, admin_district, admin_state, admin_national, counsellor, victim):`, currentRole);
      if (!newRole || newRole === currentRole) return;

      try {
        const res = await fetch('/rit/api/users/update-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ user_id: userId, role: newRole })
        });
        if (!res.ok) throw new Error('Role update failed');
        showToast(`Role updated to ${newRole}`);
        fetchUsers();
      } catch (err) {
        showToast('Role update failed: ' + err.message, 'error');
      }
    }

    async function deleteUser(userId) {
      if (!confirm(`Delete user ${userId} completely from Auth and Database?`)) return;
      try {
        const res = await fetch(`/rit/api/users/${userId}`, {
          method: 'DELETE',
          headers: { 'ngrok-skip-browser-warning': '1' }
        });
        if (!res.ok) throw new Error('Delete user failed');
        showToast('User deleted successfully');
        fetchUsers();
      } catch (err) {
        showToast('Failed to delete user: ' + err.message, 'error');
      }
    }

    // Initial Load
    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
      fetchTables().then(() => fetchTableData(activeTable));
    });
  </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)


# ---------------------------------------------------------------------------
# 2. Database Explorer APIs (Unrestricted)
# ---------------------------------------------------------------------------
@router.get("/api/tables")
async def list_tables():
    """Returns list of all 18 tables with row counts."""
    supabase = await get_supabase()
    results = []
    for t in ALL_TABLES:
        try:
            r = await supabase.table(t).select("*", count="exact").limit(1).execute()
            count = r.count if r.count is not None else 0
            results.append({"name": t, "count": count})
        except Exception:
            results.append({"name": t, "count": 0})
    return {"tables": results}

@router.get("/api/tables/{table_name}")
async def get_table_rows(
    table_name: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    if table_name not in ALL_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
    supabase = await get_supabase()
    try:
        resp = await supabase.table(table_name).select("*").range(offset, offset + limit - 1).execute()
        return {"data": resp.data or []}
    except Exception as e:
        logger.error(f"Error fetching {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/tables/{table_name}")
async def insert_table_row(table_name: str, payload: Dict[str, Any]):
    if table_name not in ALL_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
    supabase = await get_supabase()
    try:
        resp = await supabase.table(table_name).insert(payload).execute()
        return {"status": "success", "data": resp.data}
    except Exception as e:
        logger.error(f"Error inserting into {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/tables/{table_name}/{row_id}")
async def update_table_row(table_name: str, row_id: str, payload: Dict[str, Any]):
    if table_name not in ALL_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
    supabase = await get_supabase()
    try:
        # Avoid updating primary key 'id'
        clean_payload = {k: v for k, v in payload.items() if k != "id"}
        resp = await supabase.table(table_name).update(clean_payload).eq("id", row_id).execute()
        return {"status": "success", "data": resp.data}
    except Exception as e:
        logger.error(f"Error updating {table_name} {row_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/tables/{table_name}/{row_id}")
async def delete_table_row(table_name: str, row_id: str):
    if table_name not in ALL_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
    supabase = await get_supabase()
    try:
        await supabase.table(table_name).delete().eq("id", row_id).execute()
        return {"status": "success", "message": f"Deleted row {row_id} from {table_name}"}
    except Exception as e:
        logger.error(f"Error deleting row from {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# 3. User & Role Management APIs (Unrestricted)
# ---------------------------------------------------------------------------
@router.get("/api/users")
async def list_all_users():
    """Returns combined list of Auth users and DB user records."""
    supabase = await get_supabase()
    try:
        auth_users = await supabase.auth.admin.list_users()
        db_users_resp = await supabase.table("users").select("*").execute()
        db_map = {u["id"]: u for u in (db_users_resp.data or [])}

        results = []
        for u in auth_users:
            meta = u.user_metadata or {}
            db_rec = db_map.get(str(u.id), {})
            role = meta.get("role") or db_rec.get("role_type") or "counsellor"
            name = meta.get("name") or db_rec.get("name") or (u.email.split("@")[0] if u.email else "User")

            results.append({
                "id": str(u.id),
                "email": u.email,
                "phone": u.phone or db_rec.get("phone_number"),
                "name": name,
                "role": role,
                "created_at": getattr(u, "created_at", None) or db_rec.get("created_at"),
                "metadata": meta,
            })
        return {"users": results}
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/users/create")
async def create_user(payload: CreateUserPayload):
    """
    Creates user in Supabase Auth via Admin API with role metadata and password,
    and inserts profile records in `users` and `staff` if applicable.
    """
    supabase = await get_supabase()
    email = payload.username if "@" in payload.username else f"{payload.username}@sih.gov.in"
    name = payload.name or payload.username
    phone = payload.phone_number or f"+9199{hash(email) % 100000000:08d}"

    try:
        # 1. Create user in Supabase Auth
        user_resp = await supabase.auth.admin.create_user({
            "email": email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {
                "role": payload.role,
                "name": name,
                "username": payload.username,
                "district": payload.district,
                "state": payload.state,
                "language": payload.preferred_language,
            }
        })
        user_id = str(user_resp.user.id)

        # 2. Insert into users table if victim/witness/family or as base user
        db_role = payload.role if payload.role in ('victim', 'witness', 'family') else 'victim'
        try:
            await supabase.table("users").upsert({
                "id": user_id,
                "name": name,
                "phone_number": phone,
                "role_type": db_role,
                "preferred_language": payload.preferred_language or "en",
                "location_district": payload.district or "Central",
                "location_state": payload.state or "Delhi",
                "consent_given": True,
            }).execute()
        except Exception as e:
            logger.warning(f"Could not upsert into users table: {e}")

        # 3. If staff role, insert into staff table
        if payload.role in ('super_admin', 'admin_district', 'district_admin', 'admin_state', 'state_admin', 'admin_national', 'national_admin', 'counsellor'):
            try:
                await supabase.table("staff").upsert({
                    "user_id": user_id,
                    "role": payload.role,
                    "district_scope": [payload.district or "Central"],
                    "languages": [payload.preferred_language or "en"],
                    "is_active": True,
                }).execute()
            except Exception as e:
                logger.warning(f"Could not upsert into staff table: {e}")

        return {
            "status": "success",
            "user_id": user_id,
            "email": email,
            "role": payload.role,
            "name": name
        }
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/users/set-password")
async def set_user_password(payload: SetPasswordPayload):
    """Updates password for a user in Supabase Auth."""
    supabase = await get_supabase()
    try:
        await supabase.auth.admin.update_user_by_id(payload.user_id, {
            "password": payload.new_password
        })
        return {"status": "success", "message": f"Password updated for user {payload.user_id}"}
    except Exception as e:
        logger.error(f"Error setting password: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/users/update-role")
async def update_user_role(payload: UpdateRolePayload):
    """Updates role in user_metadata and staff/users table."""
    supabase = await get_supabase()
    try:
        # Update Supabase Auth metadata
        user = await supabase.auth.admin.get_user_by_id(payload.user_id)
        meta = user.user.user_metadata or {}
        meta["role"] = payload.role
        await supabase.auth.admin.update_user_by_id(payload.user_id, {"user_metadata": meta})

        # Update staff table if applicable
        try:
            await supabase.table("staff").update({"role": payload.role}).eq("user_id", payload.user_id).execute()
        except Exception:
            pass

        # Update users table if valid enum
        if payload.role in ('victim', 'witness', 'family'):
            try:
                await supabase.table("users").update({"role_type": payload.role}).eq("id", payload.user_id).execute()
            except Exception:
                pass

        return {"status": "success", "user_id": payload.user_id, "role": payload.role}
    except Exception as e:
        logger.error(f"Error updating role: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/users/{user_id}")
async def delete_user(user_id: str):
    """Deletes user from Supabase Auth and database."""
    supabase = await get_supabase()
    try:
        # 1. Delete from DB tables
        for tbl in ["staff", "users"]:
            try:
                field = "user_id" if tbl == "staff" else "id"
                await supabase.table(tbl).delete().eq(field, user_id).execute()
            except Exception:
                pass

        # 2. Delete from Supabase Auth
        await supabase.auth.admin.delete_user(user_id)
        return {"status": "success", "message": f"User {user_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
