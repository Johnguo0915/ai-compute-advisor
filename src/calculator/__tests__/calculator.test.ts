import { describe, expect, it } from "vitest";
import assumptionsJson from "../../../public/data/assumptions.json";
import cloudPricingJson from "../../../public/data/cloud-pricing.json";
import gpusJson from "../../../public/data/gpus.json";
import inferenceProfilesJson from "../../../public/data/inference-profiles.json";
import manifestJson from "../../../public/data/manifest.json";
import modelBenchmarksJson from "../../../public/data/model-benchmarks.json";
import modelsJson from "../../../public/data/models.json";
import presetsJson from "../../../public/data/presets.json";
import systemsJson from "../../../public/data/systems.json";
import exchangeRatesJson from "../../../public/data/exchange-rates.json";
import { parseCatalogBundle } from "../../data/schemas";
import { findRecommendedCloudPricingId } from "../../state/defaultAdvisorConfig";
import type { ModelRecord, WorkloadConfig } from "../../types";
import {
  calculateAnalysis,
  calculateCloudCost,
  calculateHardwareFit,
  calculateHybridCost,
  calculateLocalCost,
  calculatePerformanceCapacity,
  calculateTokenDemand,
  calculateVramRequirement,
  createDefaultAdvisorConfig,
  resolveMultiGpuEfficiency,
} from "../index";

const catalogs = parseCatalogBundle({
  manifest: manifestJson,
  models: modelsJson,
  modelBenchmarks: modelBenchmarksJson,
  gpus: gpusJson,
  inferenceProfiles: inferenceProfilesJson,
  cloudPricing: cloudPricingJson,
  assumptions: assumptionsJson,
  presets: presetsJson,
  systems: systemsJson,
  exchangeRates: exchangeRatesJson,
});

const workload: WorkloadConfig = {
  mode: "advanced",
  useCase: "enterprise-agent",
  usageFrequency: "daily",
  users: 10,
  privacyRequirement: "medium",
  capabilityRequirementTierId: "balanced",
  latencyRequirement: "interactive",
  monthlyRequests: 10_000,
  averageInputTokens: 1_000,
  averageOutputTokens: 500,
  averageAgentSteps: 3,
  peakConcurrentUsers: 4,
  averageContextLength: 4_096,
  peakContextLength: 8_192,
  workingHoursPerDay: 8,
  workingDaysPerMonth: 20,
};

describe("pure calculation engine", () => {
  it("selects a capability-compatible default cloud offering", () => {
    expect(findRecommendedCloudPricingId(catalogs, "balanced")).toBe(
      "sample-efficient-api",
    );
    expect(findRecommendedCloudPricingId(catalogs, "advanced")).toBe(
      "sample-advanced-api",
    );
    expect(findRecommendedCloudPricingId(catalogs, "frontier")).toBe(
      "sample-frontier-api",
    );
  });

  it("calculates transparent agent token demand", () => {
    const result = calculateTokenDemand(workload);
    expect(result.monthlyInputTokens).toBe(30_000_000);
    expect(result.monthlyOutputTokens).toBe(15_000_000);
    expect(result.monthlyTotalTokens).toBe(45_000_000);
  });

  it("calculates model weight, KV cache, runtime, and safety margin", () => {
    const model: ModelRecord = {
      id: "test-70b",
      name: "Test 70B",
      provider: "Test",
      modelType: "dense",
      totalParametersB: 70,
      activeParametersB: 70,
      contextWindowTokens: 32_768,
      recommendedQuantizationId: "q4",
      quantizations: [
        { id: "q4", label: "4-bit", bitsPerParameter: 4, packingOverheadRatio: 0.05 },
      ],
      capabilityTierId: "advanced",
      reasoning: false,
      modalities: ["text"],
      openWeight: true,
      commercialUse: "allowed",
      kvCacheBytesPerToken: 327_680,
    };
    const result = calculateVramRequirement({
      model,
      quantization: model.quantizations[0]!,
      peakContextTokens: 8_192,
      peakConcurrentUsers: 4,
      assumptions: {
        ...catalogs.assumptions.vram,
        minimumRuntimeOverheadGB: 0,
        defaultRuntimeOverheadRatio: 0.1,
        safetyMarginRatio: 0.15,
      },
    });

    expect(result.modelWeightGB).toBeCloseTo(36.75, 8);
    expect(result.systemMemoryOffloadGB).toBe(0);
    expect(result.gpuResidentWeightGB).toBeCloseTo(36.75, 8);
    expect(result.ssdKvCacheOffloadGB).toBe(0);
    expect(result.kvCacheGB).toBeCloseTo(10.73741824, 8);
    expect(result.gpuResidentKvCacheGB).toBeCloseTo(10.73741824, 8);
    expect(result.safetyMarginRatio).toBe(0.15);
    expect(result.runtimeOverheadGB).toBeCloseTo(3.675, 8);
    expect(result.recommendedVramGB).toBeCloseTo(58.836780976, 8);
  });

  it("uses total parameters, never active parameters, for MoE weight", () => {
    const model = catalogs.models.find((candidate) => candidate.id === "mixtral-8x7b-instruct")!;
    const result = calculateVramRequirement({
      model,
      quantization: model.quantizations[0]!,
      peakContextTokens: 4_096,
      peakConcurrentUsers: 1,
      assumptions: catalogs.assumptions.vram,
    });
    const expectedWeight =
      model.totalParametersB * 0.5 * (1 + model.quantizations[0]!.packingOverheadRatio);
    expect(result.modelWeightGB).toBeCloseTo(expectedWeight);
    expect(result.modelWeightGB).toBeGreaterThan(model.activeParametersB * 0.5);
  });

  it("subtracts AI Fusion 2.0 system-memory offload from GPU-resident VRAM", () => {
    const model = catalogs.models.find(
      (candidate) => candidate.id === "qwen3.6-35b-a3b-ai-fusion-2",
    )!;
    const quantization = model.quantizations.find(
      (candidate) => candidate.id === model.recommendedQuantizationId,
    )!;
    const assumptions = {
      ...catalogs.assumptions.vram,
      minimumRuntimeOverheadGB: 0,
      defaultRuntimeOverheadRatio: 0.1,
      safetyMarginRatio: 0.15,
    };
    const withOffload = calculateVramRequirement({
      model,
      quantization,
      peakContextTokens: 8_192,
      peakConcurrentUsers: 1,
      assumptions,
    });
    const withoutOffload = calculateVramRequirement({
      model: { ...model, systemMemoryOffloadGB: undefined },
      quantization,
      peakContextTokens: 8_192,
      peakConcurrentUsers: 1,
      assumptions,
    });

    expect(model.systemMemoryOffloadGB).toBe(5);
    expect(withOffload.systemMemoryOffloadGB).toBe(5);
    expect(withOffload.gpuResidentWeightGB).toBeCloseTo(
      withoutOffload.modelWeightGB - 5,
      8,
    );
    expect(withOffload.recommendedVramGB).toBeLessThan(
      withoutOffload.recommendedVramGB,
    );
    expect(withOffload.trace.warnings.join(" ")).toMatch(/system memory/i);
  });

  it("subtracts AI Fusion 2.0 SSD KV offload and uses a 5% safety margin", () => {
    const model = catalogs.models.find(
      (candidate) => candidate.id === "qwen3.6-35b-a3b-ai-fusion-2",
    )!;
    const quantization = model.quantizations.find(
      (candidate) => candidate.id === model.recommendedQuantizationId,
    )!;
    const assumptions = {
      ...catalogs.assumptions.vram,
      minimumRuntimeOverheadGB: 0,
      defaultRuntimeOverheadRatio: 0.1,
      safetyMarginRatio: 0.15,
    };
    const peakContextTokens = 32_768;
    const peakConcurrentUsers = 1;
    const withFusion = calculateVramRequirement({
      model,
      quantization,
      peakContextTokens,
      peakConcurrentUsers,
      assumptions,
    });
    const withoutSsd = calculateVramRequirement({
      model: { ...model, ssdKvCacheOffloadGB: undefined },
      quantization,
      peakContextTokens,
      peakConcurrentUsers,
      assumptions,
    });
    const withDefaultSafety = calculateVramRequirement({
      model: { ...model, safetyMarginRatio: undefined },
      quantization,
      peakContextTokens,
      peakConcurrentUsers,
      assumptions,
    });
    const totalKvCacheGB =
      (peakContextTokens * peakConcurrentUsers * model.kvCacheBytesPerToken!) /
      1_000_000_000;

    expect(model.ssdKvCacheOffloadGB).toBe(1);
    expect(model.safetyMarginRatio).toBe(0.05);
    expect(withFusion.ssdKvCacheOffloadGB).toBe(1);
    expect(withFusion.totalKvCacheGB).toBeCloseTo(totalKvCacheGB, 8);
    expect(withFusion.kvCacheGB).toBeCloseTo(totalKvCacheGB - 1, 8);
    expect(withFusion.gpuResidentKvCacheGB).toBeCloseTo(totalKvCacheGB - 1, 8);
    expect(withFusion.safetyMarginRatio).toBe(0.05);
    expect(withFusion.safetyMarginGB).toBeCloseTo(withFusion.hardMinimumGB * 0.05, 8);
    expect(withFusion.recommendedVramGB).toBeLessThan(withoutSsd.recommendedVramGB);
    expect(withFusion.recommendedVramGB).toBeLessThan(
      withDefaultSafety.recommendedVramGB,
    );
    expect(withFusion.trace.warnings.join(" ")).toMatch(/SSD/i);
  });

  it("clamps SSD KV offload so GPU-resident KV cannot go negative", () => {
    const model = catalogs.models.find(
      (candidate) => candidate.id === "qwen3.6-35b-a3b-ai-fusion-2",
    )!;
    const quantization = model.quantizations.find(
      (candidate) => candidate.id === model.recommendedQuantizationId,
    )!;
    const result = calculateVramRequirement({
      model: { ...model, ssdKvCacheOffloadGB: 100 },
      quantization,
      peakContextTokens: 1_024,
      peakConcurrentUsers: 1,
      assumptions: catalogs.assumptions.vram,
    });
    expect(result.kvCacheGB).toBe(0);
    expect(result.ssdKvCacheOffloadGB).toBeCloseTo(result.totalKvCacheGB, 8);
  });

  it("keeps hardware fit thresholds monotonic", () => {
    const model = catalogs.models.find((candidate) => candidate.id === "llama-3.1-70b-instruct")!;
    const vram = calculateVramRequirement({
      model,
      quantization: model.quantizations[0]!,
      peakContextTokens: 8_192,
      peakConcurrentUsers: 2,
      assumptions: catalogs.assumptions.vram,
    });
    const fits = catalogs.gpus.map((gpu) =>
      calculateHardwareFit({ gpu, gpuCount: 1, vram, assumptions: catalogs.assumptions }),
    );
    const sortedByMemory = [...fits].sort((left, right) => left.availableVramGB - right.availableVramGB);
    for (let index = 1; index < sortedByMemory.length; index += 1) {
      expect(sortedByMemory[index]!.capacityRatio).toBeGreaterThanOrEqual(
        sortedByMemory[index - 1]!.capacityRatio,
      );
    }
  });

  it("keeps a physical dual-card option unpooled without tensor-parallel evidence", () => {
    const gpu = catalogs.gpus.find(
      (candidate) => candidate.id === "rtx-pro-5000-blackwell-48gb",
    )!;
    const model = catalogs.models.find(
      (candidate) => candidate.id === "qwen3-14b",
    )!;
    const vram = calculateVramRequirement({
      model,
      quantization: model.quantizations[0]!,
      peakContextTokens: 8_192,
      peakConcurrentUsers: 1,
      assumptions: catalogs.assumptions.vram,
    });

    const single = calculateHardwareFit({
      gpu,
      gpuCount: 1,
      vram,
      assumptions: catalogs.assumptions,
    });
    const physicalDual = calculateHardwareFit({
      gpu,
      gpuCount: 2,
      vram,
      assumptions: catalogs.assumptions,
    });

    expect(gpu.supportedCounts).toEqual([1, 2]);
    expect(gpu.supportsTensorParallel).toBe(false);
    expect(physicalDual.availableVramGB).toBe(gpu.vramGB);
    expect(physicalDual.availableVramGB).toBe(single.availableVramGB);
    expect(physicalDual.multiGpuPerformanceScale).toBe(1);
    expect(
      physicalDual.warnings.some((warning) =>
        warning.includes("PHYSICAL_MULTI_GPU_WITHOUT_POOLING_EVIDENCE"),
      ),
    ).toBe(true);
  });

  it("does not scale a single-card performance profile across unvalidated physical cards", () => {
    const gpu = catalogs.gpus.find(
      (candidate) => candidate.id === "rtx-5060-ti-16gb",
    )!;
    const baseProfile = catalogs.inferenceProfiles[0]!;
    const result = calculatePerformanceCapacity({
      modelId: baseProfile.modelId,
      quantizationId: baseProfile.quantizationId,
      gpu,
      gpuCount: 2,
      workload,
      tokenDemand: calculateTokenDemand(workload),
      profiles: [{ ...baseProfile, gpuId: gpu.id, gpuCount: 1 }],
      assumptions: catalogs.assumptions,
    });

    expect(result.method).toBe("unavailable");
    expect(result.effectiveTokensPerSecond).toBeNull();
    expect(result.warnings[0]).toContain("PHYSICAL_MULTI_GPU_PROFILE_UNAVAILABLE");
  });

  it("calculates cloud and hybrid boundary cases", () => {
    const demand = calculateTokenDemand(workload);
    const pricing = {
      ...catalogs.cloudPricing[0]!,
      inputPricePerMillionTokens: 2,
      outputPricePerMillionTokens: 8,
      cachedInputPricePerMillionTokens: undefined,
    };
    const cloud = calculateCloudCost(demand, pricing, 0);
    expect(cloud.monthlyCostUSD).toBe(180);

    const local = calculateLocalCost({
      gpu: catalogs.gpus[0]!,
      gpuCount: 1,
      workload,
      locallyServedTokens: demand.monthlyTotalTokens,
      utilizationRatio: 0.5,
      electricityPricePerKWh: 0.15,
      hardwareLifetimeMonths: 36,
      maintenanceCostMonthly: 50,
      assumptions: catalogs.assumptions.economics,
    });
    const zeroCoverage = calculateHybridCost({
      local,
      cloud,
      localCoverageRatio: 0,
      totalTokens: demand.monthlyTotalTokens,
    });
    const fullCoverage = calculateHybridCost({
      local,
      cloud,
      localCoverageRatio: 1,
      totalTokens: demand.monthlyTotalTokens,
    });
    expect(zeroCoverage.monthlyCostUSD).toBeCloseTo(cloud.monthlyCostUSD);
    expect(fullCoverage.monthlyCostUSD).toBeCloseTo(local.monthlyTcoUSD);
  });

  it("runs the public analysis entry point end-to-end", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    const result = calculateAnalysis(config, catalogs);
    expect(result.status).toBe("complete");
    expect(result.selectedModel).not.toBeNull();
    expect(result.hardwareFit).not.toBeNull();
    expect(result.cloudCost).not.toBeNull();
    expect(result.comparisons).toHaveLength(3);
    expect(result.opportunityMap.cells).toHaveLength(20);
    expect(result.traces.length).toBeGreaterThanOrEqual(8);
    expect(result.traces.some((item) => item.id === "recommendation-rules")).toBe(true);
  });

  it("selects the highest runnable catalog model in configuration-first mode", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.analysisMode = "configuration-first";
    config.hardwareSelection = {
      mode: "existing",
      gpuId: "rtx-4090-24gb",
      gpuCount: 1,
    };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("qwen3-14b");
    expect(result.modelRequirement.reasonCodes).toContain(
      "CONFIGURATION_FIRST_SELECTION",
    );
    expect(result.warnings.some((warning) => warning.includes("CONFIGURATION_FIRST_SELECTION"))).toBe(true);
  });

  it("keeps a manual model override ahead of configuration-first selection", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.analysisMode = "configuration-first";
    config.modelSelection = {
      mode: "manual",
      modelId: "llama-3.2-3b-instruct",
      quantizationId: "q4",
    };
    config.hardwareSelection = {
      mode: "existing",
      gpuId: "rtx-4090-24gb",
      gpuCount: 1,
    };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedModel?.id).toBe("llama-3.2-3b-instruct");
    expect(result.modelRequirement.reasonCodes).toContain("MANUAL_MODEL_OVERRIDE");
  });

  it("uses data-pack capability tiers without a four-tier code change", () => {
    const extendedCatalogs = structuredClone(catalogs);
    extendedCatalogs.assumptions.capabilityTiers.push({
      id: "expert",
      labels: { en: "Expert", "zh-CN": "专家" },
      rank: 4,
    });
    extendedCatalogs.assumptions.vram.fallbackKvCacheBytesPerTokenByTier.expert = 400_000;
    extendedCatalogs.assumptions.simpleModeMappings.intelligence.expert = {
      startingClass: "expert",
    };
    const qwen = extendedCatalogs.models.find(
      (candidate) => candidate.id === "qwen3-14b",
    )!;
    qwen.capabilityTierId = "expert";

    const config = createDefaultAdvisorConfig(extendedCatalogs);
    config.analysisMode = "configuration-first";
    config.hardwareSelection = {
      mode: "existing",
      gpuId: "rtx-4090-24gb",
      gpuCount: 1,
    };
    const result = calculateAnalysis(config, extendedCatalogs);

    expect(result.selectedModel?.capabilityTierId).toBe("expert");
    expect(result.comparisons.find((item) => item.deployment === "cloud")?.intelligenceCeiling).toBe("expert");
    expect(result.opportunityMap.cells).toHaveLength(25);
    expect(new Set(result.opportunityMap.cells.map((cell) => cell.intelligenceClass))).toContain("expert");
  });

  it("uses a transparent conservative fallback for an unconfigured GPU count", () => {
    const resolution = resolveMultiGpuEfficiency(
      catalogs.assumptions,
      "pcie",
      3,
    );
    expect(resolution.method).toBe("conservative-fallback");
    expect(resolution.efficiency).toBeCloseTo(1 / 3);
    expect(resolution.aggregateScale).toBe(1);
    expect(resolution.warning).toContain("MULTI_GPU_EFFICIENCY_MISSING");

    const profile = catalogs.inferenceProfiles.find(
      (candidate) => candidate.id === "qwen3-14b-q4-4090x1",
    )!;
    const demand = calculateTokenDemand(workload);
    const performance = calculatePerformanceCapacity({
      modelId: profile.modelId,
      quantizationId: profile.quantizationId,
      gpu: { ...catalogs.gpus[0]!, supportedCounts: [1, 3] },
      gpuCount: 3,
      workload,
      tokenDemand: demand,
      profiles: [profile],
      assumptions: catalogs.assumptions,
    });
    expect(performance.effectiveTokensPerSecond).toBe(profile.effectiveTokensPerSecond);
    expect(performance.warnings.some((warning) => warning.includes("MULTI_GPU_EFFICIENCY_MISSING"))).toBe(true);
    expect(() => resolveMultiGpuEfficiency(catalogs.assumptions, "pcie", 0)).toThrow(
      RangeError,
    );
  });

  it("does not recommend an oversubscribed local performance profile", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.workload = {
      ...workload,
      privacyRequirement: "medium",
      capabilityRequirementTierId: "balanced",
      monthlyRequests: 1_000,
      averageInputTokens: 1_000,
      averageOutputTokens: 500,
      averageAgentSteps: 1,
      peakConcurrentUsers: 2,
      averageContextLength: 8_192,
      peakContextLength: 8_192,
      workingHoursPerDay: 1,
      workingDaysPerMonth: 1,
    };
    config.modelSelection = {
      mode: "manual",
      modelId: "qwen3-14b",
      quantizationId: "q4",
    };
    config.hardwareSelection = {
      mode: "existing",
      gpuId: "rtx-4090-24gb",
      gpuCount: 1,
    };
    config.economics.cloudPricingId = "sample-efficient-api";

    const result = calculateAnalysis(config, catalogs);

    expect(result.hardwareFit?.status).not.toBe("cannot-run");
    expect(result.performance?.workloadComputeUtilizationRatio).toBeGreaterThan(1);
    expect(result.recommendation.deployment).toBe("cloud");
    expect(result.recommendation.reasonCodes).toContain(
      "LOCAL_PERFORMANCE_INSUFFICIENT",
    );
    expect(
      result.comparisons.find((item) => item.deployment === "local")?.feasible,
    ).toBe(false);
  });

  it("treats a catalog desktop as one complete system for memory, price and power", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    const system = catalogs.systems.find(
      (item) => item.id === "directional-discrete-ddr5-workstation",
    )!;
    config.hardwareSelection = {
      mode: "system",
      gpuCount: 1,
      systemInputMode: "catalog",
      systemId: system.id,
    };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedSystem?.physicalAcceleratorCount).toBe(2);
    expect(result.selectedSystem?.totalAvailableMemoryGB).toBe(96);
    expect(result.localCost?.hardwarePurchasePriceUSD).toBe(
      system.purchasePriceUSD,
    );
    expect(result.localCost?.averageSystemPowerWatts).toBeGreaterThanOrEqual(
      system.systemIdleWatts!,
    );
    expect(result.localCost?.averageSystemPowerWatts).toBeLessThanOrEqual(
      system.systemLoadWatts!,
    );
  });

  it("keeps fit available but withholds economics when system evidence is missing", () => {
    const system = catalogs.systems.find(
      (item) => item.id === "directional-discrete-ddr5-workstation",
    )!;
    const catalogsWithoutSystemEconomics = {
      ...catalogs,
      systems: catalogs.systems.map((item) =>
        item.id === system.id
          ? {
              ...item,
              systemIdleWatts: null,
              systemLoadWatts: item.systemLoadWatts,
              purchasePriceUSD: null,
            }
          : item,
      ),
    };
    const config = createDefaultAdvisorConfig(catalogsWithoutSystemEconomics);
    config.hardwareSelection = {
      mode: "system",
      gpuCount: 1,
      systemInputMode: "catalog",
      systemId: system.id,
    };

    const result = calculateAnalysis(config, catalogsWithoutSystemEconomics);

    expect(result.selectedSystem?.economicsEvidenceAvailable).toBe(false);
    expect(result.selectedGpu?.tdpWatts).toBe(system.systemLoadWatts);
    expect(result.selectedGpu?.streetPriceUSD).toBeNull();
    expect(result.hardwareFit).not.toBeNull();
    expect(result.localCost).toBeNull();
    expect(result.hybridCost).toBeNull();
    expect(result.breakEven).toBeNull();
    expect(result.cloudCost).not.toBeNull();
    expect(result.status).toBe("incomplete");
    expect(
      result.warnings.some(
        (warning) =>
          warning.includes("Local economics are unavailable") &&
          warning.includes("break-even"),
      ),
    ).toBe(true);
  });

  it("never derives LLM TPS from a custom NPU TOPS specification", () => {
    const config = createDefaultAdvisorConfig(catalogs);
    config.hardwareSelection = {
      mode: "system",
      gpuCount: 1,
      systemInputMode: "custom",
      customSystem: {
        name: "Custom NPU desktop",
        memoryArchitecture: "unified",
        systemMemoryType: "DDR5",
        systemRamGB: 64,
        acceleratorType: "Demo NPU engine",
        acceleratorBehaviorCategory: "npu",
        acceleratorName: "50 TOPS NPU",
        acceleratorCount: 1,
        supportsModelSharding: false,
        dedicatedMemoryPerUnitGB: null,
        allocatableUnifiedMemoryGB: 48,
        memoryBandwidthGBps: 120,
        idlePowerWatts: 35,
        loadPowerWatts: 180,
        purchasePriceUSD: 1800,
        tops: 50,
        topsPrecision: "INT8",
        effectiveTokensPerSecond: null,
        timeToFirstTokenSeconds: null,
        runtimeSupportStatus: "experimental",
        runtimeSupportMethod: "vendor-documented",
        runtimeNames: "ONNX Runtime",
        performanceModelId: null,
        performanceQuantizationId: null,
        performanceContextTokens: null,
        performanceConcurrency: null,
      },
    };

    const result = calculateAnalysis(config, catalogs);

    expect(result.selectedSystem?.peakTops?.value).toBe(50);
    expect(result.selectedSystem?.peakTops?.precision).toBe("INT8");
    expect(result.selectedSystem?.acceleratorType).toBe("Demo NPU engine");
    expect(result.selectedSystem?.acceleratorBehaviorCategory).toBe("npu");
    expect(result.performance?.method).toBe("unavailable");
    expect(result.performance?.effectiveTokensPerSecond).toBeNull();
    expect(result.warnings.some((warning) => warning.includes("never converted"))).toBe(true);
  });
});
