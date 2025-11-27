import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { AuthService } from '../services/AuthService.js';
import type { PtyManager, PtyProcess } from '../services/PtyManager.js';
import type { IncomingMessage } from 'http';
import { sanitizeTerminalInput, validateTerminalDimensions } from '../utils/security.js';

interface WebSocketMessage {
    type: string;
    data?: string;
    cols?: number;
    rows?: number;
    message?: string;
    code?: number;
}

export function setupTerminalWebSocket(
    server: Server,
    authService: AuthService,
    ptyManager: PtyManager
): WebSocketServer {
    const wss = new WebSocketServer({
        server,
        path: '/terminal',
    });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        console.log('New WebSocket connection attempt');

        // Extract JWT from query parameter
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const jwt = url.searchParams.get('jwt');

        if (!jwt) {
            console.error('Connection rejected: No authentication token provided');
            ws.send(JSON.stringify({ type: 'error', message: 'No authentication token' }));
            ws.close();
            return;
        }

        // Validate JWT
        const authResult = authService.validateJWT(jwt);

        if (!authResult.valid) {
            console.error(`Connection rejected: Invalid or expired token`);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
            ws.close();
            return;
        }

        const username = authResult.username!;

        console.log(`WebSocket connected for user: ${username}`);

        // Get or create PTY session (force new to maintain 1-session limit)
        const session = ptyManager.getOrCreateSession(username, true);
        const pty = session.pty as PtyProcess;

        // Attach this WebSocket to the session
        ptyManager.attachToSession(username, ws);

        // PTY output → WebSocket
        const dataHandler = (data: string): void => {
            if (ws.readyState === 1) {
                // OPEN
                ws.send(JSON.stringify({ type: 'data', data }));
            }
        };
        pty.on('data', dataHandler);

        // WebSocket → PTY input
        ws.on('message', (message) => {
            try {
                const msg = JSON.parse(message.toString()) as WebSocketMessage;

                if (msg.type === 'input') {
                    // User input from terminal - validate and sanitize
                    if (msg.data) {
                        try {
                            const sanitizedInput = sanitizeTerminalInput(msg.data);
                            pty.write(sanitizedInput);
                        } catch (error) {
                            console.error(
                                `Invalid terminal input from ${username}:`,
                                error instanceof Error ? error.message : error
                            );
                            ws.send(
                                JSON.stringify({
                                    type: 'error',
                                    message: 'Invalid input',
                                })
                            );
                        }
                    }
                } else if (msg.type === 'resize') {
                    // Terminal resize event - validate dimensions
                    if (msg.cols && msg.rows) {
                        try {
                            validateTerminalDimensions(msg.cols, msg.rows);
                            pty.resize(msg.cols, msg.rows);
                            console.log(
                                `Terminal resized to ${msg.cols}x${msg.rows} for user ${username}`
                            );
                        } catch (error) {
                            console.error(
                                `Invalid terminal dimensions from ${username}:`,
                                error instanceof Error ? error.message : error
                            );
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        });

        // Handle WebSocket close
        ws.on('close', () => {
            console.log(`WebSocket closed for user: ${username}`);
            pty.removeListener('data', dataHandler);
            ptyManager.detachFromSession(username, ws);

            // Note: We don't kill the PTY here - it will be cleaned up by the
            // cleanup interval if inactive for too long, allowing reconnection
        });

        // Handle WebSocket errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for user ${username}:`, error);
        });

        // Handle PTY exit
        const exitHandler = (code: number): void => {
            if (ws.readyState === 1) {
                // OPEN
                ws.send(JSON.stringify({ type: 'exit', code }));
                ws.close();
            }
        };
        pty.once('exit', exitHandler);

        // Send initial connection success message
        ws.send(JSON.stringify({ type: 'connected' }));
    });

    // Handle server-level errors
    wss.on('error', (error) => {
        console.error('WebSocket Server error:', error);
    });

    console.log('WebSocket server initialized at /terminal');

    return wss;
}
