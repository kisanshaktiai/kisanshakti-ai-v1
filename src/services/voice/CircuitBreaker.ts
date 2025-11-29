/**
 * CircuitBreaker - Prevents cascading failures from external services
 * Implements the Circuit Breaker pattern for voice navigation API calls
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms before attempting half-open
  resetTimeout: number; // Time in ms before resetting failure count
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private config: CircuitBreakerConfig;
  private stats: Omit<CircuitBreakerStats, 'state' | 'failures' | 'successes' | 'lastFailureTime' | 'lastSuccessTime'> = {
    totalRequests: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      resetTimeout: 300000, // 5 minutes
      ...config,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        console.log('[CircuitBreaker] Attempting half-open state');
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        const error = new Error('Circuit breaker is open');
        error.name = 'CircuitBreakerError';
        throw error;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) return false;
    return Date.now() >= this.nextAttemptTime;
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.stats.totalSuccesses++;

    if (this.state === 'half-open') {
      this.successCount++;
      console.log(`[CircuitBreaker] Half-open success ${this.successCount}/${this.config.successThreshold}`);

      if (this.successCount >= this.config.successThreshold) {
        console.log('[CircuitBreaker] Closing circuit (recovered)');
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttemptTime = null;
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.stats.totalFailures++;

    console.log(`[CircuitBreaker] Failure ${this.failureCount}/${this.config.failureThreshold}`);

    if (this.state === 'half-open') {
      console.log('[CircuitBreaker] Half-open test failed, reopening circuit');
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.timeout;
      this.successCount = 0;
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      console.log('[CircuitBreaker] Opening circuit due to failures');
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get detailed statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.stats.totalRequests,
      totalFailures: this.stats.totalFailures,
      totalSuccesses: this.stats.totalSuccesses,
    };
  }

  /**
   * Check if circuit is allowing requests
   */
  isOpen(): boolean {
    return this.state === 'open' && !this.shouldAttemptReset();
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    console.log('[CircuitBreaker] Manual reset');
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = null;
  }

  /**
   * Manually open the circuit breaker (for testing or emergency)
   */
  forceOpen(): void {
    console.log('[CircuitBreaker] Forced open');
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.config.timeout;
  }
}

/**
 * Factory for creating circuit breakers for different services
 */
export class CircuitBreakerFactory {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(config));
    }
    return this.breakers.get(serviceName)!;
  }

  getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
}

// Global circuit breaker instance
export const circuitBreakerFactory = new CircuitBreakerFactory();
