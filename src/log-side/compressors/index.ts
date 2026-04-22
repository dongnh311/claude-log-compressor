import type { OutputKind } from "../classifier.js";
import type { Compressor } from "../../types.js";
import { genericCompressor } from "./generic.js";
import { gradleCompressor } from "./gradle.js";
import { jestCompressor } from "./jest.js";
import { junitCompressor } from "./junit.js";
import { npmCompressor } from "./npm.js";
import { pytestCompressor } from "./pytest.js";

const registry: Partial<Record<OutputKind, Compressor>> = {
  generic: genericCompressor,
  gradle: gradleCompressor,
  npm: npmCompressor,
  jest: jestCompressor,
  pytest: pytestCompressor,
  junit: junitCompressor,
};

export function pickCompressor(kind: OutputKind): Compressor {
  return registry[kind] ?? genericCompressor;
}
