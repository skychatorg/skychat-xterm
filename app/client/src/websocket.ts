// WebSocket connection management
interface WebSocketMessage {
    type: string;
    data?: string;
    code?: number;
    message?: string;
    cols?: number;
    rows?: number;
}

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const maxReconnectDelay = 30000; // 30 seconds
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

// Wait for authentication before connecting
window.addEventListener('auth-ready', () => {
    connect();
});

function connect(): void {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return; // Already connecting or connected
    }

    // Get JWT from localStorage
    const jwt = window.authManager.getJWT();

    if (!jwt) {
        console.error('No JWT found');
        window.updateConnectionStatus('error', 'Not authenticated');
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/terminal?jwt=${encodeURIComponent(jwt)}`;

    window.updateConnectionStatus('connecting', 'Connecting...');

    try {
        ws = new WebSocket(wsUrl);
        window.terminalWS = ws;

        ws.onopen = (): void => {
            console.log('WebSocket connected');
            window.updateConnectionStatus('connected', 'Connected');
            reconnectAttempts = 0;

            // Send initial terminal size after a delay to ensure terminal is fitted
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN && window.terminal) {
                    console.log(
                        `Sending initial terminal size: ${window.terminal.cols}x${window.terminal.rows}`
                    );
                    ws.send(
                        JSON.stringify({
                            type: 'resize',
                            cols: window.terminal.cols,
                            rows: window.terminal.rows,
                        })
                    );
                }
            }, 200);
        };

        ws.onmessage = (event: MessageEvent): void => {
            try {
                const message = JSON.parse(event.data) as WebSocketMessage;

                if (message.type === 'data') {
                    // Write PTY output to terminal
                    if (window.terminal) {
                        window.terminal.write(message.data);
                    }
                } else if (message.type === 'connected') {
                    console.log('Terminal session connected');
                } else if (message.type === 'exit') {
                    console.log('PTY process exited with code:', message.code);
                    window.updateConnectionStatus('disconnected', 'Session ended');
                    if (window.terminal) {
                        window.terminal.write(
                            '\r\n\x1b[31mSession ended. Please refresh the page to start a new session.\x1b[0m\r\n'
                        );
                    }
                } else if (message.type === 'error') {
                    console.error('Server error:', message.message);
                    window.updateConnectionStatus('error', 'Error: ' + message.message);

                    // Check if it's an auth error
                    if (
                        message.message &&
                        (message.message.includes('token') ||
                            message.message.includes('auth') ||
                            message.message.includes('Invalid') ||
                            message.message.includes('expired'))
                    ) {
                        console.log('Authentication error detected, clearing auth and reloading');
                        window.authManager.clearAuth();
                        window.location.reload();
                        return;
                    }

                    if (window.terminal) {
                        window.terminal.write(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
                    }
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onerror = (error: Event): void => {
            console.error('WebSocket error:', error);
            window.updateConnectionStatus('error', 'Connection error');
        };

        ws.onclose = (event: CloseEvent): void => {
            console.log('WebSocket closed:', event.code, event.reason);
            ws = null;
            window.terminalWS = null;

            // Only attempt reconnection if it wasn't a normal closure
            if (event.code !== 1000 && event.code !== 1001) {
                window.updateConnectionStatus('disconnected', 'Disconnected - Reconnecting...');
                scheduleReconnect();
            } else {
                window.updateConnectionStatus('disconnected', 'Disconnected');
            }
        };
    } catch (error) {
        console.error('Error creating WebSocket:', error);
        window.updateConnectionStatus('error', 'Connection failed');
        scheduleReconnect();
    }
}

function scheduleReconnect(): void {
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);

    reconnectTimeout = setTimeout(() => {
        connect();
    }, delay);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Page became visible, check connection
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('Page visible, reconnecting...');
            reconnectAttempts = 0; // Reset attempts when user returns
            connect();
        }
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close(1000, 'Page unload');
    }
});
