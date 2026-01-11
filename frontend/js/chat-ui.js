/**
 * Chat UI Rendering Logic
 */

// Shared UI element references are expected to be available via global UI object from chat.js
// or we can pass them in. For simplicity in this vanilla JS app, we assume UI global.

function renderSessionList(sessions) {
    UI.historyList.innerHTML = '';

    // Group by Date (Today, Yesterday, Older) - Simplified for now
    sessions.forEach(session => {
        const div = document.createElement('div');
        div.className = `group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${session.id === AppState.sessionId ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`;
        div.onclick = () => switchSession(session.id); // switchSession is global in chat.js

        const title = session.title || '新对话';

        div.innerHTML = `
            <i class="ph ph-chat-circle-text text-lg ${session.id === AppState.sessionId ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}"></i>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">${Utils.escapeHtml(title)}</p>
                <p class="text-xs opacity-60 truncate">${new Date(session.created_at).toLocaleString()}</p>
            </div>
            <button onclick="event.stopPropagation(); deleteSession('${session.id}')" class="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-500 rounded transition-all" title="删除会话">
                <i class="ph ph-trash"></i>
            </button>
        `;
        UI.historyList.appendChild(div);
    });
}

function renderModelSelector(providers) {
    UI.modelList.innerHTML = '';
    // Styles for horizontal scrolling list in Header
    UI.modelList.className = 'flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[calc(100vw-400px)] mask-linear-fade';

    AppState.allModels = []; // Reset flattened list

    // Flatten logic
    providers.forEach(provider => {
        if (!provider.models) return;
        provider.models.forEach(m => {
            AppState.allModels.push({ ...m, providerId: provider.id });
        });
    });

    providers.forEach(provider => {
        if (!provider.models || provider.models.length === 0) return;

        // Render each model as a compact horizontal item
        provider.models.forEach(model => {
            const btn = document.createElement('button');
            const isSelected = AppState.selectedModels.includes(model.id);
            const colorClass = Utils.colorClasses[model.color] || Utils.colorClasses.gray;

            // Compact Header Style
            btn.className = `
                flex-shrink-0 group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all select-none
                ${isSelected
                    ? `${colorClass.bg} ${colorClass.text} ${colorClass.border} shadow-sm ring-1 ring-${model.color}-500/30`
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
            `;

            btn.onclick = () => toggleModelSelection(model.id);

            // Icon + Name
            btn.innerHTML = `
                <i class="ph ph-${model.icon} text-base ${isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}"></i>
                <span class="truncate max-w-[100px]">${model.display_name}</span>
                ${isSelected ? `<i class="ph-bold ph-check text-${model.color}-500"></i>` : ''}
            `;

            // Tooltip for full details
            btn.title = `${model.display_name} (${provider.name})`;

            UI.modelList.appendChild(btn);
        });
    });
}

function toggleModelSelection(modelId) {
    const idx = AppState.selectedModels.indexOf(modelId);
    if (idx >= 0) {
        AppState.selectedModels.splice(idx, 1);
    } else {
        AppState.selectedModels.push(modelId);
    }
    renderModelSelector(AppState.providers);
}

function appendMessage(msg) {
    // msg: { role: 'user' | 'assistant', content: string, model_id?: string, thoughts?: string }
    const isUser = msg.role === 'user';

    if (isUser) {
        // User Message
        const div = document.createElement('div');
        div.className = 'w-full max-w-4xl mx-auto flex justify-end mb-6 animate-fade-in-up';
        div.innerHTML = `
            <div class="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm text-sm leading-relaxed">
                ${Utils.escapeHtml(msg.content)}
            </div>
        `;
        UI.chatContainer.appendChild(div);
    } else {
        // Assistant Message
        const modelInfo = findModelInfo(msg.model_id);
        const color = Utils.colorClasses[modelInfo?.color] || Utils.colorClasses.gray;

        const div = document.createElement('div');
        div.className = 'w-full max-w-4xl mx-auto flex gap-4 mb-6 group animate-fade-in-up';

        // Avatar
        div.innerHTML = `
            <div class="flex-none flex flex-col items-center gap-1">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${color.bg} ${color.border} border">
                    <i class="ph ph-${modelInfo?.icon || 'robot'} text-xl ${color.text}"></i>
                </div>
                <!-- Line for thread continuity if needed -->
            </div>
            
            <div class="flex-1 min-w-0 space-y-2">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-gray-800">${modelInfo?.display_name || msg.model_id}</span>
                    <span class="text-xs text-gray-400 font-mono">${new Date().toLocaleTimeString()}</span>
                </div>

                <!-- Thoughts (if any) -->
                ${msg.thoughts ? `
                <details class="mb-2">
                    <summary class="text-xs text-gray-400 cursor-pointer hover:text-blue-500 transition-colors list-none flex items-center gap-1">
                        <i class="ph ph-brain"></i> Thinking Process
                    </summary>
                    <div class="mt-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100 font-mono whitespace-pre-wrap">
                        ${Utils.escapeHtml(msg.thoughts)}
                    </div>
                </details>
                ` : ''}

                <div class="prose prose-sm max-w-none text-gray-700 bg-white rounded-2xl rounded-tl-sm border border-gray-100 px-6 py-4 shadow-sm hover:shadow-md transition-shadow">
                    ${Utils.parseMarkdown(msg.content)}
                </div>
                
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="p-1 text-gray-400 hover:text-blue-600 rounded" title="复制" onclick="navigator.clipboard.writeText(this.parentElement.previousElementSibling.innerText)">
                        <i class="ph ph-copy"></i>
                    </button>
                    <button class="p-1 text-gray-400 hover:text-red-500 rounded" title="反馈问题">
                        <i class="ph ph-thumbs-down"></i>
                    </button>
                </div>
            </div>
        `;
        UI.chatContainer.appendChild(div);
    }

    scrollToBottom();
}

function updateLastMessageContent(text) {
    const lastMsg = UI.chatContainer.lastElementChild;
    if (!lastMsg) return;

    // Assume last message is the one streaming. 
    // Structure: div > div.flex-1 > div.prose
    const proseDiv = lastMsg.querySelector('.prose');
    if (proseDiv) {
        proseDiv.innerHTML = Utils.parseMarkdown(text);
        scrollToBottom();
    }
}

function refreshChat(sessionDetail) {
    UI.chatContainer.innerHTML = ''; // Clear
    if (!sessionDetail.messages) return;

    // Add extra padding at top
    const spacer = document.createElement('div');
    spacer.className = 'h-6';
    UI.chatContainer.appendChild(spacer);

    sessionDetail.messages.forEach(msg => {
        appendMessage(msg);
    });

    // If session is complete, show decision card
    // We don't have explicit status yet, but we can check if last round ended.
    // For now, simpler to just rely on SSE 'round_end' event for live sessions.
    // On load, maybe render a "Continue" divider? (Future feature)
}

function renderDecisionCard(sessionId) {
    const div = document.createElement('div');
    div.className = 'my-8 mx-auto max-w-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6 shadow-sm text-center animate-pulse-once';
    div.innerHTML = `
        <h3 class="text-blue-900 font-bold text-lg mb-2">🤔 本轮讨论结束</h3>
        <p class="text-blue-700/80 text-sm mb-6">模型已完成各自陈述，您可以选择：</p>
        
        <div class="flex justify-center gap-4">
            <button onclick="handleDecision('consensus')" class="px-6 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 font-medium transition-colors flex items-center gap-2">
                <i class="ph ph-check-circle"></i> 认可共识
            </button>
            <button onclick="handleDecision('continue')" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors flex items-center gap-2">
                <i class="ph ph-arrow-circle-right"></i> 继续追问
            </button>
        </div>
    `;
    UI.chatContainer.appendChild(div);
    scrollToBottom();
}

function handleDecision(type) {
    if (type === 'continue') {
        UI.inputArea.focus();
        // Remove card visually
        UI.chatContainer.lastElementChild.remove();
        // Add a small divider
        const div = document.createElement('div');
        div.className = 'flex items-center gap-4 my-6 opacity-50';
        div.innerHTML = `<div class="h-px bg-gray-300 flex-1"></div><span class="text-xs text-gray-400">继续讨论</span><div class="h-px bg-gray-300 flex-1"></div>`;
        UI.chatContainer.appendChild(div);
    } else {
        alert("共识已达成，会话归档（Mock）");
    }
}

function setProcessing(isProcessing) {
    AppState.isProcessing = isProcessing;
    if (isProcessing) {
        UI.sendBtn.disabled = true;
        UI.sendBtn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
        UI.inputArea.disabled = true;
        UI.statusBadge.classList.remove('hidden');
        UI.statusBadge.className = "flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full text-sm font-medium border border-amber-100";
        UI.statusText.textContent = "Thinking...";
    } else {
        UI.sendBtn.disabled = false;
        UI.sendBtn.innerHTML = '<i class="ph ph-paper-plane-tilt text-xl"></i>';
        UI.inputArea.disabled = false;
        UI.inputArea.focus();
        UI.statusBadge.classList.add('hidden');
    }
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        UI.chatContainer.scrollTo({
            top: UI.chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    });
}

function updateStatus(text, status = 'ready') {
    UI.statusText.textContent = text;
    // Status handling usually handled by setProcessing now
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'flex justify-center mb-4';
    div.innerHTML = `
        <span class="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full">
            ${Utils.escapeHtml(text)}
        </span>
    `;
    UI.chatContainer.appendChild(div);
    scrollToBottom();
}

function clearChat() {
    UI.chatContainer.innerHTML = '';
}

// Helper
function findModelInfo(modelId) {
    return AppState.allModels.find(m => m.id === modelId) || { id: modelId, display_name: modelId, color: 'gray' };
}
