import { describe, expect, it } from "vitest";
import assumptions from "../../../public/data/assumptions.json";
import cloudPricing from "../../../public/data/cloud-pricing.json";
import exchangeRates from "../../../public/data/exchange-rates.json";
import gpus from "../../../public/data/gpus.json";
import inferenceProfiles from "../../../public/data/inference-profiles.json";
import manifest from "../../../public/data/manifest.json";
import modelBenchmarks from "../../../public/data/model-benchmarks.json";
import models from "../../../public/data/models.json";
import presets from "../../../public/data/presets.json";
import systems from "../../../public/data/systems.json";
import { parseCatalogBundle } from "../../data/schemas";
import {
  calculateAnalysis,
  createDefaultAdvisorConfig,
  rankHardwareOptions,
} from "../index";

const catalogs = parseCatalogBundle({
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
});

describe("model-bound recommendation evidence", () => {
  it("prefers the exact Qwen profile hardware in the balanced default", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.hardwareSelection = { mode: "recommended", gpuCount: 1 };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("qwen3-14b");
    expect(result.selectedGpu?.id).toBe("rtx-4090-24gb");
    expect(result.config.hardwareSelection.gpuCount).toBe(1);
    expect(result.performance?.profileId).toBe("qwen3-14b-q4-4090x1");
    expect(result.performance?.effectiveTokensPerSecond).not.toBeNull();
    expect(
      result.warnings.some((warning) =>
        warning.includes("RECOMMENDED_HARDWARE_PROFILE_FALLBACK"),
      ),
    ).toBe(false);
  });

  it("prefers the lower-cost exact Llama 70B profile hardware in the advanced default", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.workload.capabilityRequirementTierId = "advanced";
    config.modelSelection = { mode: "recommended" };
    config.hardwareSelection = { mode: "recommended", gpuCount: 1 };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("llama-3.1-70b-instruct");
    expect(result.selectedGpu?.id).toBe("a100-80gb");
    expect(result.config.hardwareSelection.gpuCount).toBe(1);
    expect(result.performance?.profileId).toBe("llama31-70b-q4-a100x1");
    expect(result.performance?.effectiveTokensPerSecond).not.toBeNull();
  });

  it("preserves fit-and-price ranking with a warning when no exact profile exists", () => {
    const catalogsWithoutProfiles = {
      ...catalogs,
      inferenceProfiles: [],
    };
    const config = createDefaultAdvisorConfig(catalogsWithoutProfiles);
    config.hardwareSelection = { mode: "recommended", gpuCount: 1 };

    const result = calculateAnalysis(config, catalogsWithoutProfiles);
    const expected = rankHardwareOptions(
      catalogsWithoutProfiles.gpus,
      result.vram!,
      catalogsWithoutProfiles.assumptions,
    )[0]!;

    expect(result.selectedGpu?.id).toBe(expected.gpu.id);
    expect(result.config.hardwareSelection.gpuCount).toBe(expected.gpuCount);
    expect(result.performance?.method).toBe("unavailable");
    expect(
      result.warnings.some((warning) =>
        warning.includes("RECOMMENDED_HARDWARE_PROFILE_FALLBACK"),
      ),
    ).toBe(true);
  });

  it("does not replace explicitly selected hardware when profile evidence is absent", () => {
    const catalogsWithoutProfiles = {
      ...catalogs,
      inferenceProfiles: [],
    };
    const config = createDefaultAdvisorConfig(catalogsWithoutProfiles);
    config.hardwareSelection = {
      mode: "existing",
      gpuId: "rtx-5060-ti-16gb",
      gpuCount: 1,
    };

    const result = calculateAnalysis(config, catalogsWithoutProfiles);

    expect(result.selectedGpu?.id).toBe("rtx-5060-ti-16gb");
    expect(
      result.warnings.some((warning) =>
        warning.includes("RECOMMENDED_HARDWARE_PROFILE_FALLBACK"),
      ),
    ).toBe(false);
  });

  it("keeps an evidence-backed advanced model ahead of smaller catalog-only models", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.workload.capabilityRequirementTierId = "advanced";
    config.modelSelection = { mode: "recommended" };
    config.hardwareSelection = {
      mode: "existing",
      gpuId: "a100-80gb",
      gpuCount: 1,
    };
    config.economics.cloudPricingId = "sample-efficient-api";

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("llama-3.1-70b-instruct");
    expect(result.modelRequirement.reasonCodes).toContain(
      "MODEL_BOUND_CALCULATION_EVIDENCE",
    );
    expect(result.performance?.effectiveTokensPerSecond).not.toBeNull();
    expect(result.cloudCost?.pricing?.id).toBe("sample-advanced-api");
    expect(result.cloudCost?.pricing?.modelId).toBe(result.selectedModel?.id);
    expect(result.config.economics.cloudPricingId).toBe("sample-advanced-api");
    expect(
      result.warnings.some((warning) =>
        warning.includes("CLOUD_PRICE_MODEL_MISMATCH"),
      ),
    ).toBe(true);
    expect(
      result.warnings.some((warning) =>
        warning.includes("MODEL_BOUND_CLOUD_PRICE_FALLBACK"),
      ),
    ).toBe(true);
  });

  it("uses the strongest partial evidence with an explicit fallback warning", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.workload.capabilityRequirementTierId = "frontier";
    config.modelSelection = { mode: "recommended" };
    config.economics.cloudPricingId = "sample-frontier-api";

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("deepseek-v4-flash");
    expect(result.modelRequirement.reasonCodes).toContain(
      "PARTIAL_MODEL_EVIDENCE_FALLBACK",
    );
    expect(result.cloudCost?.pricing?.modelId).toBe("deepseek-v4-flash");
    expect(
      result.warnings.some(
        (warning) =>
          warning.includes("RECOMMENDED_MODEL_EVIDENCE_FALLBACK") &&
          warning.includes("local inference profile"),
      ),
    ).toBe(true);
  });

  it("keeps a manual model selection but refuses a price bound to another model", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.workload.capabilityRequirementTierId = "advanced";
    config.modelSelection = {
      mode: "manual",
      modelId: "qwen3.5-9b",
      quantizationId: "q4",
    };
    config.economics.cloudPricingId = "sample-efficient-api";

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("qwen3.5-9b");
    expect(result.modelRequirement.reasonCodes).toContain("MANUAL_MODEL_OVERRIDE");
    expect(result.cloudCost).toBeNull();
    expect(result.hybridCost).toBeNull();
    expect(result.config.economics.cloudPricingId).toBeUndefined();
    expect(
      result.warnings.some(
        (warning) =>
          warning.includes("CLOUD_PRICE_MODEL_MISMATCH") &&
          warning.includes("qwen3.5-9b"),
      ),
    ).toBe(true);
    expect(
      result.warnings.some((warning) =>
        warning.includes("MODEL_BOUND_CLOUD_PRICE_UNAVAILABLE"),
      ),
    ).toBe(true);
  });

  it("binds an explicit custom price to the manually selected model", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.modelSelection = {
      mode: "manual",
      modelId: "qwen3.5-9b",
      quantizationId: "q4",
    };
    config.economics.customCloudPricing = {
      inputPricePerMillionTokens: 0.2,
      outputPricePerMillionTokens: 0.8,
      cachedInputPricePerMillionTokens: 0.05,
    };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("qwen3.5-9b");
    expect(result.cloudCost?.pricing?.id).toBe("custom-pricing");
    expect(result.cloudCost?.pricing?.modelId).toBe("qwen3.5-9b");
    expect(
      result.warnings.some((warning) =>
        warning.includes("CLOUD_PRICE_MODEL_MISMATCH"),
      ),
    ).toBe(false);
  });

  it("does not treat a catalog price without a model binding as exact evidence", () => {
    const catalogsWithOnlyUnboundPricing = structuredClone(catalogs);
    const unboundPricing = {
      ...catalogsWithOnlyUnboundPricing.cloudPricing[0]!,
      id: "unbound-provider-price",
    };
    delete unboundPricing.modelId;
    catalogsWithOnlyUnboundPricing.cloudPricing = [unboundPricing];
    const config = createDefaultAdvisorConfig(catalogsWithOnlyUnboundPricing);
    config.modelSelection = {
      mode: "manual",
      modelId: "qwen3-14b",
      quantizationId: "q4",
    };
    config.economics.cloudPricingId = unboundPricing.id;

    const result = calculateAnalysis(config, catalogsWithOnlyUnboundPricing);

    expect(result.cloudCost).toBeNull();
    expect(result.config.economics.cloudPricingId).toBeUndefined();
    expect(
      result.warnings.some(
        (warning) =>
          warning.includes("CLOUD_PRICE_MODEL_MISMATCH") &&
          warning.includes("bound to no model"),
      ),
    ).toBe(true);
  });
});
