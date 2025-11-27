import fs from 'fs-extra';
import jwt from 'jsonwebtoken';
import path from 'path';
import { SkyChatClient } from 'skychat';
import { AuthToken } from 'skychat/build/server';
import { fileURLToPath } from 'url';
import { validateAndNormalizeUsername, validatePathComponent } from '../utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

interface ValidateResult {
    valid: boolean;
    skychatToken?: AuthToken;
    error?: string;
}

interface JWTPayload {
    username: string;
    iat: number;
}

interface JWTValidateResult {
    valid: boolean;
    username?: string;
    error?: string;
}

export class AuthService {
    private JWT_SECRET: string;
    private JWT_EXPIRY: string = '24h';
    private skychatHost: string;
    private skychatProtocol: string;

    constructor(skychatHost: string, skychatProtocol: string = 'wss') {
        // Get JWT secret from environment
        this.JWT_SECRET = process.env.JWT_SECRET || '';

        if (!this.JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        this.skychatHost = skychatHost;
        this.skychatProtocol = skychatProtocol;

        // Ensure sessions directory exists
        fs.ensureDirSync(SESSIONS_DIR);
    }

    /**
     * Get the endpoint URL for SkyChat WebSocket connection
     */
    private getEndPointUrl(): string {
        return `${this.skychatProtocol}://${this.skychatHost}/api/ws`;
    }

    /**
     * Validate credentials against SkyChat server
     * Creates temporary connection, attempts login, captures auth token
     */
    async validateCredentials(username: string, password: string): Promise<ValidateResult> {
        // Validate and normalize username
        let normalizedUsername: string;
        try {
            normalizedUsername = validateAndNormalizeUsername(username);
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Invalid username',
            };
        }

        return new Promise((resolve) => {
            const url = this.getEndPointUrl();
            const client = new SkyChatClient(url, { autoMessageAck: true });

            let authToken: AuthToken | null = null;
            let resolved = false;

            // Set timeout to avoid hanging
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    // Close the WebSocket connection
                    if ((client as any)._websocket) {
                        (client as any)._websocket.close();
                    }
                    resolve({
                        valid: false,
                        error: 'Authentication timeout',
                    });
                }
            }, 10000); // 10 second timeout

            // Listen for successful auth token
            client.once('auth-token', (token: AuthToken) => {
                authToken = token;
                console.log(`Authentication successful for user: ${normalizedUsername}`);
                if (!resolved && authToken) {
                    resolved = true;
                    clearTimeout(timeout);
                    // Close the WebSocket connection
                    if ((client as any)._websocket) {
                        (client as any)._websocket.close();
                    }
                    resolve({
                        valid: true,
                        skychatToken: authToken,
                    });
                }
            });

            // Listen for errors
            client.on('error', (errorMessage: string) => {
                console.error('SkyChat client error:', errorMessage);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    // Close the WebSocket connection
                    if ((client as any)._websocket) {
                        (client as any)._websocket.close();
                    }
                    resolve({
                        valid: false,
                        error: 'Authentication failed: Invalid credentials',
                    });
                }
            });

            // Connect and attempt login
            try {
                client.connect();
                client.once('update', () => {
                    // Connection established, now login
                    if (!resolved) {
                        client.login(normalizedUsername, password);
                    }
                });
            } catch (error) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({
                        valid: false,
                        error: error instanceof Error ? error.message : 'Connection failed',
                    });
                }
            }
        });
    }

    /**
     * Create session and return JWT
     * Saves SkyChat token to session directory and generates JWT
     */
    async createSession(username: string, skychatToken: AuthToken): Promise<string> {
        // Validate and normalize username (defense in depth)
        const normalizedUsername = validateAndNormalizeUsername(username);
        validatePathComponent(normalizedUsername);

        // Ensure session directory exists
        const sessionDir = path.join(SESSIONS_DIR, normalizedUsername);
        await fs.ensureDir(sessionDir);

        // Save SkyChat token
        const tokenPath = path.join(sessionDir, 'token.json');
        await fs.writeFile(tokenPath, JSON.stringify(skychatToken, null, 2));

        console.log(`Session created for user: ${normalizedUsername}`);

        // Generate JWT
        const payload: JWTPayload = {
            username: normalizedUsername,
            iat: Math.floor(Date.now() / 1000),
        };

        const token = jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRY,
        } as jwt.SignOptions);

        return token;
    }

    /**
     * Validate JWT and return username
     */
    validateJWT(token: string): JWTValidateResult {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET) as JWTPayload;

            return {
                valid: true,
                username: decoded.username,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid token';
            return {
                valid: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Revoke user session
     * Removes session directory and all associated data
     */
    async revokeSession(username: string): Promise<void> {
        // Validate and normalize username (defense in depth)
        const normalizedUsername = validateAndNormalizeUsername(username);
        validatePathComponent(normalizedUsername);

        const sessionDir = path.join(SESSIONS_DIR, normalizedUsername);

        try {
            await fs.remove(sessionDir);
            console.log(`Session revoked for user: ${normalizedUsername}`);
        } catch (error) {
            console.error(`Failed to revoke session for ${normalizedUsername}:`, error);
        }
    }
}
