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
