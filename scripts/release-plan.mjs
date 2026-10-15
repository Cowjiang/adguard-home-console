#!/usr/bin/env node
/**
 * Shim for legacy/local references: core release planning logic has moved to
 * .github/scripts/release-plan.mjs.
 */
export * from '../.github/scripts/release-plan.mjs';
import '../.github/scripts/release-plan.mjs';
