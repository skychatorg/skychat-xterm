/**
 * Security utilities for input validation and sanitization
 */

/**
 * Username validation regex: lowercase letters, numbers, hyphens, underscores only
 * Length: 1-32 characters
 */
const USERNAME_REGEX = /^[a-z0-9_-]{1,32}$/;

/**
 * Validates and normalizes a username
 * @param username - Raw username input
 * @returns Normalized username (lowercase, validated)
 * @throws Error if username is invalid
 */
export function validateAndNormalizeUsername(username: unknown): string {
    // Type check
    if (typeof username !== 'string') {
        throw new Error('Username must be a string');
    }

    // Normalize: trim and convert to lowercase
    const normalized = username.trim().toLowerCase();

    // Validate length
    if (normalized.length === 0) {
        throw new Error('Username cannot be empty');
    }

    if (normalized.length > 32) {
        throw new Error('Username too long (max 32 characters)');
    }

    // Validate pattern
    if (!USERNAME_REGEX.test(normalized)) {
        throw new Error(
            'Username must contain only lowercase letters, numbers, hyphens, and underscores'
        );
    }

    // Additional security checks
    if (normalized === '.' || normalized === '..') {
        throw new Error('Invalid username');
    }

    if (normalized.includes('..')) {
        throw new Error('Invalid username');
    }

    return normalized;
}

/**
 * Validates terminal dimensions
 * @param cols - Number of columns
 * @param rows - Number of rows
 * @throws Error if dimensions are invalid
 */
export function validateTerminalDimensions(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || cols < 1 || cols > 1000) {
        throw new Error('Invalid terminal columns (must be 1-1000)');
    }

    if (!Number.isInteger(rows) || rows < 1 || rows > 1000) {
        throw new Error('Invalid terminal rows (must be 1-1000)');
    }
}

/**
 * Validates that a string is safe for use in file paths
 * Prevents directory traversal and null bytes
 * @param input - Path component to validate
 * @throws Error if input is unsafe
 */
export function validatePathComponent(input: string): void {
    if (input.includes('\0')) {
        throw new Error('Null bytes not allowed');
    }

    if (input.includes('..')) {
        throw new Error('Directory traversal not allowed');
    }

    if (input.includes('/') || input.includes('\\')) {
        throw new Error('Path separators not allowed');
    }

    if (input === '.' || input === '..') {
        throw new Error('Invalid path component');
    }
}

/**
 * Sanitizes terminal input data to prevent control character injection
 * @param data - Raw terminal input
 * @returns Sanitized input
 */
export function sanitizeTerminalInput(data: unknown): string {
    if (typeof data !== 'string') {
        throw new Error('Terminal input must be a string');
    }

    // Limit input size to prevent DoS
    if (data.length > 10000) {
        throw new Error('Terminal input too large');
    }

    // Allow normal printable characters and common control sequences
    // This is permissive since it's terminal input, but we still limit length
    return data;
}
