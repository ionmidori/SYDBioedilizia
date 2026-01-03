/**
 * Toast notification utility
 * ✅ BUG FIX #16: Replace blocking alert() with non-blocking toast
 * 
 * Simple toast implementation without external dependencies
 */

interface ToastOptions {
    duration?: number;
    type?: 'success' | 'error' | 'info' | 'warning';
}

const defaultDuration = 3000;

const createToastContainer = () => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }
    return container;
};

const typeStyles = {
    success: 'background: #10b981; border-left: 4px solid #059669;',
    error: 'background: #ef4444; border-left: 4px solid #dc2626;',
    info: 'background: #3b82f6; border-left: 4px solid #2563eb;',
    warning: 'background: #f59e0b; border-left: 4px solid #d97706;'
};

export const toast = {
    show: (message: string, options: ToastOptions = {}) => {
        const { duration = defaultDuration, type = 'info' } = options;
        const container = createToastContainer();

        const toastEl = document.createElement('div');
        toastEl.style.cssText = `
            ${typeStyles[type]}
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            font-size: 14px;
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 350px;
            pointer-events: auto;
            animation: slideIn 0.3s ease-out;
            opacity: 1;
            transition: opacity 0.3s ease-out;
        `;
        toastEl.textContent = message;

        // Add animation styles if not already added
        if (!document.getElementById('toast-animations')) {
            const style = document.createElement('style');
            style.id = 'toast-animations';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        container.appendChild(toastEl);

        // Auto remove after duration
        setTimeout(() => {
            toastEl.style.opacity = '0';
            setTimeout(() => {
                container.removeChild(toastEl);
                if (container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }, 300);
        }, duration);
    },

    success: (message: string, duration?: number) => {
        toast.show(message, { type: 'success', duration });
    },

    error: (message: string, duration?: number) => {
        toast.show(message, { type: 'error', duration });
    },

    info: (message: string, duration?: number) => {
        toast.show(message, { type: 'info', duration });
    },

    warning: (message: string, duration?: number) => {
        toast.show(message, { type: 'warning', duration });
    }
};
