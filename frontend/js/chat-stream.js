/**
 * Chat Streaming Logic
 * Handles SSE connections and events
 */

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

        // UI updates via chat-ui.js global functions
        UI.currentStreamModelId = data.model;
        UI.currentStreamContent = "";

        // Optimistically render an empty bubble
        appendMessage({
            role: 'assistant',
            model_id: data.model,
            content: '...' // Loading state
        });
    });

    es.addEventListener('token', (e) => {
        const data = JSON.parse(e.data);
        UI.currentStreamContent += data.content;

        // Update the last message bubble
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

        // Show decision card
        renderDecisionCard(AppState.sessionId);
    });

    es.addEventListener('title_generated', (e) => {
        const data = JSON.parse(e.data);
        // Update sidebar if visible
        // Function from chat.js (Controller), so we expect it to be available
        if (typeof loadSessionList === 'function') {
            loadSessionList();
        }
    });

    es.onerror = (e) => {
        console.error("SSE Error:", e);
        es.close();
        setProcessing(false);
    };
}
