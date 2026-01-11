/**
 * Main Chat Logic
 */
const api = new AgentAPI();

const AppState = {
    sessionId: null,
    selectedModels: [],
    isProcessing: false,
    providers: []
};

// UI Elements
const UI = {
    chatContainer: document.getElementById('chat-container'),
    inputArea: document.getElementById('input-textarea'),
    sendBtn: document.getElementById('send-button'),
    modelList: document.getElementById('model-list-container'),
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
    // Refresh UI references to ensure they exist
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
        setupModelClickHandler(); // Setup event delegation ONCE
        await loadProviders();
        await loadSessionList();
        setupEventListeners();

        // Check URL for session ID (to be implemented later)
        // For now, clean start
    } catch (e) {
        console.error("Init failed:", e);
        appendSystemMessage("无法连接到后端服务器，请确认后端已启动 (localhost:8000)");
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

    // Fallback: Global delegation in case element reference is stale
    document.addEventListener('click', (e) => {
        if (e.target.closest('#exit-btn')) {
            // Check if it was already handled (optional, but harmless to call twice if one is blocked)
            // But let's rely on this one primarily if the direct one failed.
            // Just ensure we don't double submit? handleShutdown talks to API.
            // Let's just use this delegation as the primary or backup.
            if (!UI.exitBtn) {
                handleShutdown();
            }
        }
    });
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
        console.error("Shutdown signal sent (expecting connection reset):", e);
    }
}

async function loadProviders() {
    const providers = await api.getProviders();
    AppState.providers = providers;
    renderModelSelector(providers);
}

async function loadSessionList() {
    try {
        const sessions = await api.listSessions();
        renderSessionList(sessions);
    } catch (e) {
        console.error("Failed to load sessions:", e);
    }
}

function renderSessionList(sessions) {
    if (!UI.historyList) return;
    UI.historyList.innerHTML = '';

    // Simple Header
    const header = document.createElement('div');
    header.className = "group px-3 py-2 rounded-xl text-sm font-medium text-gray-500 uppercase tracking-wider mt-2 mb-1";
    header.innerText = "最近对话";
    UI.historyList.appendChild(header);

    // Sort by updated_at desc
    sessions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    sessions.forEach(session => {
        const isActive = session.id === AppState.sessionId;
        const btn = document.createElement('div'); // Changed to div wrapper
        btn.className = `group/item w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all border cursor-pointer ${isActive
            ? 'bg-blue-50 text-blue-700 border-blue-100'
            : 'text-gray-600 hover:bg-gray-100 border-transparent hover:border-gray-200'
            }`;

        btn.innerHTML = `
            <i class="ph ${isActive ? 'ph-chat-circle-text' : 'ph-chat-circle'} text-lg ${isActive ? '' : 'text-gray-400'}"></i>
            <div class="truncate text-sm font-medium flex-1">${Utils.escapeHtml(session.title || '新对话')}</div>
            <button class="delete-btn opacity-0 group-hover/item:opacity-100 p-1 hover:text-red-500 transition-opacity" title="删除会话">
                <i class="ph ph-trash"></i>
            </button>
        `;

        // Click on session to switch
        btn.addEventListener('click', (e) => {
            // Ignore if delete button clicked
            if (e.target.closest('.delete-btn')) return;
            switchSession(session.id);
        });

        // Click on delete
        const delBtn = btn.querySelector('.delete-btn');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('确定要删除这个会话吗？')) {
                await deleteSession(session.id);
            }
        });

        UI.historyList.appendChild(btn);
    });
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
        // Close existing SSE connection if any
        if (AppState.eventSource) {
            AppState.eventSource.close();
            AppState.eventSource = null;
        }

        const session = await api.getSession(sessionId);
        AppState.sessionId = session.id;
        // Optional: AppState.selectedModels = session.selected_models || []; 
        refreshChat(session);
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

function renderModelSelector(providers) {
    if (!UI.modelList) return;
    UI.modelList.innerHTML = '';

    // Flatten all models and store for reference
    const allModels = [];
    providers.forEach(p => {
        p.models.forEach(m => allModels.push({ ...m, providerId: p.id }));
    });
    AppState.allModels = allModels; // Store for event handler

    // Default select first 2 for demo (only on first load)
    if (AppState.selectedModels.length === 0) {
        allModels.slice(0, 2).forEach(model => AppState.selectedModels.push(model.id));
    }

    // Pre-defined color classes - vibrant colors with darker backgrounds
    const colorClasses = {
        teal: { bg: 'bg-teal-500', text: 'text-white', border: 'border-teal-500' },
        violet: { bg: 'bg-violet-500', text: 'text-white', border: 'border-violet-500' },
        blue: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-500' },
        orange: { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-500' },
        green: { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-500' },
        red: { bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-500' },
        gray: { bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-500' },
    };

    // Render HTML - NO individual event listeners here
    allModels.forEach((model, index) => {
        const isSelected = AppState.selectedModels.includes(model.id);
        const colors = colorClasses[model.color] || colorClasses.gray;

        const el = document.createElement('button');
        el.setAttribute('data-model-id', model.id);
        el.setAttribute('data-index', String(index));
        el.className = `model-btn px-3 py-1 rounded-full border text-sm flex items-center gap-1.5 transition-colors ${isSelected
            ? `${colors.bg} ${colors.text} ${colors.border}`
            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`;
        el.innerHTML = `<i class="ph-fill ph-${model.icon || 'lightning'}"></i> ${model.display_name}`;
        UI.modelList.appendChild(el);
    });

    // Add "Add" button
    const addBtn = document.createElement('button');
    addBtn.className = "w-6 h-6 rounded-full border border-gray-300 border-dashed text-gray-400 flex items-center justify-center hover:border-blue-400 hover:text-blue-500 transition-colors";
    addBtn.innerHTML = '<i class="ph ph-plus text-xs"></i>';
    addBtn.addEventListener('click', () => {
        alert("添加模型功能开发中...\n目前请在 backend/config/providers.yaml 中配置模型。");
    });
    UI.modelList.appendChild(addBtn);
}

// Event delegation - single listener on the container
let modelClickHandlerSetup = false; // Prevent duplicate registration

function setupModelClickHandler() {
    if (!UI.modelList) return;
    if (modelClickHandlerSetup) {
        // console.log('Model click handler already setup, skipping');
        return;
    }

    modelClickHandlerSetup = true;
    // console.log('Setting up model click handler');

    UI.modelList.addEventListener('click', (e) => {
        // Find the button element (might have clicked on icon/span inside)
        const btn = e.target.closest('.model-btn');
        if (!btn) return;

        const modelId = btn.getAttribute('data-model-id');
        if (!modelId) return;

        // console.log('Clicked button data-model-id:', modelId);
        toggleModelSelection(modelId);
        renderModelSelector(AppState.providers);
    });
}

function toggleModelSelection(modelId) {
    if (AppState.selectedModels.includes(modelId)) {
        AppState.selectedModels = AppState.selectedModels.filter(id => id !== modelId);
    } else {
        AppState.selectedModels.push(modelId);
    }
}



async function handleSend() {
    const text = UI.inputArea.value.trim();
    if (!text || AppState.isProcessing) return;

    if (AppState.selectedModels.length === 0) {
        alert("请至少选择一个模型参与讨论！");
        return;
    }

    setProcessing(true);
    UI.inputArea.value = '';

    // Optimistic render User Message
    appendMessage({ role: 'user', content: text });

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
        refreshChat(response);

        // Start Streaming Response
        subscribeToStream(AppState.sessionId);

    } catch (e) {
        console.error("Send error:", e);
        appendSystemMessage(`错误: ${e.message}`);
        setProcessing(false); // Enable input if error
    }
}

function subscribeToStream(sessionId) {
    if (AppState.eventSource) {
        AppState.eventSource.close();
    }

    const url = `${api.baseUrl}/api/sessions/${sessionId}/stream`;
    console.log("Connecting SSE:", url);

    const es = new EventSource(url);
    AppState.eventSource = es;

    // --- Event Handlers ---

    es.onopen = () => {
        console.log("SSE Connected");
    };

    es.addEventListener('round_start', (e) => {
        const data = JSON.parse(e.data);
        console.log("Round Start:", data);
        // Could visualize round separator
    });

    es.addEventListener('model_start', (e) => {
        const data = JSON.parse(e.data);
        console.log("Model Start:", data);

        // Create a placeholder message for this model if not exists
        // (Or just let the appendMessage handle partials - requires modification)
        // For now, let's create a temporary streaming buffer or robust append
        UI.currentStreamModelId = data.model;
        UI.currentStreamContent = "";

        // Optimistically render an empty bubble
        appendMessage({
            role: 'assistant',
            model_id: data.model,
            content: '...' // Loading state
        }); // isStreaming flag
    });

    es.addEventListener('token', (e) => {
        const data = JSON.parse(e.data);
        UI.currentStreamContent += data.content;

        // Update the last message bubble (which should be the current model's)
        updateLastMessageContent(UI.currentStreamContent);
    });

    es.addEventListener('model_end', (e) => {
        const data = JSON.parse(e.data);
        console.log("Model End:", data);
        UI.currentStreamModelId = null;
    });

    es.addEventListener('model_error', (e) => {
        const data = JSON.parse(e.data);
        console.error("Model Error:", data);
        updateLastMessageContent(`(Error: ${data.error})`);
    });

    es.addEventListener('round_end', (e) => {
        const data = JSON.parse(e.data);
        console.log("Round End:", data);
        es.close();
        setProcessing(false);
        // Show decision card (TODO)
        appendSystemMessage("本轮结束，请继续发言或结束讨论");
    });

    es.addEventListener('title_generated', (e) => {
        const data = JSON.parse(e.data);
        // Update sidebar if visible
        loadSessionList();
    });

    es.onerror = (e) => {
        console.error("SSE Error:", e);
        es.close();
        setProcessing(false);
    };
}

function updateLastMessageContent(content) {
    // Helper to find the last message bubble and update text
    // This assumes the last element in chatContainer is the active one
    const lastMsg = UI.chatContainer.lastElementChild;
    if (lastMsg) {
        // Look for the paragraph inside
        const markdownBodyDiv = lastMsg.querySelector('.markdown-body');
        if (markdownBodyDiv) {
            // Basic Markdown parse on the fly or just text
            markdownBodyDiv.innerHTML = parseMarkdown(content);
            // Ideally use parseMarkdown(content) but keep it simple updates
        }
    }
    scrollToBottom();
}

function appendMessage(msg) {
    const div = document.createElement('div');
    if (msg.role === 'user') {
        div.className = "flex justify-end";
        div.innerHTML = `
            <div class="max-w-2xl bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none shadow-md">
                <p class="leading-relaxed whitespace-pre-wrap">${Utils.escapeHtml(msg.content)}</p>
            </div>
        `;
    } else {
        // Find model config
        const modelInfo = findModelInfo(msg.model_id);
        const color = modelInfo?.color || 'gray';

        div.className = "flex gap-4 max-w-3xl";
        div.innerHTML = `
            <div class="flex-shrink-0 w-8 h-8 rounded bg-${color}-100 text-${color}-700 flex items-center justify-center">
                <i class="ph-fill ph-${modelInfo?.icon || 'robot'} text-lg"></i>
            </div>
            <div class="flex flex-col gap-1">
                <span class="text-xs font-semibold text-gray-500 ml-1">${modelInfo?.display_name || msg.model_id}</span>
                <div class="bg-white border border-${color}-100 p-5 rounded-2xl rounded-tl-none shadow-sm text-gray-800 leading-7">
                    <div class="markdown-body">${parseMarkdown(msg.content)}</div>
                </div>
            </div>
        `;
    }
    UI.chatContainer.appendChild(div);
    scrollToBottom();
}

function refreshChat(sessionDetail) {
    // Ideally we would diff, but for now simple clear & render
    UI.chatContainer.innerHTML = '';

    // Group messages by round potentially? For now just flat list
    sessionDetail.messages.forEach(msg => {
        appendMessage(msg);
    });
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = "flex justify-center my-4";
    div.innerHTML = `<span class="bg-red-50 text-red-600 px-3 py-1 rounded text-sm">${text}</span>`;
    UI.chatContainer.appendChild(div);
}

function findModelInfo(modelId) {
    for (const p of AppState.providers) {
        const m = p.models.find(x => x.id === modelId);
        if (m) return m;
    }
    return null;
}

// Simple dummy Markdown parser (replace with library later)
function parseMarkdown(text) {
    let html = Utils.escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // List
    html = html.replace(/- (.*?)(\n|$)/g, '<li>$1</li>');
    // Wrap lists (very basic)
    if (html.includes('<li>')) {
        html = html.replace(/(<li>.*<\/li>)/s, '<ul class="list-disc pl-5">$1</ul>');
    }
    return html.replace(/\n/g, '<br>');
}

function setProcessing(isProcessing) {
    AppState.isProcessing = isProcessing;
    if (UI.sendBtn) UI.sendBtn.disabled = isProcessing;
    if (UI.inputArea) UI.inputArea.disabled = isProcessing;

    if (isProcessing) {
        UI.statusBadge.classList.remove('hidden');
    } else {
        UI.statusBadge.classList.add('hidden');
    }
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        UI.chatContainer.scrollTop = UI.chatContainer.scrollHeight;
    });
}
