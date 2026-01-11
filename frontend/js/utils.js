class Utils {
    static escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Shared Color Definitions
    static colorClasses = {
        teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', btnBg: 'bg-teal-500', btnText: 'text-white', btnBorder: 'border-teal-500' },
        violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', btnBg: 'bg-violet-500', btnText: 'text-white', btnBorder: 'border-violet-500' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', btnBg: 'bg-blue-500', btnText: 'text-white', btnBorder: 'border-blue-500' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', btnBg: 'bg-orange-500', btnText: 'text-white', btnBorder: 'border-orange-500' },
        rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', btnBg: 'bg-rose-500', btnText: 'text-white', btnBorder: 'border-rose-500' },
        green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', btnBg: 'bg-emerald-500', btnText: 'text-white', btnBorder: 'border-emerald-500' },
        gray: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', btnBg: 'bg-slate-500', btnText: 'text-white', btnBorder: 'border-slate-500' },
    };

    // Shared Markdown Parser
    static parseMarkdown(text) {
        if (!text) return '';

        // 1. Configure marked (if available)
        if (typeof marked !== 'undefined') {
            try {
                if (!Utils._markedConfigured) {
                    marked.setOptions({
                        highlight: function (code, lang) {
                            // Check if hljs is available
                            if (typeof hljs !== 'undefined') {
                                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                                return hljs.highlight(code, { language }).value;
                            }
                            return code;
                        },
                        langPrefix: 'hljs language-',
                        gfm: true,
                        breaks: true
                    });
                    Utils._markedConfigured = true;
                }

                // 2. Parse Markdown
                let html = marked.parse(text);

                // 3. Post-process Math (if katex available)
                if (typeof katex !== 'undefined') {
                    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
                        try {
                            return katex.renderToString(formula, { displayMode: true });
                        } catch (e) { return match; }
                    });
                    html = html.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
                        try {
                            return katex.renderToString(formula, { displayMode: false });
                        } catch (e) { return match; }
                    });
                }

                return html;

            } catch (e) {
                console.error("Markdown parse error:", e);
                return Utils.escapeHtml(text);
            }
        }

        // Fallback
        return Utils.escapeHtml(text).replace(/\n/g, '<br>');
    }
}
