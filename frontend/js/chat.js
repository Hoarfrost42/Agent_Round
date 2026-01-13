/**
 * Main Chat Controller
 * Orchestrates API, UI, and Events
 */

const api = new AgentAPI();

const AppState = {
    sessionId: null,
    selectedModels: [],
    isProcessing: false,
    providers: [],
    allModels: [] // Added for reference
};

// UI Elements References (Shared Global)
const UI = {
    chatContainer: document.getElementById('chat-container'),
    inputArea: document.getElementById('input-textarea'),
    sendBtn: document.getElementById('send-button'),
    modelList: document.getElementById('model-list-container'), // This ID must match HTML
    statusBadge: document.getElementById('status-badge'),
    statusText: document.getElementById('status-text'),
    exportBtn: document.getElementById('export-btn'),
    // Sidebar
    newChatBtn: document.getElementById('new-chat-btn'),
    historyList: document.getElementById('history-list'),
    settingsBtn: document.getElementById('settings-btn'),
    exitBtn: document.getElementById('exit-btn'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    console.log('Initializing Chat App...');
    // Refresh UI references to ensure they exist (redundant but safe)
    UI.chatContainer = document.getElementById('chat-container');
    UI.inputArea = document.getElementById('input-textarea');
    UI.sendBtn = document.getElementById('send-button');
    UI.modelList = document.getElementById('model-list-container');
    UI.statusBadge = document.getElementById('status-badge');
    UI.statusText = document.getElementById('status-text');
    UI.newChatBtn = document.getElementById('new-chat-btn');
    UI.historyList = document.getElementById('history-list');
    UI.settingsBtn = document.getElementById('settings-btn');
    UI.exitBtn = document.getElementById('exit-btn');

    try {
        setupModelClickHandler(); // Helper for sidebar click if needed, or delegation
        await loadProviders();
        await loadSessionList();
        setupEventListeners();

        // Check URL for session ID (future)
    } catch (e) {
        console.error("Init failed:", e);
        // Assuming appendSystemMessage is global from chat-ui.js
        if (typeof appendSystemMessage === 'function') {
            appendSystemMessage("无法连接到后端服务器，请确认后端已启动 (localhost:8000)");
        }
    }
}

function setupEventListeners() {
    UI.sendBtn.addEventListener('click', handleSend);
    UI.inputArea.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    UI.newChatBtn.addEventListener('click', startNewSession);
    UI.settingsBtn.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });

    // Export button
    if (UI.exportBtn) {
        UI.exportBtn.addEventListener('click', handleExport);
    }

    // Template dropdown
    setupTemplateDropdown();

    // Robust handling for exit btn
    if (UI.exitBtn) {
        UI.exitBtn.addEventListener('click', handleShutdown);
    }

    // Fallback: Global delegation
    document.addEventListener('click', (e) => {
        if (e.target.closest('#exit-btn')) {
            if (!UI.exitBtn) {
                handleShutdown();
            }
        }
    });
}

// Add this helper if it was missing in previous steps
function setupModelClickHandler() {
    // handled in renderModelSelector directly via onclick
}

async function handleShutdown() {
    if (!confirm('确定要关闭服务并退出吗？\n这将停止后端进程并释放端口。')) return;

    try {
        // Optimistically show message immediately
        document.body.innerHTML = `
            <div class="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center text-white space-y-4">
                <i class="ph ph-power text-6xl text-red-500"></i>
                <h1 class="text-2xl font-bold">服务已停止</h1>
                <p class="text-gray-400">您可以安全地关闭此窗口了。</p>
            </div>
        `;

        await api.shutdown();
    } catch (e) {
        console.error("Shutdown signal sent:", e);
    }
}

async function handleExport() {
    if (!AppState.sessionId) {
        alert('请先开始一个会话');
        return;
    }

    try {
        const url = `${api.baseUrl}/api/sessions/${AppState.sessionId}/export`;
        // 创建隐藏的 a 标签触发下载
        const a = document.createElement('a');
        a.href = url;
        a.download = '';  // 让服务器决定文件名
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        console.error("Export failed:", e);
        alert('导出失败: ' + e.message);
    }
}

// 默认预设模板
const DEFAULT_TEMPLATES = {
    'analyze': { name: '系统分析', icon: 'magnifying-glass', content: '请从系统分析的角度，深入分析以下问题：\n\n[在此描述问题]\n\n1. 问题的核心是什么？\n2. 有哪些影响因素？\n3. 可能的解决方案有哪些？' },
    'code-review': { name: '代码审查', icon: 'code', content: '请对以下代码进行代码审查，关注：\n1. 代码质量和可读性\n2. 潜在的 Bug 和安全问题\n3. 性能优化建议\n4. 最佳实践建议\n\n```\n[粘贴代码]\n```' },
    'brainstorm': { name: '头脑风暴', icon: 'lightbulb', content: '让我们进行头脑风暴，主题是：\n\n[描述主题]\n\n请从不同角度提出创意想法，越多越好，不用考虑可行性限制。' },
    'pros-cons': { name: '利弊分析', icon: 'scales', content: '请对以下方案进行利弊分析：\n\n[描述方案]\n\n请列出：\n- 优点/好处\n- 缺点/风险\n- 综合建议' },
    'technical': { name: '技术方案', icon: 'wrench', content: '请为以下需求设计技术方案：\n\n[描述需求]\n\n请包含：\n1. 架构设计\n2. 技术选型\n3. 实现步骤\n4. 风险评估' }
};

// 从 localStorage 加载模板，如果没有则使用默认
function loadTemplates() {
    const saved = localStorage.getItem('agent_templates');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            return DEFAULT_TEMPLATES;
        }
    }
    return DEFAULT_TEMPLATES;
}

// 保存模板到 localStorage
function saveTemplates(templates) {
    localStorage.setItem('agent_templates', JSON.stringify(templates));
}

function setupTemplateDropdown() {
    const templateBtn = document.getElementById('template-btn');
    const templateMenu = document.getElementById('template-menu');

    if (!templateBtn || !templateMenu) return;

    // 动态渲染模板菜单
    function renderTemplateMenu() {
        const templates = loadTemplates();
        templateMenu.innerHTML = `
            <div class="px-3 py-1.5 text-xs text-gray-400 uppercase tracking-wider flex justify-between items-center">
                <span>快速开始</span>
                <button onclick="event.stopPropagation(); openTemplateManager()" class="text-blue-500 hover:text-blue-700" title="管理模板">
                    <i class="ph ph-gear-six"></i>
                </button>
            </div>
        `;
        Object.entries(templates).forEach(([key, tpl]) => {
            const btn = document.createElement('button');
            btn.className = 'template-item w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2';
            btn.dataset.template = key;
            btn.innerHTML = `<i class="ph ph-${tpl.icon || 'file-text'}"></i> ${tpl.name}`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.inputArea.value = tpl.content;
                UI.inputArea.focus();
                UI.inputArea.style.height = 'auto';
                UI.inputArea.style.height = Math.min(UI.inputArea.scrollHeight, 160) + 'px';
                templateMenu.classList.add('hidden');
            });
            templateMenu.appendChild(btn);
        });
    }

    renderTemplateMenu();

    // Toggle menu
    templateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderTemplateMenu(); // 重新渲染以获取最新数据
        templateMenu.classList.toggle('hidden');
    });

    // Close on click outside
    document.addEventListener('click', () => {
        templateMenu.classList.add('hidden');
    });
}

// 打开模板管理器（简单实现：使用 prompt）
function openTemplateManager() {
    const templates = loadTemplates();
    const names = Object.entries(templates).map(([k, v]) => `${k}: ${v.name}`).join('\n');

    const action = prompt(`当前模板：\n${names}\n\n输入操作：\n- add:键名:名称:图标:内容\n- del:键名\n- reset (恢复默认)`);

    if (!action) return;

    if (action === 'reset') {
        saveTemplates(DEFAULT_TEMPLATES);
        alert('已恢复默认模板');
        return;
    }

    if (action.startsWith('add:')) {
        const parts = action.substring(4).split(':');
        if (parts.length >= 4) {
            const [key, name, icon, ...contentParts] = parts;
            templates[key] = { name, icon, content: contentParts.join(':') };
            saveTemplates(templates);
            alert(`已添加模板: ${name}`);
        } else {
            alert('格式错误，请使用: add:键名:名称:图标:内容');
        }
        return;
    }

    if (action.startsWith('del:')) {
        const key = action.substring(4);
        if (templates[key]) {
            delete templates[key];
            saveTemplates(templates);
            alert(`已删除模板: ${key}`);
        } else {
            alert(`模板不存在: ${key}`);
        }
        return;
    }

    alert('未知操作');
}

async function loadProviders() {
    const providers = await api.getProviders();
    AppState.providers = providers;
    renderModelSelector(providers); // From chat-ui.js
}

async function loadSessionList() {
    try {
        const sessions = await api.listSessions();
        renderSessionList(sessions); // From chat-ui.js
    } catch (e) {
        console.error("Failed to load sessions:", e);
    }
}

async function deleteSession(sessionId) {
    try {
        await api.deleteSession(sessionId);

        // If deleted current session, reset view
        if (AppState.sessionId === sessionId) {
            startNewSession();
        } else {
            // Just refresh list
            loadSessionList();
        }
    } catch (e) {
        console.error("Failed to delete session:", e);
        alert("删除失败: " + e.message);
    }
}

async function switchSession(sessionId) {
    if (sessionId === AppState.sessionId) return;

    try {
        // Close existing SSE connection if any (logic in chat-stream/chat-ui)
        if (AppState.eventSource) {
            AppState.eventSource.close();
            AppState.eventSource = null;
        }

        const session = await api.getSession(sessionId);
        AppState.sessionId = session.id;
        // 显示导出按钮
        if (UI.exportBtn) UI.exportBtn.classList.remove('hidden');

        refreshChat(session); // From chat-ui.js
        loadSessionList(); // Re-render sidebar to update active state

        // If we want to reflect the session's models in the UI:
        if (session.selected_models && session.selected_models.length > 0) {
            AppState.selectedModels = session.selected_models;
            renderModelSelector(AppState.providers);
        }

    } catch (e) {
        console.error("Failed to switch session:", e);
    }
}

function startNewSession() {
    AppState.sessionId = null;
    // 隐藏导出按钮
    if (UI.exportBtn) UI.exportBtn.classList.add('hidden');

    // Reset Chat View
    UI.chatContainer.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-gray-300 select-none">
            <i class="ph ph-chats text-6xl mb-4"></i>
            <p class="text-lg">选择模型并开始讨论</p>
        </div>
    `;

    // Refresh sidebar (remove active state)
    loadSessionList();
}

async function handleSend() {
    const text = UI.inputArea.value.trim();
    if (!text || AppState.isProcessing) return;

    if (AppState.selectedModels.length === 0) {
        alert("请至少选择一个模型参与讨论！");
        return;
    }

    setProcessing(true); // From chat-ui.js
    UI.inputArea.value = '';

    // Optimistic render User Message
    appendMessage({ role: 'user', content: text }); // From chat-ui.js

    try {
        let response;
        if (!AppState.sessionId) {
            // New Session: Create -> Start Round
            const session = await api.createSession(AppState.selectedModels);
            AppState.sessionId = session.id;
            // 显示导出按钮
            if (UI.exportBtn) UI.exportBtn.classList.remove('hidden');
            response = await api.startRound(session.id, text);
        } else {
            // Existing Session: Continue
            response = await api.continueRound(AppState.sessionId, text);
        }

        // Full re-render user message from backend state
        refreshChat(response); // From chat-ui.js

        // Start Streaming Response
        subscribeToStream(AppState.sessionId); // From chat-stream.js

    } catch (e) {
        console.error("Send error:", e);
        appendSystemMessage(`错误: ${e.message}`); // From chat-ui.js
        setProcessing(false);
    }
}
