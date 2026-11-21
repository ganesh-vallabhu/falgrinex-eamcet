import { isRetryable } from './errors.js';

export async function withRetry(operation, { retries = 2, delay = 350, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) throw error;
      onRetry?.(attempt + 1, error);
      await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
  throw lastError;
}
