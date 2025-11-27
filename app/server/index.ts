import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { AuthService } from './services/AuthService.js';
import { PtyManager } from './services/PtyManager.js';
import { setupTerminalWebSocket } from './websocket/terminal.js';
import {
    validateHostname,
    validatePort,
    validateProtocol,
    validateTimeout,
} from './utils/config.js';

// Load environment variables
dotenv.config();

// Configuration
interface Config {
    PORT: number;
    NODE_ENV: string;
    SKYCHAT_HOST: string;
    SKYCHAT_PROTOCOL: string;
    SESSION_TIMEOUT_MS: number;
    [key: string]: string | number;
}

// Validate and sanitize configuration
const config: Config = {
    PORT: validatePort(process.env.PORT || '3000'),
    NODE_ENV: process.env.NODE_ENV || 'development',
    SKYCHAT_HOST: validateHostname(process.env.SKYCHAT_HOST || 'localhost'),
    SKYCHAT_PROTOCOL: validateProtocol(process.env.SKYCHAT_PROTOCOL || 'wss'),
    SESSION_TIMEOUT_MS: validateTimeout(process.env.SESSION_TIMEOUT_MS || '7200000'),
};

// Initialize services
const authService = new AuthService(
    config.SKYCHAT_HOST as string,
    config.SKYCHAT_PROTOCOL as string
);
const ptyManager = new PtyManager(config);

// Create Express app
const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());
// Note: Static files are served by nginx in Docker, not by Express

// JWT authentication middleware
interface AuthenticatedRequest extends Request {
    user?: { username: string };
}

function requireJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const token = authHeader.substring(7);
    const result = authService.validateJWT(token);

    if (!result.valid) {
        res.status(401).json({ error: result.error || 'Invalid or expired token' });
        return;
    }

    req.user = { username: result.username! };
    next();
}

// API Routes
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        config: {
            skychatHost: config.SKYCHAT_HOST,
            nodeEnv: config.NODE_ENV,
        },
        stats: ptyManager.getStats(),
    });
});

// Authentication routes
app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({ error: 'Username and password required' });
            return;
        }

        console.log(`Login attempt for user: ${username}`);

        // Validate against SkyChat
        const result = await authService.validateCredentials(username, password);

        if (!result.valid) {
            console.log(`Login failed for user: ${username}`);
            res.status(401).json({ error: result.error || 'Invalid credentials' });
            return;
        }

        // Create session and JWT
        const jwt = await authService.createSession(username, result.skychatToken!);

        console.log(`Login successful for user: ${username}`);
        res.json({ jwt, username });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/logout', requireJWT, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { username } = req.user!;

        await authService.revokeSession(username);
        ptyManager.cleanupSession(username);

        console.log(`Logout successful for user: ${username}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Session management routes
app.get('/api/sessions', requireJWT, (req: AuthenticatedRequest, res: Response) => {
    try {
        const { username } = req.user!;

        const session = ptyManager.getSession(username);

        if (!session) {
            res.json([]);
            return;
        }

        res.json([
            {
                username,
                created: session.created,
                lastActivity: session.lastActivity,
                active: session.subscribers.length > 0,
            },
        ]);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/sessions/:username', requireJWT, (req: AuthenticatedRequest, res: Response) => {
    try {
        const { username: requestingUser } = req.user!;
        const { username: targetUser } = req.params;

        // Users can only delete their own sessions
        if (requestingUser !== targetUser) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        ptyManager.cleanupSession(targetUser);

        console.log(`Session terminated for user: ${targetUser}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error terminating session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Setup WebSocket server
setupTerminalWebSocket(server, authService, ptyManager);

// Cleanup intervals
const sessionCleanupInterval = setInterval(
    () => {
        ptyManager.cleanupInactiveSessions(config.SESSION_TIMEOUT_MS);
    },
    5 * 60 * 1000
); // Every 5 minutes

// Graceful shutdown
function shutdown(): void {
    console.log('Shutting down gracefully...');

    clearInterval(sessionCleanupInterval);

    ptyManager.shutdownAll();

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
server.listen(config.PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║        SkyChat XTerm Server Started            ║
╚════════════════════════════════════════════════╝

  Environment:     ${config.NODE_ENV}
  Port:            ${config.PORT}
  SkyChat Host:    ${config.SKYCHAT_PROTOCOL}://${config.SKYCHAT_HOST}

  Terminal:        http://localhost:${config.PORT}/
  Health Check:    http://localhost:${config.PORT}/api/health

  Session Timeout: ${config.SESSION_TIMEOUT_MS / 1000 / 60} minutes

Ready to accept connections!
  `);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
