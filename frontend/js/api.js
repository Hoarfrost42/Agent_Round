/**
 * Backend API Wrapper
 */
class AgentAPI {
    constructor(baseUrl) {
        // Default to empty string to use relative paths (e.g. /api/...)
        // This automatically adapts to whatever host/port the page is served from.
        this.baseUrl = baseUrl || '';
    }

    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `API Error: ${response.status}`);
            }
            // 204 No Content
            if (response.status === 204) return null;

            return await response.json();
        } catch (error) {
            console.error(`Request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // --- System ---
    async getHealth() {
        return this._request('/api/health');
    }

    // --- Providers ---
    async getProviders() {
        return this._request('/api/providers');
    }

    async updateProvider(providerId, config) {
        return this._request(`/api/providers/${providerId}`, {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    async createProvider(config) {
        return this._request('/api/providers', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    }

    async createModel(providerId, modelConfig) {
        return this._request(`/api/providers/${providerId}/models`, {
            method: 'POST',
            body: JSON.stringify(modelConfig)
        });
    }

    async getModelPrompt(providerId, modelId) {
        return this._request(`/api/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}/prompt`);
    }

    async updateModelPrompt(providerId, modelId, prompt) {
        return this._request(`/api/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}/prompt`, {
            method: 'PUT',
            body: JSON.stringify({ prompt })
        });
    }

    // --- System Control ---
    async shutdown() {
        return this._request('/api/shutdown', {
            method: 'POST'
        });
    }

    // --- Sessions ---
    async createSession(selectedModels) {
        return this._request('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({ selected_models: selectedModels })
        });
    }

    async getSession(sessionId) {
        return this._request(`/api/sessions/${sessionId}`);
    }

    async listSessions() {
        return this._request('/api/sessions');
    }

    // --- Round Control ---
    async startRound(sessionId, userInput) {
        return this._request(`/api/sessions/${sessionId}/start`, {
            method: 'POST',
            body: JSON.stringify({ user_input: userInput })
        });
    }

    async continueRound(sessionId, userInput) {
        return this._request(`/api/sessions/${sessionId}/continue`, {
            method: 'POST',
            body: JSON.stringify({ user_input: userInput })
        });
    }

    async endSession(sessionId) {
        return this._request(`/api/sessions/${sessionId}/end`, {
            method: 'POST'
        });
    }

    async deleteSession(sessionId) {
        return this._request(`/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    }
}
