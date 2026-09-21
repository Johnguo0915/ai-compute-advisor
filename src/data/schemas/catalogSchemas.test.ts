import { describe, expect, it } from "vitest";
import assumptions from "../../../public/data/assumptions.json";
import cloudPricing from "../../../public/data/cloud-pricing.json";
import gpus from "../../../public/data/gpus.json";
import inferenceProfiles from "../../../public/data/inference-profiles.json";
import manifest from "../../../public/data/manifest.json";
import modelBenchmarks from "../../../public/data/model-benchmarks.json";
import models from "../../../public/data/models.json";
import presets from "../../../public/data/presets.json";
import systems from "../../../public/data/systems.json";
import exchangeRates from "../../../public/data/exchange-rates.json";
import {
  CatalogIntegrityError,
  GpuRecordSchema,
  ModelRecordSchema,
  PresetRecordSchema,
  parseCatalogBundle,
} from "./catalogSchemas";
import { validateCatalogRelationships } from "../validators";

const rawBundle = {
  manifest,
  models,
  modelBenchmarks,
  gpus,
  inferenceProfiles,
  cloudPricing,
  assumptions,
  presets,
  systems,
  exchangeRates,
};

describe("catalog schemas", () => {
  it("validates and normalizes every bundled catalog", () => {
    const parsed = parseCatalogBundle(rawBundle);
    expect(parsed.dataVersion).toBe("2026.09-sample.13");
    expect(parsed.models.length).toBeGreaterThanOrEqual(5);
    expect(parsed.gpus.length).toBeGreaterThanOrEqual(4);
    expect(parsed.systems.length).toBeGreaterThanOrEqual(4);
    expect(parsed.exchangeRates.base).toBe("USD");
    expect(parsed.assumptions.currency).toBe("USD");
    expect(parsed.metadata.cloudPricing.lastUpdated).toBe("2026-09-20");
  });

  it("rejects broken cross-catalog references", () => {
    const broken = structuredClone(rawBundle);
    broken.inferenceProfiles.data[0]!.modelId = "missing-model";
    expect(() => parseCatalogBundle(broken)).toThrow(CatalogIntegrityError);
  });

  it("rejects unknown data-pack capability tier references", () => {
    const broken = structuredClone(rawBundle);
    broken.models.data[0]!.capabilityTierId = "not-configured";
    expect(() => parseCatalogBundle(broken)).toThrow(CatalogIntegrityError);
  });

  it("rejects broken complete-system performance bindings", () => {
    const missingModel = structuredClone(rawBundle);
    missingModel.systems.data[0]!.performance!.modelId = "missing-model";
    expect(() => parseCatalogBundle(missingModel)).toThrow(CatalogIntegrityError);

    const missingQuantization = structuredClone(rawBundle);
    missingQuantization.systems.data[0]!.performance!.quantizationId =
      "missing-quantization";
    expect(() => parseCatalogBundle(missingQuantization)).toThrow(
      CatalogIntegrityError,
    );
  });

  it("uses total and active parameters independently for MoE records", () => {
    const parsed = parseCatalogBundle(rawBundle);
    const model = parsed.models.find((candidate) => candidate.modelType === "moe");
    expect(model).toBeDefined();
    expect(model!.totalParametersB).toBeGreaterThan(model!.activeParametersB);
  });

  it("accepts a dynamic positive GPU count", () => {
    const parsed = GpuRecordSchema.parse({
      ...gpus.data[0],
      supportedCounts: [1, 3, 8],
    });
    expect(parsed.supportedCounts).toEqual([1, 3, 8]);
    expect(() =>
      GpuRecordSchema.parse({ ...gpus.data[0], supportedCounts: [0] }),
    ).toThrow();
  });

  it("keeps GPU AI TOPS and evidence optional but validates them when present", () => {
    const legacy = GpuRecordSchema.parse(gpus.data[0]);
    expect(legacy.peakAiTops).toBeUndefined();
    expect(legacy.evidence).toBeUndefined();

    const evidenced = GpuRecordSchema.parse(
      gpus.data.find((gpu) => gpu.id === "rtx-5090-32gb"),
    );
    expect(evidenced.peakAiTops).toMatchObject({
      value: 3352,
      precision: expect.stringContaining("FP4"),
    });
    expect(evidenced.evidence?.[0]?.url).toMatch(/^https:\/\/www\.nvidia\.com/);

    expect(() =>
      GpuRecordSchema.parse({
        ...evidenced,
        evidence: [{ ...evidenced.evidence![0], observedAt: "not-a-date" }],
      }),
    ).toThrow();
    expect(() =>
      GpuRecordSchema.parse({ ...evidenced, evidence: undefined }),
    ).toThrow(/Peak AI TOPS requires/);
    expect(() =>
      GpuRecordSchema.parse({
        ...evidenced,
        evidence: [{ ...evidenced.evidence![0], url: "javascript:alert(1)" }],
      }),
    ).toThrow(/HTTP or HTTPS/);
  });

  it("accepts a physical multi-GPU option without treating it as pooled memory", () => {
    const parsed = parseCatalogBundle(rawBundle);
    const issues = validateCatalogRelationships(parsed).filter(
      (issue) => issue.code === "PHYSICAL_MULTI_GPU_WITHOUT_POOLING_EVIDENCE",
    );

    expect(issues.map((issue) => issue.path)).toEqual([
      "rtx-pro-5000-blackwell-48gb.supportedCounts",
      "rtx-pro-5000-blackwell-72gb.supportedCounts",
      "rtx-5060-ti-16gb.supportedCounts",
    ]);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
  });

  it("migrates legacy model and preset fields to canonical capability/localized fields", () => {
    const canonicalModel = models.data[0]!;
    const { capabilityTierId, ...legacyModel } = canonicalModel;
    const parsedModel = ModelRecordSchema.parse({
      ...legacyModel,
      intelligenceClass: capabilityTierId,
    });
    expect(parsedModel.capabilityTierId).toBe(capabilityTierId);
    expect("intelligenceClass" in parsedModel).toBe(false);

    const canonicalPreset = presets.data[0]!;
    const parsedPreset = PresetRecordSchema.parse({
      ...canonicalPreset,
      name: "Legacy preset",
      description: "Legacy description",
      workload: {
        ...canonicalPreset.workload,
        capabilityRequirementTierId: undefined,
        intelligenceRequirement: "balanced",
      },
    });
    expect(parsedPreset.name).toEqual({ en: "Legacy preset", "zh-CN": "Legacy preset" });
    expect(parsedPreset.workload.capabilityRequirementTierId).toBe("balanced");
  });
});
