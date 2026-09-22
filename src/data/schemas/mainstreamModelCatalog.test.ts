import { describe, expect, it } from "vitest";
import assumptionsJson from "../../../public/data/assumptions.json";
import modelsJson from "../../../public/data/models.json";
import { calculateVramRequirement } from "../../calculator/vramCalculator";
import type { ModelRecord } from "../../types";
import { AssumptionsCatalogSchema, ModelsCatalogSchema } from "./catalogSchemas";

const models = ModelsCatalogSchema.parse(modelsJson).data;
const assumptions = AssumptionsCatalogSchema.parse(assumptionsJson).data[0]!;

function model(id: string): ModelRecord {
  const value = models.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing model fixture '${id}'.`);
  return value;
}

function recommendedVramGB(id: string): number {
  const selected = model(id);
  const quantization = selected.quantizations.find(
    (candidate) => candidate.id === selected.recommendedQuantizationId,
  );
  if (!quantization) throw new Error(`Missing recommended quantization for '${id}'.`);

  return calculateVramRequirement({
    model: selected,
    quantization,
    peakContextTokens: 8192,
    peakConcurrentUsers: 1,
    assumptions: assumptions.vram,
  }).recommendedVramGB;
}

describe("mainstream local model catalog", () => {
  it("covers representative current open-weight families without inventing local performance", () => {
    const expectedIds = [
      "qwen3-8b",
      "qwen3-14b",
      "qwen3.5-9b",
      "qwen3.8-27b",
      "qwen3.6-35b-a3b",
      "qwen3.6-35b-a3b-ai-fusion-2",
      "qwen3.8-flash-next",
      "ornith-1.5-35b-a3b",
      "ornith-1.5-35b-a3b-ai-fusion-2",
      "minimax-h3",
      "deepseek-v4-flash",
      "gemma-4-12b-it",
      "gemma-4-26b-a4b-it",
      "gemma-4-26b-a4b-it-ai-fusion-2",
      "gemma-4-31b-it",
      "mistral-small-3.1-24b-instruct",
      "llama-4-scout-17b-16e-instruct",
      "phi-4-14b",
      "gpt-oss-20b",
      "gpt-oss-120b",
    ];

    expect(models.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(expectedIds),
    );
    for (const id of expectedIds) {
      const candidate = model(id);
      expect(candidate.openWeight).toBe(true);
      expect(candidate.notes).toMatch(/runtime|compatib|validate/i);
      expect(candidate.notes).not.toMatch(
        /\b\d+(?:\.\d+)?\s*(?:tokens?\s*\/\s*s|t\s*\/\s*s|tps)\b/i,
      );
    }
  });

  it("plans local KV cache at Q8 rather than FP16", () => {
    expect(model("qwen3-8b").kvCacheBytesPerToken).toBe(73728);
    expect(model("qwen3-14b").kvCacheBytesPerToken).toBe(81920);
    expect(assumptions.vram.fallbackKvCacheBytesPerTokenByTier.balanced).toBe(
      98304,
    );
  });

  it("catalogues AI Fusion Turbo KV compression as K8-bit / Q3-bit on supported models", () => {
    const supported = [
      ["qwen3.6-35b-a3b", "qwen3.6-35b-a3b-ai-fusion-2"],
      ["gemma-4-26b-a4b-it", "gemma-4-26b-a4b-it-ai-fusion-2"],
      ["ornith-1.5-35b-a3b", "ornith-1.5-35b-a3b-ai-fusion-2"],
    ] as const;

    for (const [baseId, fusionId] of supported) {
      const base = model(baseId);
      const fusion = model(fusionId);
      expect(fusion.name).toMatch(/AI Fusion Turbo/);
      expect(fusion.totalParametersB).toBe(base.totalParametersB);
      expect(fusion.activeParametersB).toBe(base.activeParametersB);
      expect(fusion.kvCacheBytesPerToken).toBe(
        (base.kvCacheBytesPerToken! * 11) / 16,
      );
      expect(fusion.systemMemoryOffloadGB).toBe(5);
      expect(fusion.ssdKvCacheOffloadGB).toBe(1);
      expect(fusion.safetyMarginRatio).toBe(0.05);
      expect(fusion.notes).toMatch(/K 8-bit, Q 3-bit/i);
      expect(fusion.notes).toMatch(/AI Fusion Turbo/);
      expect(fusion.notes).toMatch(/5GB/i);
      expect(fusion.notes).toMatch(/1GB/i);
      expect(fusion.notes).toMatch(/5%/);
    }
  });

  it("keeps MoE total-weight capacity separate from active-parameter compute", () => {
    for (const id of [
      "qwen3.6-35b-a3b",
      "qwen3.6-35b-a3b-ai-fusion-2",
      "ornith-1.5-35b-a3b",
      "ornith-1.5-35b-a3b-ai-fusion-2",
      "qwen3.8-flash-next",
      "gemma-4-26b-a4b-it",
      "gemma-4-26b-a4b-it-ai-fusion-2",
      "llama-4-scout-17b-16e-instruct",
      "gpt-oss-120b",
      "deepseek-v4-flash",
    ]) {
      const candidate = model(id);
      expect(candidate.modelType).toBe("moe");
      expect(candidate.totalParametersB).toBeGreaterThan(
        candidate.activeParametersB,
      );
    }
  });

  it("spans the intended 16GB through 96GB planning envelopes at moderate context", () => {
    expect(recommendedVramGB("qwen3.5-9b")).toBeLessThan(16);
    expect(recommendedVramGB("mistral-small-3.1-24b-instruct")).toBeLessThan(24);
    expect(recommendedVramGB("qwen3.6-35b-a3b")).toBeLessThan(32);

    for (const id of [
      "llama-4-scout-17b-16e-instruct",
      "gpt-oss-120b",
    ]) {
      expect(recommendedVramGB(id)).toBeLessThan(96);
    }

    const deepseek = model("deepseek-v4-flash");
    expect(deepseek.recommendedQuantizationId).toBe("fp4-mixed");
    expect(
      calculateVramRequirement({
        model: deepseek,
        quantization: deepseek.quantizations.find(
          (candidate) => candidate.id === deepseek.recommendedQuantizationId,
        )!,
        peakContextTokens: 8192,
        peakConcurrentUsers: 1,
        assumptions: assumptions.vram,
      }).recommendedVramGB,
    ).toBeGreaterThan(96);
  });
});
