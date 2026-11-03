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
 * - ThinkingParser: Streaming reasoning trace parser
 * - OtaclawMonitor: Optional logging / metrics / remote export
 */

export { TimerManager, timerManager } from './timer-manager.js';
export { AnimationController } from './animation-controller.js';
export { ConfigValidator, validateConfig, normalizeGatewayConfig } from './config-validator.js';
export { ThinkingParser, thinkingParser } from './thinking-parser.js';
export { OtaclawMonitor, otaclawMonitor } from './monitor.js';
export { CharacterExpressionEngine, characterExpression } from './character-expression.js';
export * from './state-sprite-map.js';
