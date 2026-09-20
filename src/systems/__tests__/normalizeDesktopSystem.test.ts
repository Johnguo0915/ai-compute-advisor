import { describe, expect, it } from "vitest";
import systemsJson from "../../../public/data/systems.json";
import {
  CustomDesktopSystemConfigSchema,
  DesktopSystemRecordSchema,
  normalizeDesktopSystem,
  parseDesktopSystemsCatalog,
  type CustomDesktopSystemConfig,
} from "../index";

describe("desktop system catalog", () => {
  it("parses the bundled directional system catalog", () => {
    const catalog = parseDesktopSystemsCatalog(systemsJson);
    expect(catalog.data.length).toBeGreaterThanOrEqual(4);
    expect(catalog.data.every((system) => system.dataQuality === "directional")).toBe(true);
    expect(catalog.data.some((system) => system.acceleratorType === "GPU")).toBe(true);
    expect(catalog.data.some((system) => system.acceleratorType === "AI accelerator")).toBe(true);
    expect(catalog.data.some((system) => system.acceleratorType === "NPU")).toBe(true);
  });

  it("rejects incompatible memory fields and invalid whole-system power", () => {
    const dedicated = parseDesktopSystemsCatalog(systemsJson).data[0]!;
    expect(
      DesktopSystemRecordSchema.safeParse({
        ...dedicated,
        allocatableUnifiedMemoryGB: 64,
      }).success,
    ).toBe(false);
    expect(
      DesktopSystemRecordSchema.safeParse({
        ...dedicated,
        systemIdleWatts: dedicated.systemLoadWatts! + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts unavailable catalog economics but keeps custom economics required", () => {
    const base = parseDesktopSystemsCatalog(systemsJson).data[0]!;
    const unavailable = {
      ...base,
      systemIdleWatts: null,
      systemLoadWatts: null,
      purchasePriceUSD: null,
    };

    expect(DesktopSystemRecordSchema.safeParse(unavailable).success).toBe(true);

    const {
      dataQuality: _dataQuality,
      lastUpdated: _lastUpdated,
      source: _source,
      ...customShape
    } = unavailable;
    expect(CustomDesktopSystemConfigSchema.safeParse(customShape).success).toBe(false);
  });
});

describe("normalizeDesktopSystem", () => {
  const catalog = parseDesktopSystemsCatalog(systemsJson);

  it("adds dedicated memory across physical accelerators once", () => {
    const system = catalog.data.find(
      (candidate) => candidate.id === "directional-discrete-ddr5-workstation",
    )!;
    const normalized = normalizeDesktopSystem(system);

    expect(normalized.totalAvailableMemoryGB).toBe(96);
    expect(normalized.physicalAcceleratorCount).toBe(2);
    expect(normalized.engineGpu.vramGB).toBe(96);
    expect(normalized.engineGpuCount).toBe(1);
    expect(normalized.completeSystem).toBe(true);
    expect(normalized.engineGpu.streetPriceUSD).toBe(system.purchasePriceUSD);
  });

  it("uses allocatable unified memory instead of installed system memory", () => {
    const system = catalog.data.find(
      (candidate) => candidate.id === "directional-unified-memory-desktop",
    )!;
    const normalized = normalizeDesktopSystem(system);

    expect(system.memoryArchitecture).toBe("unified");
    expect(normalized.totalAvailableMemoryGB).toBe(160);
    expect(normalized.totalAvailableMemoryGB).toBeLessThan(system.systemMemoryGB);
    expect(normalized.engineGpu.interconnect).toBe("unified");
  });

  it("encodes exact whole-system idle/load power for the existing cost formula", () => {
    const system = catalog.data[0]!;
    const normalized = normalizeDesktopSystem(system);
    const overrides = normalized.engineEconomicsOverrides;
    if (
      normalized.engineGpu.tdpWatts === null ||
      overrides === null ||
      system.systemIdleWatts === null ||
      system.systemLoadWatts === null
    ) {
      throw new Error("Fixture must contain complete whole-system economics");
    }
    const utilization = 0.4;
    const reconstructedPower =
      normalized.engineGpu.tdpWatts *
      (overrides.gpuIdlePowerRatio +
        (1 - overrides.gpuIdlePowerRatio) * utilization);
    const expectedPower =
      system.systemIdleWatts + (system.systemLoadWatts - system.systemIdleWatts) * utilization;

    expect(overrides.hostPurchasePriceUSD).toBe(0);
    expect(reconstructedPower).toBeCloseTo(expectedPower, 10);
  });

  it("preserves partial economics evidence without treating it as complete", () => {
    const system = {
      ...catalog.data[0]!,
      systemIdleWatts: null,
      systemLoadWatts: 1_275,
      purchasePriceUSD: null,
    };
    const normalized = normalizeDesktopSystem(system);

    expect(normalized.economicsEvidenceAvailable).toBe(false);
    expect(normalized.wholeSystemIdleWatts).toBeNull();
    expect(normalized.wholeSystemLoadWatts).toBe(1_275);
    expect(normalized.wholeSystemPurchasePriceUSD).toBeNull();
    expect(normalized.engineGpu.tdpWatts).toBe(1_275);
    expect(normalized.engineGpu.streetPriceUSD).toBeNull();
    expect(normalized.engineEconomicsOverrides).toBeNull();
    expect(normalized.totalAvailableMemoryGB).toBeGreaterThan(0);
  });

  it("never converts TOPS to TPS", () => {
    const npu = catalog.data.find(
      (candidate) => candidate.id === "directional-npu-desktop",
    )!;
    const normalized = normalizeDesktopSystem(npu);

    expect(normalized.peakTops?.value).toBe(50);
    expect(normalized.performanceOverride).toBeNull();
    expect("effectiveTokensPerSecond" in normalized.engineGpu).toBe(false);
  });

  it("preserves an explicit model-bound performance override", () => {
    const custom: CustomDesktopSystemConfig = {
      id: "custom-lab-system",
      name: "Custom Lab System",
      vendor: "Internal",
      memoryArchitecture: "unified",
      allocatableUnifiedMemoryGB: 96,
      systemMemoryType: "LPDDR5X",
      systemMemoryGB: 128,
      acceleratorType: "AI accelerator",
      acceleratorBehaviorCategory: "ai-accelerator",
      acceleratorModel: "Lab accelerator",
      acceleratorCount: 1,
      supportsModelSharding: false,
      memoryBandwidthGBps: 512,
      interconnect: "unified",
      systemIdleWatts: 30,
      systemLoadWatts: 240,
      purchasePriceUSD: 4200,
      peakTops: { value: 100, precision: "INT8" },
      runtimeSupport: {
        status: "partial",
        runtimes: ["Internal runtime"],
        method: "measured",
      },
      performance: {
        modelId: "qwen3-14b",
        quantizationId: "q4",
        effectiveTokensPerSecond: 31,
        timeToFirstTokenSeconds: 0.7,
        method: "measured",
      },
    };

    expect(CustomDesktopSystemConfigSchema.safeParse(custom).success).toBe(true);
    const normalized = normalizeDesktopSystem(custom);
    expect(normalized.performanceOverride?.effectiveTokensPerSecond).toBe(31);
    expect(normalized.performanceOverride?.method).toBe("measured");
    expect(normalized.peakTops?.value).toBe(100);
  });

  it("accepts data-pack accelerator labels, precision labels and dynamic counts", () => {
    const base = catalog.data[0]!;
    const parsed = DesktopSystemRecordSchema.parse({
      ...base,
      id: "directional-custom-accelerator",
      acceleratorType: "Vendor Matrix Engine X",
      acceleratorBehaviorCategory: "other",
      acceleratorCount: 3,
      peakTops: { value: 777, precision: "BF16-accumulate" },
    });

    expect(parsed.acceleratorType).toBe("Vendor Matrix Engine X");
    expect(parsed.acceleratorBehaviorCategory).toBe("other");
    expect(parsed.acceleratorCount).toBe(3);
    expect(parsed.peakTops?.precision).toBe("BF16-accumulate");
  });

  it("infers stable behavior for legacy accelerator labels", () => {
    const base = catalog.data[0]!;
    const { acceleratorBehaviorCategory: _removed, ...legacy } = base;
    const parsed = DesktopSystemRecordSchema.parse(legacy);
    expect(parsed.acceleratorBehaviorCategory).toBe("gpu");
  });
});
