/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION FRAMEWORK INDEX - KisanShakti AI Audit System
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Expert Agronomist's Deep Scientific Audit & Real-World Testing Framework
 * 12 Critical Validation Dimensions for Production Readiness
 */

// Core Types
export * from './validation-types.ts';

// Field-Validated Test Cases (50+)
export * from './field-test-cases.ts';

// 12 Dimension Validators
export * from './dimension-validators.ts';

// Validation Runner
export { ValidationRunner, runCompleteValidation, VALIDATION_RUNNER_VERSION } from './validation-runner.ts';

// Validation runner will be implemented in dimension-validators.ts
// This provides the foundation for the 12-dimension audit framework
