// Global type declarations

declare global {
    // xterm.js CDN globals
    const Terminal: any;
    const FitAddon: any;
    const WebLinksAddon: any;

    interface Window {
        terminal: any;
        terminalWS: WebSocket | null;
        updateConnectionStatus: (status: string, text: string) => void;
        authManager: any;
    }
}

export {};
