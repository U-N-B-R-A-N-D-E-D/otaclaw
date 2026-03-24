/**
 * TimerManager - Centralized timer management for OtaClaw
 *
 * Prevents memory leaks and race conditions by tracking all timers
 * and providing reliable cleanup. Replaces scattered setTimeout/clearTimeout
 * calls throughout the codebase.
 *
 * ## Usage
 * ```javascript
 * const timers = new TimerManager();
 *
 * // Single timer
 * timers.setTimeout('idle', () => doSomething(), 1000);
 *
 * // Repeating timer
 * timers.setInterval('heartbeat', () => ping(), 30000);
 *
 * // Cleanup specific timer
 * timers.clear('idle');
 *
 * // Cleanup all timers (on disconnect/shutdown)
 * timers.clearAll();
 * ```
 */

export class TimerManager {
  constructor() {
    this._timers = new Map();
    this._metadata = new WeakMap();
  }

  /**
   * Set a named timeout timer
   * @param {string} name - Unique identifier for this timer
   * @param {Function} callback - Function to execute
   * @param {number} delay - Milliseconds to wait
   * @returns {number} Timer handle (for advanced use)
   */
  setTimeout(name, callback, delay) {
    this.clear(name);

    const handle = setTimeout(() => {
      this._timers.delete(name);
      try {
        callback();
      } catch (error) {
        console.error(`[TimerManager] Error in timeout "${name}":`, error);
      }
    }, delay);

    this._timers.set(name, { type: 'timeout', handle });
    return handle;
  }

  /**
   * Set a named interval timer
   * @param {string} name - Unique identifier for this timer
   * @param {Function} callback - Function to execute
   * @param {number} interval - Milliseconds between executions
   * @returns {number} Timer handle (for advanced use)
   */
  setInterval(name, callback, interval) {
    this.clear(name);

    const handle = setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error(`[TimerManager] Error in interval "${name}":`, error);
      }
    }, interval);

    this._timers.set(name, { type: 'interval', handle });
    return handle;
  }

  /**
   * Set a timer that can be refreshed (reset) without clearing first
   * Useful for debounce-like behavior
   * @param {string} name - Unique identifier
   * @param {Function} callback - Function to execute
   * @param {number} delay - Milliseconds to wait
   * @returns {number} Timer handle
   */
  debounce(name, callback, delay) {
    return this.setTimeout(name, callback, delay);
  }

  /**
   * Clear a specific timer by name
   * @param {string} name - Timer identifier
   * @returns {boolean} True if timer existed and was cleared
   */
  clear(name) {
    const timer = this._timers.get(name);
    if (!timer) return false;

    if (timer.type === 'timeout') {
      clearTimeout(timer.handle);
    } else if (timer.type === 'interval') {
      clearInterval(timer.handle);
    }

    this._timers.delete(name);
    return true;
  }

  /**
   * Clear all tracked timers
   * @returns {number} Count of timers cleared
   */
  clearAll() {
    let count = 0;
    for (const [_name, timer] of this._timers) {
      if (timer.type === 'timeout') {
        clearTimeout(timer.handle);
      } else if (timer.type === 'interval') {
        clearInterval(timer.handle);
      }
      count++;
    }
    this._timers.clear();
    return count;
  }

  /**
   * Check if a timer exists
   * @param {string} name - Timer identifier
   * @returns {boolean}
   */
  has(name) {
    return this._timers.has(name);
  }

  /**
   * Get count of active timers
   * @returns {number}
   */
  get count() {
    return this._timers.size;
  }

  /**
   * Get list of active timer names (for debugging)
   * @returns {string[]}
   */
  get activeNames() {
    return Array.from(this._timers.keys());
  }

  /**
   * Pause all intervals (for background tabs, etc)
   * Note: Timeouts continue running - they were already scheduled
   */
  pauseIntervals() {
    for (const [name, timer] of this._timers) {
      if (timer.type === 'interval') {
        clearInterval(timer.handle);
        timer.paused = true;
      }
    }
  }

  /**
   * Resume paused intervals
   * Note: This re-creates intervals - some ticks may be lost
   */
  resumeIntervals(callbackMap) {
    for (const [name, timer] of this._timers) {
      if (timer.type === 'interval' && timer.paused && callbackMap[name]) {
        timer.handle = setInterval(callbackMap[name], timer.interval);
        timer.paused = false;
      }
    }
  }

  /**
   * Destroy timer manager and clean up all resources
   * Prevents memory leaks when disposing
   */
  destroy() {
    this.clearAll();
    // Release Map to free memory
    this._timers = null;
  }
}

/**
 * Create a singleton timer manager for app-wide use
 */
export const timerManager = new TimerManager();

export default TimerManager;
