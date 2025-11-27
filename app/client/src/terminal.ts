// Initialize xterm.js terminal
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Courier New", Courier, monospace',
    theme: {
        background: '#030303',
        foreground: 'white',
        cursor: '#00ff00',
        cursorAccent: '#030303',
        selection: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#ff0000',
        green: '#00ff00',
        yellow: '#ffff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#808080',
        brightRed: '#ff8080',
        brightGreen: '#80ff80',
        brightYellow: '#ffff80',
        brightBlue: '#8080ff',
        brightMagenta: '#ff80ff',
        brightCyan: '#80ffff',
        brightWhite: '#ffffff',
    },
    allowTransparency: false,
    scrollback: 10000,
    tabStopWidth: 8,
});

// Load addons
const fitAddon = new FitAddon.FitAddon();
const webLinksAddon = new WebLinksAddon.WebLinksAddon();

term.loadAddon(fitAddon);
term.loadAddon(webLinksAddon);

// Open terminal in the DOM
term.open(document.getElementById('terminal'));

// Fit terminal to container after a short delay to ensure container is sized
// This happens when the page loads, before authentication
setTimeout(() => {
    fitAddon.fit();
}, 10);

// Handle window resize
let resizeTimeout: ReturnType<typeof setTimeout>;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        fitAddon.fit();
        // Send resize event to server
        if (window.terminalWS && window.terminalWS.readyState === WebSocket.OPEN) {
            window.terminalWS.send(
                JSON.stringify({
                    type: 'resize',
                    cols: term.cols,
                    rows: term.rows,
                })
            );
        }
    }, 100);
});

// Handle terminal data (user input)
term.onData((data: string) => {
    if (window.terminalWS && window.terminalWS.readyState === WebSocket.OPEN) {
        window.terminalWS.send(
            JSON.stringify({
                type: 'input',
                data: data,
            })
        );
    }
});

// Handle paste events
term.onBinary((data: string) => {
    if (window.terminalWS && window.terminalWS.readyState === WebSocket.OPEN) {
        window.terminalWS.send(
            JSON.stringify({
                type: 'input',
                data: data,
            })
        );
    }
});

// Prevent browser from capturing certain key combinations
term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    // Allow Ctrl+C, Ctrl+V, etc. to be sent to terminal
    if (event.ctrlKey) {
        return false; // Let xterm.js handle it
    }
    return true;
});

// Update connection status
function updateConnectionStatus(status: string, text: string): void {
    const indicator = document.getElementById('status-indicator') as HTMLSpanElement;
    const statusText = document.getElementById('status-text') as HTMLSpanElement;
    const statusDiv = document.getElementById('connection-status') as HTMLDivElement;

    statusDiv.className = 'connection-status ' + status;
    statusText.textContent = text;

    // Set indicator color
    if (status === 'connected') {
        indicator.style.color = '#00ff00';
    } else if (status === 'connecting') {
        indicator.style.color = '#ffff00';
    } else {
        indicator.style.color = '#ff0000';
    }
}

// Expose terminal instance globally for WebSocket to use
window.terminal = term;
window.updateConnectionStatus = updateConnectionStatus;

// Listen for auth-ready event to re-fit terminal when showing
window.addEventListener('auth-ready', () => {
    // Re-fit when terminal container becomes visible
    setTimeout(() => {
        fitAddon.fit();
        // Send resize to server if WebSocket is connected
        if (window.terminalWS && window.terminalWS.readyState === WebSocket.OPEN) {
            window.terminalWS.send(
                JSON.stringify({
                    type: 'resize',
                    cols: term.cols,
                    rows: term.rows,
                })
            );
        }
    }, 100);
});
