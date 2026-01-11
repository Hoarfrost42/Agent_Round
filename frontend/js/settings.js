const api = new AgentAPI();

const UI = {
    modelList: document.getElementById('model-list'),
    emptyState: document.getElementById('empty-state'),
    editorContainer: document.getElementById('editor-container'),
    currentModelName: document.getElementById('current-model-name'),
    currentProviderName: document.getElementById('current-provider-name'),
    promptEditor: document.getElementById('prompt-editor'),
    saveBtn: document.getElementById('save-btn'),
    saveStatus: document.getElementById('save-status'),
    // New
    addProviderBtn: document.getElementById('add-provider-btn'),
    modalOverlay: document.getElementById('modal-overlay'),
    addProviderModal: document.getElementById('add-provider-modal'),
    addModelModal: document.getElementById('add-model-modal'),
    addProviderForm: document.getElementById('add-provider-form'),
    addModelForm: document.getElementById('add-model-form'),
    targetProviderId: document.getElementById('target-provider-id'),
    closeModalBtns: document.querySelectorAll('.close-modal'),
};

const State = {
    providers: [],
    currentProviderId: null,
    currentModelId: null,
};

// Colors mapping (reused)
const colorClasses = {
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
};

async function init() {
    try {
        State.providers = await api.getProviders();
        renderSidebar();

        // Setup listeners
        UI.saveBtn.addEventListener('click', savePrompt);
        UI.addProviderBtn.addEventListener('click', () => openModal('provider'));
        UI.closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));
        UI.addProviderForm.addEventListener('submit', handleAddProvider);
        UI.addModelForm.addEventListener('submit', handleAddModel);

    } catch (e) {
        console.error("Init failed:", e);
        alert("无法加载模型列表: " + e.message);
    }
}

function renderSidebar() {
    UI.modelList.innerHTML = '';

    State.providers.forEach(provider => {
        // Provider Header Group
        const headerGroup = document.createElement('div');
        headerGroup.className = "flex items-center justify-between mt-4 first:mt-0 px-1 mb-1";
        headerGroup.innerHTML = `
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-wider">${provider.name}</h2>
            <button class="add-model-icon-btn text-gray-400 hover:text-blue-500 transition-colors p-1 rounded" title="Add Model">
                <i class="ph-bold ph-plus text-xs"></i>
            </button>
        `;
        // Bind Add Model Click
        headerGroup.querySelector('.add-model-icon-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openModal('model', provider.id);
        });

        UI.modelList.appendChild(headerGroup);

        provider.models.forEach(model => {
            const btn = document.createElement('button');
            const isActive = State.currentModelId === model.id;
            const color = colorClasses[model.color] || colorClasses.gray;

            btn.className = `w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${isActive
                ? `${color.bg} ${color.text} font-medium shadow-sm ring-1 ring-inset ${color.border}`
                : 'text-gray-600 hover:bg-gray-100'
                }`;

            btn.innerHTML = `
                <div class="w-6 h-6 rounded flex items-center justify-center ${isActive ? 'bg-white/50' : 'bg-gray-100 text-gray-400'}">
                    <i class="ph-fill ph-${model.icon || 'lightning'}"></i>
                </div>
                <span class="truncate text-sm">${model.display_name}</span>
            `;

            btn.addEventListener('click', () => selectModel(provider.id, model.id));
            UI.modelList.appendChild(btn);
        });
    });
}

// ... selectModel existing logic ... (We can keep it or reference it if we didn't wipe it out. 
// Wait, I am replacing the WHOLE file content from line 1. I need to keep the selectModel/saveProvider/savePrompt logic.)
// Since I'm using replace_file_content with start/end encompassing the whole file, I need to include EVERYTHING.
// I will just implement the helpers below.

async function handleAddProvider(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Clean empty values
    if (!data.api_key) delete data.api_key;
    if (!data.base_url) delete data.base_url;

    try {
        const newProvider = await api.createProvider(data);
        State.providers.push(newProvider); // Or reload
        renderSidebar();
        closeModal();
        alert("Provider 创建成功！");
    } catch (err) {
        alert("创建失败: " + err.message);
    }
}

async function handleAddModel(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const providerId = data.provider_id;
    delete data.provider_id; // Remove from model payload

    try {
        await api.createModel(providerId, data);

        // Refresh all providers to get clean state
        State.providers = await api.getProviders();
        renderSidebar();
        closeModal();

        // Select the new model
        selectModel(providerId, data.id);
    } catch (err) {
        alert("添加模型失败: " + err.message);
    }
}

function openModal(type, providerId = null) {
    UI.modalOverlay.classList.remove('hidden');
    // Tick to allow transition
    setTimeout(() => UI.modalOverlay.classList.remove('opacity-0'), 10);

    if (type === 'provider') {
        UI.addProviderModal.classList.remove('hidden');
        UI.addModelModal.classList.add('hidden');
        UI.addProviderForm.reset();
    } else {
        UI.addModelModal.classList.remove('hidden');
        UI.addProviderModal.classList.add('hidden');
        UI.addModelForm.reset();
        UI.targetProviderId.innerText = providerId;
        UI.addModelForm.querySelector('[name="provider_id"]').value = providerId;
    }
}

function closeModal() {
    UI.modalOverlay.classList.add('opacity-0');
    setTimeout(() => {
        UI.modalOverlay.classList.add('hidden');
        UI.addProviderModal.classList.add('hidden');
        UI.addModelModal.classList.add('hidden');
    }, 200);
}


async function selectModel(providerId, modelId) {
    State.currentProviderId = providerId;
    State.currentModelId = modelId;

    // UI Loading state
    UI.promptEditor.disabled = true;
    UI.saveBtn.disabled = true;

    renderSidebar(); // Update active state

    // Switch view
    UI.emptyState.classList.add('hidden');
    UI.editorContainer.classList.remove('hidden');

    // Update Header
    const provider = State.providers.find(p => p.id === providerId);
    const model = provider.models.find(m => m.id === modelId);

    UI.currentModelName.innerText = model.display_name;
    UI.currentProviderName.innerText = provider.name;

    // Provider Binding
    UI.saveProviderBtn = document.getElementById('save-provider-btn');
    UI.providerApiKey = document.getElementById('provider-api-key');
    UI.providerBaseUrl = document.getElementById('provider-base-url');

    UI.providerApiKey.value = provider.api_key || "";
    UI.providerBaseUrl.value = provider.base_url || "";

    // Wire up save provider (refresh listener to avoid duplicates)
    // Clone node to strip old listeners
    const newSaveBtn = UI.saveProviderBtn.cloneNode(true);
    UI.saveProviderBtn.parentNode.replaceChild(newSaveBtn, UI.saveProviderBtn);
    UI.saveProviderBtn = newSaveBtn;
    UI.saveProviderBtn.addEventListener('click', saveProvider);

    try {
        const data = await api.getModelPrompt(providerId, modelId);
        UI.promptEditor.value = data.prompt || ""; // Handle null
    } catch (e) {
        console.error("Load prompt failed:", e);
        UI.promptEditor.value = "加载失败: " + e.message;
    } finally {
        UI.promptEditor.disabled = false;
        UI.saveBtn.disabled = false;
        UI.promptEditor.focus();
    }
}

async function saveProvider() {
    if (!State.currentProviderId) return;

    const apiKey = UI.providerApiKey.value.trim();
    const baseUrl = UI.providerBaseUrl.value.trim();

    UI.saveProviderBtn = document.getElementById('save-provider-btn'); // Re-fetch to be safe
    UI.saveProviderBtn.disabled = true;
    UI.saveProviderBtn.innerText = "更新中...";

    try {
        // Only send what is changed or non-empty ideally, but PUT updates all fields usually
        // Schema says Optional[str]
        const config = {};
        if (apiKey) config.api_key = apiKey;
        if (baseUrl) config.base_url = baseUrl;

        await api.updateProvider(State.currentProviderId, config);

        UI.saveProviderBtn.innerText = "已更新";
        setTimeout(() => UI.saveProviderBtn.innerText = "更新 Provider 配置", 2000);

        // Refresh local state by fetching providers again
        const updatedProviders = await api.getProviders();
        State.providers = updatedProviders;

    } catch (e) {
        console.error("Save provider failed:", e);
        alert("更新失败: " + e.message);
        UI.saveProviderBtn.innerText = "更新 Provider 配置";
    } finally {
        UI.saveProviderBtn.disabled = false;
    }
}

async function savePrompt() {
    if (!State.currentProviderId || !State.currentModelId) return;

    const prompt = UI.promptEditor.value;
    UI.saveBtn.disabled = true;
    UI.saveBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> 保存中...';

    try {
        await api.updateModelPrompt(State.currentProviderId, State.currentModelId, prompt);

        // Success animation
        UI.saveStatus.classList.remove('opacity-0');
        setTimeout(() => {
            UI.saveStatus.classList.add('opacity-0');
        }, 2000);

    } catch (e) {
        console.error("Save failed:", e);
        alert("保存失败: " + e.message);
    } finally {
        UI.saveBtn.disabled = false;
        UI.saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> 保存配置';
    }
}

// Start
init();
