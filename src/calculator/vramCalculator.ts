import type {
  AssumptionsRecord,
  ModelRecord,
  QuantizationProfile,
  VramResult,
} from "../types";
import { assertFiniteNonNegative, trace, value } from "./trace";

export interface VramInput {
  model: ModelRecord;
  quantization: QuantizationProfile;
  peakContextTokens: number;
  peakConcurrentUsers: number;
  assumptions: AssumptionsRecord["vram"];
}

export function calculateModelWeightGB(
  model: ModelRecord,
  quantization: QuantizationProfile,
): number {
  return (
    model.totalParametersB *
    (quantization.bitsPerParameter / 8) *
    (1 + quantization.packingOverheadRatio)
  );
}

export function calculateVramRequirement(input: VramInput): VramResult {
  assertFiniteNonNegative(input.peakContextTokens, "peakContextTokens");
  assertFiniteNonNegative(input.peakConcurrentUsers, "peakConcurrentUsers");

  const modelWeightGB = calculateModelWeightGB(input.model, input.quantization);
  const requestedOffloadGB = input.model.systemMemoryOffloadGB ?? 0;
  const systemMemoryOffloadGB = Math.min(Math.max(0, requestedOffloadGB), modelWeightGB);
  const gpuResidentWeightGB = modelWeightGB - systemMemoryOffloadGB;
  const kvCacheMethod = input.model.kvCacheBytesPerToken ? "model-data" : "class-fallback";
  const kvCacheBytesPerToken =
    input.model.kvCacheBytesPerToken ??
    input.assumptions.fallbackKvCacheBytesPerTokenByTier[input.model.capabilityTierId] ??
    Object.values(input.assumptions.fallbackKvCacheBytesPerTokenByTier)[0];
  if (kvCacheBytesPerToken === undefined) {
    throw new Error("No KV-cache fallback is configured for the selected model capability tier.");
  }
  const totalKvCacheGB =
    (input.peakContextTokens * input.peakConcurrentUsers * kvCacheBytesPerToken) / 1_000_000_000;
  const requestedSsdKvGB = input.model.ssdKvCacheOffloadGB ?? 0;
  const ssdKvCacheOffloadGB = Math.min(Math.max(0, requestedSsdKvGB), totalKvCacheGB);
  const gpuResidentKvCacheGB = totalKvCacheGB - ssdKvCacheOffloadGB;
  const kvCacheGB = gpuResidentKvCacheGB;
  const runtimeOverheadGB = Math.max(
    input.assumptions.minimumRuntimeOverheadGB,
    gpuResidentWeightGB * input.assumptions.defaultRuntimeOverheadRatio,
  );
  const hardMinimumGB = gpuResidentWeightGB + kvCacheGB + runtimeOverheadGB;
  const safetyMarginRatio =
    input.model.safetyMarginRatio ?? input.assumptions.safetyMarginRatio;
  const safetyMarginGB = hardMinimumGB * safetyMarginRatio;
  const recommendedVramGB = hardMinimumGB + safetyMarginGB;
  const warnings = [
    ...(kvCacheMethod === "class-fallback"
      ? ["KV cache uses a class-level fallback because the model has no model-specific value."]
      : []),
    ...(systemMemoryOffloadGB > 0
      ? [
          `About ${systemMemoryOffloadGB}GB of model weights are planned to reside in system memory; validate the offload path and host RAM headroom.`,
        ]
      : []),
    ...(ssdKvCacheOffloadGB > 0
      ? [
          `About ${ssdKvCacheOffloadGB}GB of KV cache is planned to reside on SSD; validate the paging path, SSD bandwidth and latency.`,
        ]
      : []),
  ];

  return {
    modelWeightGB,
    systemMemoryOffloadGB,
    gpuResidentWeightGB,
    totalKvCacheGB,
    kvCacheGB,
    ssdKvCacheOffloadGB,
    gpuResidentKvCacheGB,
    runtimeOverheadGB,
    safetyMarginGB,
    safetyMarginRatio,
    hardMinimumGB,
    recommendedVramGB,
    kvCacheMethod,
    trace: trace({
      id: "vram-requirement",
      title: "Recommended VRAM",
      formula:
        systemMemoryOffloadGB > 0 || ssdKvCacheOffloadGB > 0
          ? "GPU-resident weights + GPU-resident KV cache + runtime overhead + safety margin"
          : "Model weights + KV cache + runtime overhead + safety margin",
      inputs: [
        value("totalParameters", "Total parameters", input.model.totalParametersB, "ratio", "model-data"),
        value("bits", "Bits per parameter", input.quantization.bitsPerParameter, "ratio", "model-data"),
        value("peakContext", "Peak context", input.peakContextTokens, "tokens", "user"),
        value("concurrency", "Peak concurrent users", input.peakConcurrentUsers, "ratio", "user"),
      ],
      intermediateValues: [
        value("modelWeight", "Model weight", modelWeightGB, "GB", "derived"),
        ...(systemMemoryOffloadGB > 0
          ? [
              value(
                "systemMemoryOffload",
                "System-memory offload",
                systemMemoryOffloadGB,
                "GB",
                "model-data",
              ),
              value(
                "gpuResidentWeight",
                "GPU-resident weight",
                gpuResidentWeightGB,
                "GB",
                "derived",
              ),
            ]
          : []),
        value("kvCache", "KV cache", totalKvCacheGB, "GB", kvCacheMethod === "model-data" ? "model-data" : "assumption"),
        ...(ssdKvCacheOffloadGB > 0
          ? [
              value("ssdKvCacheOffload", "SSD KV offload", ssdKvCacheOffloadGB, "GB", "model-data"),
              value("gpuResidentKvCache", "GPU-resident KV cache", gpuResidentKvCacheGB, "GB", "derived"),
            ]
          : []),
        value("runtime", "Runtime overhead", runtimeOverheadGB, "GB", "assumption"),
        value(
          "safety",
          "Safety margin",
          safetyMarginGB,
          "GB",
          input.model.safetyMarginRatio === undefined ? "assumption" : "model-data",
        ),
      ],
      result: value("recommendedVram", "Recommended VRAM", recommendedVramGB, "GB", "derived"),
      method: kvCacheMethod === "model-data" ? "derived" : "estimated",
      warnings,
      sourceIds: [input.model.id],
    }),
  };
}
