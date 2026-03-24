/**
 * OtaClaw Core - Stabilized foundation modules
 *
 * This directory contains the cemented foundation of OtaClaw.
 * These modules are designed to be testable, predictable, and isolated.
 *
 * ## Modules
 * - TimerManager: Centralized timer lifecycle management
 * - AnimationController: Sprite animation state machine
 * - ConfigValidator: Runtime configuration validation
 * - StateMachine: Emotional state transitions
 *
 * ## Usage
 * ```javascript
 * import {
 *   TimerManager,
 *   AnimationController,
 *   ConfigValidator,
 *   StateMachine,
 *   validateConfig
 * } from './core/index.js';
 * ```
 */

export { TimerManager, timerManager } from './timer-manager.js';
export { AnimationController } from './animation-controller.js';
export { ConfigValidator, validateConfig } from './config-validator.js';
export { StateMachine } from './state-machine.js';
export { ThinkingParser, thinkingParser } from './thinking-parser.js';
