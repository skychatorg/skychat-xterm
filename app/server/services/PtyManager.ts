import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';
import pty from 'node-pty';
import path from 'path';
import { fileURLToPath } from 'url';
import type { WebSocket } from 'ws';
import { validateAndNormalizeUsername, validatePathComponent } from '../utils/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

interface Config {
    SKYCHAT_HOST: string;
    SESSION_TIMEOUT_MS: number;
    [key: string]: unknown;
}

// Extend IPty with EventEmitter methods
export interface PtyProcess extends IPty, EventEmitter {
    on(event: 'data', listener: (data: string) => void): this;
    on(event: 'exit', listener: (code: number, signal?: number) => void): this;
    once(event: 'exit', listener: (code: number) => void): this;
    off(event: 'data', listener: (data: string) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
}

export interface PtySession {
    pty: PtyProcess;
    created: number;
    lastActivity: number;
    subscribers: WebSocket[];
}

export class PtyManager {
    private config: Config;
    private sessions: Map<string, PtySession>;

    constructor(config: Config) {
        this.config = config;
        this.sessions = new Map();
    }

    /**
     * Get or create a PTY session for a username
     * @param username - SkyChat username
     * @param forceNew - Force creation of new session (kills existing)
     * @returns Session object with PTY instance
     */
    getOrCreateSession(username: string, forceNew: boolean = false): PtySession {
        // Validate and normalize username
        const normalizedUsername = validateAndNormalizeUsername(username);

        if (forceNew && this.sessions.has(normalizedUsername)) {
            this.cleanupSession(normalizedUsername);
        }

        if (this.sessions.has(normalizedUsername)) {
            const session = this.sessions.get(normalizedUsername)!;
            session.lastActivity = Date.now();
            return session;
        }

        return this.createSession(normalizedUsername);
    }

    /**
     * Create a new PTY session
     * @param username - SkyChat username (must be pre-validated)
     * @returns Session object
     */
    createSession(username: string): PtySession {
        // Validate and normalize username (defense in depth)
        const normalizedUsername = validateAndNormalizeUsername(username);
        validatePathComponent(normalizedUsername);

        console.log(`Creating new PTY session for user: ${normalizedUsername}`);

        const sessionDir = path.join(DATA_DIR, 'sessions', normalizedUsername);

        // Spawn skychat-cli in a PTY
        const ptyProcess = pty.spawn(
            './node_modules/.bin/skychat-cli',
            ['-h', this.config.SKYCHAT_HOST],
            {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    SKYCHAT_TOKEN_DIR: sessionDir,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                },
            }
        ) as PtyProcess;

        const session: PtySession = {
            pty: ptyProcess,
            created: Date.now(),
            lastActivity: Date.now(),
            subscribers: [],
        };

        this.sessions.set(normalizedUsername, session);

        // Handle PTY exit
        ptyProcess.on('exit', (code: number, signal?: number) => {
            console.log(
                `PTY session exited for user ${normalizedUsername} (code: ${code}, signal: ${signal})`
            );
            this.cleanupSession(normalizedUsername);
        });

        return session;
    }

    /**
     * Check if a session exists for a username
     * @param username - SkyChat username
     * @returns boolean
     */
    hasActiveSession(username: string): boolean {
        const normalizedUsername = validateAndNormalizeUsername(username);
        return this.sessions.has(normalizedUsername);
    }

    /**
     * Get session for a username
     * @param username - SkyChat username
     * @returns Session object or undefined
     */
    getSession(username: string): PtySession | undefined {
        const normalizedUsername = validateAndNormalizeUsername(username);
        return this.sessions.get(normalizedUsername);
    }

    /**
     * Attach a WebSocket to a PTY session
     * @param username - SkyChat username
     * @param ws - WebSocket connection
     */
    attachToSession(username: string, ws: WebSocket): void {
        const normalizedUsername = validateAndNormalizeUsername(username);
        const session = this.sessions.get(normalizedUsername);
        if (session && !session.subscribers.includes(ws)) {
            session.subscribers.push(ws);
            session.lastActivity = Date.now();
        }
    }

    /**
     * Detach a WebSocket from a PTY session
     * @param username - SkyChat username
     * @param ws - WebSocket connection
     */
    detachFromSession(username: string, ws: WebSocket): void {
        const normalizedUsername = validateAndNormalizeUsername(username);
        const session = this.sessions.get(normalizedUsername);
        if (session) {
            const index = session.subscribers.indexOf(ws);
            if (index > -1) {
                session.subscribers.splice(index, 1);
            }
        }
    }

    /**
     * Cleanup a PTY session
     * @param username - SkyChat username
     */
    cleanupSession(username: string): void {
        const normalizedUsername = validateAndNormalizeUsername(username);
        const session = this.sessions.get(normalizedUsername);
        if (session) {
            console.log(`Cleaning up PTY session for user: ${normalizedUsername}`);

            // Close all subscribers
            session.subscribers.forEach((ws) => {
                if (ws.readyState === 1) {
                    // OPEN
                    ws.send(JSON.stringify({ type: 'exit', code: 0 }));
                    ws.close();
                }
            });

            // Kill PTY if still alive
            try {
                session.pty.kill();
            } catch (error) {
                console.error(`Error killing PTY:`, error);
            }

            this.sessions.delete(normalizedUsername);
        }
    }

    /**
     * Cleanup inactive sessions based on timeout
     * @param timeoutMs - Inactivity timeout in milliseconds
     * @returns Number of sessions cleaned up
     */
    cleanupInactiveSessions(timeoutMs: number): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [username, session] of this.sessions.entries()) {
            // Only cleanup if no active subscribers and inactive for timeout period
            if (session.subscribers.length === 0 && now - session.lastActivity > timeoutMs) {
                this.cleanupSession(username);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} inactive PTY sessions`);
        }

        return cleaned;
    }

    /**
     * Get session statistics
     * @returns Session stats
     */
    getStats(): {
        totalSessions: number;
        sessions: Array<{
            username: string;
            created: string;
            lastActivity: string;
            subscribers: number;
        }>;
    } {
        return {
            totalSessions: this.sessions.size,
            sessions: Array.from(this.sessions.entries()).map(([username, session]) => ({
                username,
                created: new Date(session.created).toISOString(),
                lastActivity: new Date(session.lastActivity).toISOString(),
                subscribers: session.subscribers.length,
            })),
        };
    }

    /**
     * Shutdown all sessions
     */
    shutdownAll(): void {
        console.log(`Shutting down ${this.sessions.size} PTY sessions...`);
        for (const username of this.sessions.keys()) {
            this.cleanupSession(username);
        }
    }
}
