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
import { createDefaultCustomSystemDraft } from "../../state/customSystemDraft";
import type { AdvisorConfig, CustomDesktopSystemDraft } from "../../types";
import { calculateAnalysis, createDefaultAdvisorConfig } from "../index";

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

function customSystemConfig(
  runtimeSupportStatus: CustomDesktopSystemDraft["runtimeSupportStatus"] = "supported",
): AdvisorConfig {
  const config = createDefaultAdvisorConfig(catalogs);
  config.workload = {
    ...config.workload,
    mode: "advanced",
    privacyRequirement: "critical",
    capabilityRequirementTierId: "balanced",
  };
  config.modelSelection = {
    mode: "manual",
    modelId: "qwen3-14b",
    quantizationId: "q4",
  };
  const draft: CustomDesktopSystemDraft = {
    ...createDefaultCustomSystemDraft(),
    memoryArchitecture: "unified",
    systemMemoryType: "Unified",
    systemRamGB: 64,
    acceleratorType: "Vendor Matrix Engine X",
    acceleratorBehaviorCategory: "gpu",
    acceleratorName: "Test unified accelerator",
    acceleratorCount: 1,
    supportsModelSharding: false,
    dedicatedMemoryPerUnitGB: null,
    allocatableUnifiedMemoryGB: 56,
    runtimeSupportStatus,
    runtimeSupportMethod: "measured",
    runtimeNames: "Test runtime",
    effectiveTokensPerSecond: 100,
    timeToFirstTokenSeconds: 0.2,
    performanceModelId: "qwen3-14b",
    performanceQuantizationId: "q4",
    performanceContextTokens: config.workload.averageContextLength,
    performanceConcurrency: config.workload.peakConcurrentUsers,
  };
  config.hardwareSelection = {
    mode: "system",
    gpuCount: 1,
    systemInputMode: "custom",
    customSystem: draft,
  };
  return config;
}

describe("desktop-system recommendation guards", () => {
  it("does not bind configuration-first selection to an unsupported runtime", () => {
    const config = customSystemConfig("experimental");
    config.analysisMode = "configuration-first";
    config.modelSelection = { mode: "recommended" };
    config.workload.privacyRequirement = "medium";

    const result = calculateAnalysis(config, catalogs);

    expect(result.modelRequirement.reasonCodes).not.toContain(
      "CONFIGURATION_FIRST_SELECTION",
    );
    expect(
      result.warnings.some((warning) =>
        warning.includes("CONFIGURATION_FIRST_NO_RUNNABLE_MODEL"),
      ),
    ).toBe(true);
  });

  it("uses an exact supported system observation for configuration-first selection", () => {
    const config = customSystemConfig("supported");
    config.analysisMode = "configuration-first";
    config.modelSelection = { mode: "recommended" };
    config.workload.privacyRequirement = "medium";

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("qwen3-14b");
    expect(result.modelRequirement.reasonCodes).toContain(
      "CONFIGURATION_FIRST_SELECTION",
    );
    expect(result.performance?.effectiveTokensPerSecond).toBe(100);
  });


  it("prevents Local when complete-system runtime support is not confirmed", () => {
    const config = customSystemConfig("experimental");
    const result = calculateAnalysis(config, catalogs);

    expect(result.hardwareFit?.status).not.toBe("cannot-run");
    expect(result.performance?.effectiveTokensPerSecond).toBe(100);
    expect(result.recommendation.deployment).not.toBe("local");
    expect(result.recommendation.status).toBe("constraint-conflict");
    expect(result.recommendation.reasonCodes).toContain("LOCAL_RUNTIME_UNVERIFIED");
    expect(
      result.comparisons.find((comparison) => comparison.deployment === "local")?.feasible,
    ).toBe(false);
  });

  it("uses an exact custom TPS binding, then invalidates it when the scenario changes", () => {
    const config = customSystemConfig("supported");
    config.workload.privacyRequirement = "medium";

    const exact = calculateAnalysis(config, catalogs);
    expect(exact.performance?.effectiveTokensPerSecond).toBe(100);
    expect(exact.performance?.method).toBe("estimated");

    const changed: AdvisorConfig = structuredClone(config);
    changed.workload.averageContextLength *= 2;
    const mismatched = calculateAnalysis(changed, catalogs);

    expect(mismatched.performance?.method).toBe("unavailable");
    expect(mismatched.performance?.effectiveTokensPerSecond).toBeNull();
    expect(
      mismatched.warnings.some((warning) =>
        warning.includes("does not match the active model, quantization, context and concurrency"),
      ),
    ).toBe(true);
  });
});
