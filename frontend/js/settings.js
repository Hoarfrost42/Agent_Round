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
    await loadChatTemplatesFromAPI();
    await loadPromptTemplatesFromAPI();
    setupEventListeners();
    setupPromptTemplateDropdown();
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
                    flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors group
                    ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}
                `;

                item.innerHTML = `
                    <i class="ph ph-${model.icon} ${isActive ? 'text-blue-500' : 'text-gray-400'}"></i>
                    <span class="truncate flex-1" onclick="selectModel('${provider.id}', '${model.id}')">${model.display_name}</span>
                    <button class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1 delete-model-btn" 
                            data-provider="${provider.id}" data-model="${model.id}" title="删除模型">
                        <i class="ph ph-trash"></i>
                    </button>
                `;
                item.querySelector('.truncate').onclick = (e) => {
                    e.stopPropagation();
                    selectModel(provider.id, model.id);
                };
                item.querySelector('.delete-model-btn').onclick = (e) => {
                    e.stopPropagation();
                    deleteModel(provider.id, model.id, model.display_name);
                };
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

async function deleteModel(providerId, modelId, displayName) {
    if (!confirm(`确定要删除模型 "${displayName}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        // 不要使用 encodeURIComponent，因为 model_id 可能包含斜杠
        const response = await fetch(`${api.baseUrl}/api/providers/${providerId}/models/${modelId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '删除失败');
        }

        // Clear selection if deleted model was selected
        if (State.currentProviderId === providerId && State.currentModelId === modelId) {
            State.currentProviderId = null;
            State.currentModelId = null;
            UI.editorContainer.classList.add('hidden');
            UI.emptyState.classList.remove('hidden');
        }

        // Reload providers list
        await loadProviders();

    } catch (e) {
        console.error("Delete model failed:", e);
        alert(`删除失败: ${e.message}`);
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

    // Template management
    document.getElementById('add-template-btn')?.addEventListener('click', addNewTemplate);
    document.getElementById('reset-templates-btn')?.addEventListener('click', resetTemplates);
    document.getElementById('save-tpl-btn')?.addEventListener('click', saveCurrentTemplate);
    document.getElementById('delete-tpl-btn')?.addEventListener('click', deleteCurrentTemplate);

    // Initialize template sidebar
    renderTemplateSidebar();
}

// ========== Template Management ==========

// Cache for templates (loaded from backend)
let chatTemplatesCache = null;

async function loadChatTemplatesFromAPI() {
    try {
        chatTemplatesCache = await api.getChatTemplates();
    } catch (e) {
        console.error('Failed to load chat templates:', e);
        chatTemplatesCache = {};
    }
    return chatTemplatesCache;
}

function loadTemplates() {
    // Return cache if available, otherwise empty object
    return chatTemplatesCache || {};
}

async function saveChatTemplateToAPI(id, template) {
    try {
        await api.saveChatTemplate(id, template);
        if (chatTemplatesCache) chatTemplatesCache[id] = template;
    } catch (e) {
        console.error('Failed to save chat template:', e);
    }
}

async function deleteChatTemplateFromAPI(id) {
    try {
        await api.deleteChatTemplate(id);
        if (chatTemplatesCache) delete chatTemplatesCache[id];
    } catch (e) {
        console.error('Failed to delete chat template:', e);
    }
}

// Render template list in sidebar
function renderTemplateSidebar() {
    const container = document.getElementById('template-sidebar-list');
    if (!container) return;

    const templates = loadTemplates();
    container.innerHTML = '';

    Object.entries(templates).forEach(([key, tpl]) => {
        const item = document.createElement('div');
        const isActive = currentTemplateId === key;
        item.className = `flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${isActive ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-100'}`;
        item.innerHTML = `
            <i class="ph ph-${tpl.icon || 'file-text'} ${isActive ? 'text-purple-600' : 'text-gray-400'}"></i>
            <span class="truncate">${tpl.name}</span>
        `;
        item.onclick = () => selectTemplate(key);
        container.appendChild(item);
    });
}

// Select and show template in editor
function selectTemplate(templateId) {
    const templates = loadTemplates();
    const tpl = templates[templateId];
    if (!tpl) return;

    currentTemplateId = templateId;
    State.currentProviderId = null;
    State.currentModelId = null;

    // Hide other views, show template editor
    UI.emptyState.classList.add('hidden');
    UI.editorContainer.classList.add('hidden');
    document.getElementById('template-editor').classList.remove('hidden');

    // Populate editor
    document.getElementById('tpl-editor-title').textContent = tpl.name;
    document.getElementById('tpl-editor-id').textContent = templateId;
    document.getElementById('tpl-edit-name').value = tpl.name;
    document.getElementById('tpl-edit-icon').value = tpl.icon || 'file-text';
    document.getElementById('tpl-edit-content').value = tpl.content;

    // Update sidebar highlights
    renderTemplateSidebar();
    renderSidebar(AppState.providers);
}

// Current selected template
let currentTemplateId = null;

// Save current template
async function saveCurrentTemplate() {
    if (!currentTemplateId) return;

    const template = {
        name: document.getElementById('tpl-edit-name').value.trim(),
        icon: document.getElementById('tpl-edit-icon').value.trim() || 'file-text',
        content: document.getElementById('tpl-edit-content').value
    };

    await saveChatTemplateToAPI(currentTemplateId, template);

    // Update title
    document.getElementById('tpl-editor-title').textContent = template.name;

    // Show saved status
    const status = document.getElementById('tpl-save-status');
    status.classList.remove('opacity-0');
    setTimeout(() => status.classList.add('opacity-0'), 2000);

    renderTemplateSidebar();
}

// Add new template
async function addNewTemplate() {
    const id = prompt('请输入模板 ID（英文小写，如 debug）：');
    if (!id || !id.trim()) return;

    const key = id.trim().toLowerCase().replace(/\s+/g, '-');
    const templates = loadTemplates();

    if (templates[key]) {
        alert('该 ID 已存在');
        return;
    }

    const newTemplate = { name: '新模板', icon: 'file-text', content: '模板内容...' };
    await saveChatTemplateToAPI(key, newTemplate);

    renderTemplateSidebar();
    selectTemplate(key);
}

// Delete current template
async function deleteCurrentTemplate() {
    if (!currentTemplateId) return;
    if (!confirm(`确定删除模板 "${currentTemplateId}" 吗？`)) return;

    await deleteChatTemplateFromAPI(currentTemplateId);

    currentTemplateId = null;
    document.getElementById('template-editor').classList.add('hidden');
    UI.emptyState.classList.remove('hidden');

    renderTemplateSidebar();
}

// Reset to defaults (reload from server)
async function resetTemplates() {
    if (!confirm('确定恢复默认模板吗？请在服务器端恢复 templates.yaml 文件。')) return;

    // Reload from API
    await loadChatTemplatesFromAPI();
    currentTemplateId = null;
    document.getElementById('template-editor').classList.add('hidden');
    UI.emptyState.classList.remove('hidden');

    renderTemplateSidebar();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Default system prompt templates
const DEFAULT_PROMPT_TEMPLATES = {
    'roundtable': {
        name: '圆桌讨论专家',
        content: `你是一位专业的AI助手，正在参与一场多模型圆桌讨论。

## 你的角色
- **严谨分析**：确保不重复前人已经讨论过的观点
- **差异补充**：使用[差异投资]模型，检查前人的方案在"难以"或"成本"上是否有漏洞
- **深化拓展**：如果前人触出了现象，请指清楚更深层的成因
- **魔鬼**：如果你不完全同意前人的观点，请坦诚地用温和语语进行反驳（Devil's Advocate）

## 讨论已进入方案阶段
- 请集中于[方案细节]与[风险评估]，不要再回头去说义"什么是问题"

## Output Standards
- **结构化**：使用 Markdown 格式，层级清晰
- **言简意赅**：社团正确的宽式。如果同意前人观点，请直接确认并直接进入下一层级分析
- **引用**：在必要获不支时，正式引用前序模型的建点。例如："针对 @ModelA 提出的架构方案，我认为在社离并发场景下存在..."`
    },
    'code-expert': {
        name: '代码专家',
        content: `你是一位资深软件工程师，专注于代码质量和最佳实践。

## 专业领域
- 代码审查与重构
- 架构设计与模式
- 性能优化
- 安全最佳实践

## 回复风格
1. 直接指出问题所在
2. 提供具体的改进建议和代码示例
3. 解释背后的原理
4. 考虑边界情况和潜在风险`
    },
    'analyst': {
        name: '系统分析师',
        content: `你是一位经验丰富的系统分析师，擅长将复杂问题分解为可管理的组件。

## 分析框架
1. **问题定义**：明确核心问题和边界
2. **利益相关者**：识别所有受影响方
3. **约束条件**：技术、时间、资源限制
4. **方案评估**：多维度对比分析

## 输出规范
- 使用结构化格式
- 提供数据支持的结论
- 考虑短期和长期影响`
    },
    'creative': {
        name: '创意助手',
        content: `你是一位富有创造力的思维伙伴，帮助用户突破思维局限。

## 核心原则
- 鼓励发散思维，不过早否定想法
- 从多个角度审视问题
- 结合跨领域知识产生新见解
- 保持开放和好奇的心态

## 互动方式
- 积极提问引导思考
- 提供类比和比喻帮助理解
- 建议非常规的解决方案`
    },
    'minimal': {
        name: '简洁模式',
        content: `请简洁直接地回答问题。避免冗余，直达要点。`
    }
};

// Prompt templates cache
let promptTemplatesCache = null;

async function loadPromptTemplatesFromAPI() {
    try {
        promptTemplatesCache = await api.getPromptTemplates();
    } catch (e) {
        console.error('Failed to load prompt templates:', e);
        promptTemplatesCache = {};
    }
    return promptTemplatesCache;
}

function loadPromptTemplates() {
    return promptTemplatesCache || {};
}

async function savePromptTemplateToAPI(id, template) {
    try {
        await api.savePromptTemplate(id, template);
        if (promptTemplatesCache) promptTemplatesCache[id] = template;
    } catch (e) {
        console.error('Failed to save prompt template:', e);
    }
}

async function deletePromptTemplateFromAPI(id) {
    try {
        await api.deletePromptTemplate(id);
        if (promptTemplatesCache) delete promptTemplatesCache[id];
    } catch (e) {
        console.error('Failed to delete prompt template:', e);
    }
}

// Setup prompt template dropdown
function setupPromptTemplateDropdown() {
    const btn = document.getElementById('prompt-template-btn');
    const menu = document.getElementById('prompt-template-menu');
    if (!btn || !menu) return;

    // Render menu items
    function renderMenu() {
        const templates = loadPromptTemplates();
        menu.innerHTML = '<div class="px-3 py-1.5 text-xs text-gray-400 uppercase tracking-wider flex justify-between items-center"><span>选择模板</span></div>';

        Object.entries(templates).forEach(([key, tpl]) => {
            const item = document.createElement('button');
            item.className = 'w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-600 transition-colors flex items-center justify-between group';
            item.innerHTML = `
                <span>${tpl.name}</span>
                <i class="ph ph-trash text-gray-300 group-hover:text-red-400 hover:text-red-500" onclick="event.stopPropagation(); deletePromptTemplate('${key}')"></i>
            `;
            item.onclick = (e) => {
                if (e.target.classList.contains('ph-trash')) return;
                e.stopPropagation();
                UI.promptEditor.value = tpl.content;
                menu.classList.add('hidden');
            };
            menu.appendChild(item);
        });

        // Divider and actions
        const divider = document.createElement('div');
        divider.className = 'border-t border-gray-100 my-1';
        menu.appendChild(divider);

        // Add template button
        const addBtn = document.createElement('button');
        addBtn.className = 'w-full px-3 py-2 text-left text-sm text-purple-600 hover:bg-purple-50 transition-colors flex items-center gap-2';
        addBtn.innerHTML = '<i class="ph ph-plus"></i> 添加当前为模板';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            addCurrentAsPromptTemplate();
            menu.classList.add('hidden');
        };
        menu.appendChild(addBtn);

        // Reset button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'w-full px-3 py-2 text-left text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors';
        resetBtn.innerHTML = '<i class="ph ph-arrow-counter-clockwise"></i> 刷新';
        resetBtn.onclick = async (e) => {
            e.stopPropagation();
            await loadPromptTemplatesFromAPI();
            renderMenu();
        };
        menu.appendChild(resetBtn);
    }

    renderMenu();

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderMenu(); // Refresh on open
        menu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        menu.classList.add('hidden');
    });
}

// Add current prompt content as template
async function addCurrentAsPromptTemplate() {
    const content = UI.promptEditor.value.trim();
    if (!content) {
        alert('请先输入提示词内容');
        return;
    }

    const name = prompt('请输入模板名称：');
    if (!name || !name.trim()) return;

    const id = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'custom-' + Date.now();
    await savePromptTemplateToAPI(id, { name: name.trim(), content });
    alert('模板已保存');
}

// Delete a prompt template
async function deletePromptTemplate(key) {
    if (!confirm(`确定删除模板 "${key}" 吗？`)) return;
    await deletePromptTemplateFromAPI(key);
}


