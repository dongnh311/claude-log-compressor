import type { OutputKind } from "../classifier.js";
import type { Compressor } from "../types.js";
import { genericCompressor } from "./generic.js";
import { gradleCompressor } from "./gradle.js";

// MVP: npm/jest/pytest/junit land in M4. Unhandled kinds fall back to generic.
const registry: Partial<Record<OutputKind, Compressor>> = {
  generic: genericCompressor,
  gradle: gradleCompressor,
};

export function pickCompressor(kind: OutputKind): Compressor {
  return registry[kind] ?? genericCompressor;
}
