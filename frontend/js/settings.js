/**
 * Settings Page Logic
 */

const api = new AgentAPI();

const AppState = {
    providers: [],
    // Shared color definitions now usage Utils.colorClasses
};

// UI Elements
const UI = {
    modelList: document.getElementById('model-list'),
    editorContainer: document.getElementById('editor-container'),
    emptyState: document.getElementById('empty-state'),

    // Header
    currentModelName: document.getElementById('current-model-name'),
    currentProviderName: document.getElementById('current-provider-name'),

    // Provider Config
    providerApiKey: document.getElementById('provider-api-key'),
    providerBaseUrl: document.getElementById('provider-base-url'),
    saveProviderBtn: document.getElementById('save-provider-btn'),

    // Prompt Config
    promptEditor: document.getElementById('prompt-editor'),
    saveBtn: document.getElementById('save-btn'),
    saveStatus: document.getElementById('save-status'),

    // Modals
    modalOverlay: document.getElementById('modal-overlay'),
    addProviderModal: document.getElementById('add-provider-modal'),
    addModelModal: document.getElementById('add-model-modal'),

    // Buttons
    addProviderBtn: document.getElementById('add-provider-btn'),
    addModelForm: document.getElementById('add-model-form'),
    addProviderForm: document.getElementById('add-provider-form'),

    targetProviderIdLabel: document.getElementById('target-provider-id')
};

// State
const State = {
    currentProviderId: null,
    currentModelId: null
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    console.log('Initializing Settings...');
    await loadProviders();
    setupEventListeners();
}

async function loadProviders() {
    try {
        const providers = await api.getProviders();
        AppState.providers = providers;
        renderSidebar(providers);
    } catch (e) {
        console.error("Failed to load providers:", e);
        UI.modelList.innerHTML = `<div class="p-4 text-red-500 text-sm">加载失败: ${e.message}</div>`;
    }
}

function renderSidebar(providers) {
    UI.modelList.innerHTML = '';

    if (!providers || providers.length === 0) {
        UI.modelList.innerHTML = '<div class="p-4 text-gray-400 text-sm">暂无 Provider</div>';
        return;
    }

    providers.forEach(provider => {
        const group = document.createElement('div');
        group.className = 'mb-1';

        // Provider Header
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg group transition-colors';
        header.innerHTML = `
            <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${provider.name}</span>
            <button class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-1" title="添加模型" onclick="openModal('model', '${provider.id}')">
                <i class="ph ph-plus"></i>
            </button>
        `;
        group.appendChild(header);

        // Models
        if (provider.models && provider.models.length > 0) {
            const list = document.createElement('div');
            list.className = 'space-y-0.5 mt-1 mb-3 pl-2';

            provider.models.forEach(model => {
                const item = document.createElement('div');
                const isActive = (State.currentProviderId === provider.id && State.currentModelId === model.id);
                // Use Utils.colorClasses
                const color = Utils.colorClasses[model.color] || Utils.colorClasses.gray;

                item.className = `
                    flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
                    ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}
                `;
                item.onclick = () => selectModel(provider.id, model.id);

                item.innerHTML = `
                    <i class="ph ph-${model.icon} ${isActive ? 'text-blue-500' : 'text-gray-400'}"></i>
                    <span class="truncate flex-1">${model.display_name}</span>
                `;
                list.appendChild(item);
            });
            group.appendChild(list);
        } else {
            const empty = document.createElement('div');
            empty.className = 'text-xs text-gray-400 pl-5 mb-3 italic';
            empty.textContent = '无模型';
            group.appendChild(empty);
        }

        UI.modelList.appendChild(group);
    });
}

async function selectModel(providerId, modelId) {
    State.currentProviderId = providerId;
    State.currentModelId = modelId;

    // Find objects
    const provider = AppState.providers.find(p => p.id === providerId);
    if (!provider) return;
    const model = provider.models.find(m => m.id === modelId);
    if (!model) return;

    // Update Header
    UI.currentModelName.textContent = model.display_name;
    UI.currentProviderName.textContent = provider.name;

    // Update Provider Config Form
    UI.providerApiKey.value = provider.api_key || ''; // Will be masked usually
    UI.providerBaseUrl.value = provider.base_url || '';

    // Show Editor
    UI.emptyState.classList.add('hidden');
    UI.editorContainer.classList.remove('hidden');

    // UI Loading state
    UI.promptEditor.disabled = true;
    UI.saveBtn.disabled = true;
    UI.saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> 保存配置'; // Reset state
    UI.saveStatus.classList.add('opacity-0');

    renderSidebar(AppState.providers); // Update active state

    // Load Prompt
    try {
        UI.promptEditor.value = "加载中..."; // Clear previous content
        const data = await api.getModelPrompt(providerId, modelId);

        // Race condition check: If user switched away, ignore this result
        if (State.currentProviderId !== providerId || State.currentModelId !== modelId) {
            console.log("Ignoring stale prompt response");
            return;
        }

        UI.promptEditor.value = data.prompt || ""; // Handle null
    } catch (e) {
        console.error("Load prompt failed:", e);
        if (State.currentProviderId === providerId && State.currentModelId === modelId) {
            UI.promptEditor.value = "加载失败: " + e.message;
        }
    } finally {
        // Only re-enable if we are still on the same model (or just safe to enable)
        if (State.currentProviderId === providerId && State.currentModelId === modelId) {
            UI.promptEditor.disabled = false;
            UI.saveBtn.disabled = false;
            UI.promptEditor.focus();
        }
    }
}

async function saveProvider() {
    if (!State.currentProviderId) return;

    const config = {
        api_key: UI.providerApiKey.value || null,
        base_url: UI.providerBaseUrl.value || null
    };

    try {
        UI.saveProviderBtn.textContent = '保存中...';
        UI.saveProviderBtn.disabled = true;

        await api.updateProvider(State.currentProviderId, config);

        // Reload to reflect changes
        await loadProviders();

        // Show success
        UI.saveProviderBtn.textContent = '已保存';
        setTimeout(() => {
            UI.saveProviderBtn.textContent = '更新 Provider 配置';
            UI.saveProviderBtn.disabled = false;
        }, 2000);

    } catch (e) {
        console.error("Save provider failed:", e);
        alert("保存失败: " + e.message);
        UI.saveProviderBtn.textContent = '更新 Provider 配置';
        UI.saveProviderBtn.disabled = false;
    }
}

async function savePrompt() {
    if (!State.currentProviderId || !State.currentModelId) return;

    try {
        UI.saveBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> 保存中...';
        UI.saveBtn.disabled = true;

        const content = UI.promptEditor.value;
        await api.updateModelPrompt(State.currentProviderId, State.currentModelId, content);

        UI.saveBtn.innerHTML = '<i class="ph ph-check"></i> 已保存';
        UI.saveStatus.classList.remove('opacity-0');

        setTimeout(() => {
            UI.saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> 保存配置';
            UI.saveBtn.disabled = false;
            UI.saveStatus.classList.add('opacity-0');
        }, 2000);

    } catch (e) {
        console.error("Save prompt failed:", e);
        UI.saveBtn.innerHTML = '<i class="ph ph-warning"></i> 失败';
        alert("保存失败: " + e.message);
        UI.saveBtn.disabled = false;
    }
}

// --- Modals ---

function openModal(type, targetId) {
    UI.modalOverlay.classList.remove('hidden');
    // small delay for transition
    requestAnimationFrame(() => UI.modalOverlay.classList.remove('opacity-0'));

    if (type === 'provider') {
        UI.addProviderModal.classList.remove('hidden');
        UI.addModelModal.classList.add('hidden');
    } else {
        UI.addModelModal.classList.remove('hidden');
        UI.addProviderModal.classList.add('hidden');
        UI.targetProviderIdLabel.textContent = targetId;
        UI.addModelForm.elements['provider_id'].value = targetId;
    }
}

function closeModal() {
    UI.modalOverlay.classList.add('opacity-0');
    setTimeout(() => {
        UI.modalOverlay.classList.add('hidden');
        UI.addProviderModal.classList.add('hidden');
        UI.addModelModal.classList.add('hidden');

        // Reset forms
        UI.addProviderForm.reset();
        UI.addModelForm.reset();
    }, 200);
}

// Listeners
function setupEventListeners() {
    UI.addProviderBtn.addEventListener('click', () => openModal('provider'));
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModal));

    // Config Actions
    UI.saveBtn.addEventListener('click', savePrompt);
    UI.saveProviderBtn.addEventListener('click', saveProvider);

    // Form Submits
    UI.addProviderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            await api.createProvider({
                id: data.id,
                name: data.name,
                type: data.type,
                api_key: data.api_key || null,
                base_url: data.base_url || null
            });
            await loadProviders();
            closeModal();
        } catch (err) {
            alert('创建失败: ' + err.message);
        }
    });

    UI.addModelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        const providerId = data.provider_id;

        try {
            await api.createModel(providerId, {
                id: data.id,
                display_name: data.display_name,
                icon: data.icon,
                color: data.color
            });
            await loadProviders();
            closeModal();
        } catch (err) {
            alert('创建失败: ' + err.message);
        }
    });
}
