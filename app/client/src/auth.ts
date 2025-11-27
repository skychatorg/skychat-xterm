interface LoginResponse {
    jwt: string;
    username: string;
}

interface ErrorResponse {
    error?: string;
}

class AuthManager {
    private readonly JWT_KEY = 'skychat_jwt';
    private readonly USERNAME_KEY = 'skychat_username';

    // Get stored JWT
    getJWT(): string | null {
        return localStorage.getItem(this.JWT_KEY);
    }

    // Get stored username
    getUsername(): string | null {
        return localStorage.getItem(this.USERNAME_KEY);
    }

    // Store JWT and username
    setAuth(jwt: string, username: string): void {
        localStorage.setItem(this.JWT_KEY, jwt);
        localStorage.setItem(this.USERNAME_KEY, username);
    }

    // Clear auth
    clearAuth(): void {
        localStorage.removeItem(this.JWT_KEY);
        localStorage.removeItem(this.USERNAME_KEY);
    }

    // Check if user is authenticated
    isAuthenticated(): boolean {
        return !!this.getJWT();
    }

    // Login with credentials
    async login(username: string, password: string): Promise<LoginResponse> {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = (await response.json()) as LoginResponse & ErrorResponse;

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        this.setAuth(data.jwt, data.username);
        return data as LoginResponse;
    }

    // Logout
    async logout(): Promise<void> {
        const jwt = this.getJWT();

        if (jwt) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${jwt}` },
                });
            } catch (e) {
                console.error('Logout error:', e);
            }
        }

        this.clearAuth();
    }
}

// Initialize auth manager and make it available globally
(window as any).authManager = new AuthManager();
const authManager = (window as any).authManager;

// Handle login form submission
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form') as HTMLFormElement;
    const loginButton = document.getElementById('login-button') as HTMLButtonElement;
    const loginError = document.getElementById('login-error') as HTMLDivElement;
    const loginContainer = document.getElementById('login-container') as HTMLDivElement;
    const terminalContainer = document.getElementById('terminal-container') as HTMLDivElement;

    if (!loginForm || !loginButton || !loginError || !loginContainer || !terminalContainer) {
        // Elements not found, maybe we're on a different page
        return;
    }

    // Check if already authenticated
    if (authManager.isAuthenticated()) {
        showTerminal();
        return;
    }

    loginForm.addEventListener('submit', async (e: Event) => {
        e.preventDefault();

        const username = (document.getElementById('username') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;

        loginButton.disabled = true;
        loginButton.textContent = 'Logging in...';
        loginError.textContent = '';

        try {
            await authManager.login(username, password);
            showTerminal();
        } catch (error) {
            loginError.textContent = (error as Error).message;
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        }
    });

    function showTerminal(): void {
        loginContainer.style.display = 'none';
        terminalContainer.style.display = 'block';

        // Trigger terminal initialization (handled by terminal.js)
        window.dispatchEvent(new Event('auth-ready'));
    }
});
