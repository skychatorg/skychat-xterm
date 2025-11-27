/**
 * Configuration validation utilities
 */

/**
 * Validates a hostname (domain or IP)
 * Prevents command injection via hostname configuration
 */
export function validateHostname(hostname: unknown): string {
    if (typeof hostname !== 'string') {
        throw new Error('Hostname must be a string');
    }

    const trimmed = hostname.trim();

    if (trimmed.length === 0) {
        throw new Error('Hostname cannot be empty');
    }

    // Max hostname length per RFC 1035
    if (trimmed.length > 253) {
        throw new Error('Hostname too long');
    }

    // Basic hostname validation - allows domain names and IPs
    // Prevents shell metacharacters and command injection
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/;

    if (!hostnameRegex.test(trimmed)) {
        throw new Error('Invalid hostname format');
    }

    // Additional security: prevent shell metacharacters
    const dangerousChars = ['$', '`', ';', '|', '&', '>', '<', '\n', '\r', '\0'];
    for (const char of dangerousChars) {
        if (trimmed.includes(char)) {
            throw new Error('Hostname contains invalid characters');
        }
    }

    return trimmed;
}

/**
 * Validates a protocol (ws or wss)
 */
export function validateProtocol(protocol: unknown): string {
    if (typeof protocol !== 'string') {
        throw new Error('Protocol must be a string');
    }

    const normalized = protocol.trim().toLowerCase();

    if (normalized !== 'ws' && normalized !== 'wss') {
        throw new Error('Protocol must be "ws" or "wss"');
    }

    return normalized;
}

/**
 * Validates a port number
 */
export function validatePort(port: unknown): number {
    const numPort = typeof port === 'string' ? parseInt(port, 10) : (port as number);

    if (!Number.isInteger(numPort) || numPort < 1 || numPort > 65535) {
        throw new Error('Port must be between 1 and 65535');
    }

    return numPort as number;
}

/**
 * Validates a timeout value in milliseconds
 */
export function validateTimeout(timeout: unknown): number {
    const numTimeout = typeof timeout === 'string' ? parseInt(timeout, 10) : (timeout as number);

    if (!Number.isInteger(numTimeout) || numTimeout < 1000 || numTimeout > 86400000) {
        throw new Error('Timeout must be between 1000ms (1s) and 86400000ms (24h)');
    }

    return numTimeout as number;
}
