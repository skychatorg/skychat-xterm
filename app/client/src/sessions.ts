// sessions.ts
interface Session {
    username: string;
    created: string;
    lastActivity: string;
    active: boolean;
}

class SessionManager {
    private overlay: HTMLElement | null = null;
    private sessionList: HTMLElement | null = null;
    private closeButton: HTMLElement | null = null;

    constructor() {
        // Wait for DOM to be ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    private init(): void {
        this.overlay = document.getElementById('session-overlay');
        this.sessionList = document.getElementById('session-list');
        this.closeButton = document.getElementById('close-overlay');

        if (!this.overlay || !this.sessionList || !this.closeButton) {
            // Elements not found, maybe we're on a different page
            return;
        }

        this.bindEvents();
    }

    private bindEvents(): void {
        if (!this.overlay || !this.closeButton) return;

        // Close overlay
        this.closeButton.addEventListener('click', () => this.hide());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            // Ctrl+S or Cmd+S to toggle overlay
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.toggle();
            }

            // Escape to close
            if (this.overlay && e.key === 'Escape' && this.overlay.style.display === 'block') {
                this.hide();
            }
        });

        // Click outside to close
        this.overlay.addEventListener('click', (e: MouseEvent) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });
    }

    async show(): Promise<void> {
        if (!this.overlay) return;
        await this.loadSessions();
        this.overlay.style.display = 'flex';
    }

    hide(): void {
        if (!this.overlay) return;
        this.overlay.style.display = 'none';
    }

    toggle(): void {
        if (!this.overlay) return;
        if (this.overlay.style.display === 'none' || this.overlay.style.display === '') {
            this.show();
        } else {
            this.hide();
        }
    }

    async loadSessions(): Promise<void> {
        const jwt = window.authManager.getJWT();

        if (!jwt || !this.sessionList) return;

        try {
            const response = await fetch('/api/sessions', {
                headers: { Authorization: `Bearer ${jwt}` },
            });

            if (!response.ok) {
                throw new Error('Failed to load sessions');
            }

            const sessions = (await response.json()) as Session[];
            this.renderSessions(sessions);
        } catch (error) {
            console.error('Failed to load sessions:', error);
            if (this.sessionList) {
                this.sessionList.innerHTML = '<p class="error">Failed to load sessions</p>';
            }
        }
    }

    private renderSessions(sessions: Session[]): void {
        if (!this.sessionList) return;

        if (sessions.length === 0) {
            this.sessionList.innerHTML = '<p>No active sessions</p>';
            return;
        }

        this.sessionList.innerHTML = sessions
            .map(
                (session) => `
            <div class="session-item">
                <div class="session-info">
                    <div class="session-username">${this.escapeHtml(session.username)}</div>
                    <div class="session-time">
                        Created: ${new Date(session.created).toLocaleString()}<br>
                        Last Activity: ${new Date(session.lastActivity).toLocaleString()}
                    </div>
                    <div class="session-status ${session.active ? 'active' : 'inactive'}">
                        ${session.active ? 'Active' : 'Inactive'}
                    </div>
                </div>
                <button class="terminate-button" onclick="sessionManager.terminateSession('${this.escapeHtml(session.username)}')">
                    Terminate
                </button>
            </div>
        `
            )
            .join('');
    }

    async terminateSession(username: string): Promise<void> {
        if (!confirm(`Terminate session for ${username}?`)) {
            return;
        }

        const jwt = window.authManager.getJWT();

        if (!jwt) return;

        try {
            const response = await fetch(`/api/sessions/${encodeURIComponent(username)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` },
            });

            if (!response.ok) {
                throw new Error('Failed to terminate session');
            }

            // Reload session list
            await this.loadSessions();

            // If terminating current session, reload page
            if (username === window.authManager.getUsername()) {
                window.authManager.clearAuth();
                window.location.reload();
            }
        } catch (error) {
            console.error('Failed to terminate session:', error);
            alert('Failed to terminate session');
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize session manager
const _sessionManager = new SessionManager();
