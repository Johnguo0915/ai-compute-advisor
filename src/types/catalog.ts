import type {
  LatencyRequirement,
  PrivacyRequirement,
  WorkloadConfig,
} from "./config";
import type { ExchangeRateCatalog } from "../currency/types";
import type { DesktopSystemRecord } from "../systems/types";

/** Data-pack defined capability tier identifier. */
export type CapabilityTierId = string;
/** @deprecated Use CapabilityTierId. Kept as a source-compatible type alias. */
export type IntelligenceClass = CapabilityTierId;
export type ModelType = "dense" | "moe";
export type QuantizationId = string;
/** A positive safe integer validated at the data/config boundary. */
export type GpuCount = number;
export type Interconnect = "pcie" | "nvlink" | "unified" | "other";
export type MetricMethod = "measured" | "derived" | "estimated" | "unavailable";

export interface LocalizedText {
  en: string;
  "zh-CN": string;
}

export interface CapabilityTierDefinition {
  id: CapabilityTierId;
  labels: LocalizedText;
  rank: number;
  /** Data-Pack planning guidance; it is not an industry-wide benchmark band. */
  description?: LocalizedText;
  example?: LocalizedText;
  recommendationImpact?: LocalizedText;
}

export interface CatalogSource {
  label: string;
  url?: string;
  methodology?: string;
  license?: string;
}

export interface CatalogEnvelope<T> {
  schemaVersion: 1;
  catalogId: string;
  lastUpdated: string;
  source: CatalogSource;
  data: T[];
}

export interface CatalogMetadata {
  catalogId: string;
  lastUpdated: string;
  source: CatalogSource;
}

export interface DataManifest {
  schemaVersion: 1;
  dataVersion: string;
  lastUpdated: string;
  catalogs: {
    models: string;
    modelBenchmarks: string;
    gpus: string;
    inferenceProfiles: string;
    cloudPricing: string;
    assumptions: string;
    presets: string;
    systems: string;
    exchangeRates: string;
  };
}

export interface QuantizationProfile {
  id: string;
  label: string;
  bitsPerParameter: number;
  packingOverheadRatio: number;
}

export interface ModelRecord {
  id: string;
  name: string;
  provider: string;
  family?: string;
  modelType: ModelType;
  totalParametersB: number;
  activeParametersB: number;
  contextWindowTokens: number;
  maxOutputTokens?: number;
  recommendedQuantizationId: string;
  quantizations: QuantizationProfile[];
  capabilityTierId: CapabilityTierId;
  reasoning: boolean;
  modalities: Array<"text" | "image" | "audio" | "video">;
  openWeight: boolean;
  commercialUse: "allowed" | "restricted" | "unknown";
  kvCacheBytesPerToken?: number;
  /** Planning GB of model weights offloaded from GPU VRAM into host RAM. */
  systemMemoryOffloadGB?: number;
  /** Planning GB of KV cache offloaded from GPU VRAM onto SSD. */
  ssdKvCacheOffloadGB?: number;
  /** Optional model-specific VRAM safety margin; otherwise the catalog assumption is used. */
  safetyMarginRatio?: number;
  notes?: string;
}

export interface ModelBenchmarkRecord {
  id: string;
  modelId: string;
  sourceId: string;
  methodologyVersion: string;
  measuredAt: string;
  intelligenceScore?: number;
  intelligenceScale?: { min: number; max: number };
  codingScore?: number;
  agenticScore?: number;
  longContextScore?: number;
  knowledgeReliabilityScore?: number;
  opennessScore?: number;
  outputTokensPerSecond?: number;
  timeToFirstTokenSeconds?: number;
  timeToFirstAnswerTokenSeconds?: number;
  endToEnd500TokensSeconds?: number;
  averageOutputTokensPerTask?: number;
  method: MetricMethod;
}

export interface PeakAiTopsSpecification {
  value: number;
  /** Vendor-declared arithmetic basis, for example FP4 with sparsity. */
  precision: string;
}

export interface GpuEvidenceRecord {
  kind: "specification" | "price" | "system-qualification";
  label: string;
  url?: string;
  observedAt: string;
  notes?: string;
}

/**
 * Hardware capability shape used by the calculation core.
 *
 * A catalog GPU always supplies price and TDP (see `GpuRecord` below), while
 * a complete-system adapter may intentionally leave those economic inputs
 * unavailable. Capability calculations must not depend on the nullable
 * fields.
 */
export interface ComputeHardwareRecord {
  id: string;
  name: string;
  vendor: string;
  vramGB: number;
  memoryBandwidthGBps: number;
  tdpWatts: number | null;
  streetPriceUSD: number | null;
  interconnect: Interconnect;
  /** Physically offered card counts; this does not imply pooled model memory. */
  supportedCounts: GpuCount[];
  /** True only when the catalog has evidence for one model spanning cards. */
  supportsTensorParallel: boolean;
  /** Peak arithmetic metadata only. Never convert this value into LLM TPS. */
  peakAiTops?: PeakAiTopsSpecification;
  evidence?: GpuEvidenceRecord[];
  notes?: string;
}

/** GPU-catalog records retain complete economic inputs. */
export interface GpuRecord extends ComputeHardwareRecord {
  tdpWatts: number;
  streetPriceUSD: number;
}

/** Narrowed calculator input after an explicit evidence-availability check. */
export type EconomicsReadyComputeHardwareRecord = ComputeHardwareRecord & {
  tdpWatts: number;
  streetPriceUSD: number;
};

export interface InferenceProfileRecord {
  id: string;
  modelId: string;
  gpuId: string;
  quantizationId: string;
  gpuCount: GpuCount;
  inputTokens: number;
  outputTokens: number;
  contextTokens: number;
  concurrency: number;
  effectiveTokensPerSecond: number;
  outputTokensPerSecond?: number;
  timeToFirstTokenSeconds?: number;
  framework?: string;
  method: Exclude<MetricMethod, "unavailable">;
  sourceUrl?: string;
  lastUpdated: string;
}

export interface CloudPricingRecord {
  id: string;
  provider: string;
  modelId?: string;
  modelName: string;
  currency: "USD";
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  cachedInputPricePerMillionTokens?: number;
  cacheWritePricePerMillionTokens?: number;
  sourceUrl?: string;
  lastUpdated: string;
}

export interface SimpleUseCaseDefaults {
  labels: LocalizedText;
  averageInputTokens: number;
  averageOutputTokens: number;
  averageAgentSteps: number;
  peakConcurrentUsersRatio: number;
  averageContextLength: number;
  peakContextLength: number;
}

export interface UsageFrequencyDefaults {
  labels: LocalizedText;
  requestsPerUserPerWorkingDay: number;
  workingHoursPerDay: number;
  workingDaysPerMonth: number;
}

export interface ModelRequirementDefaults {
  startingClass: CapabilityTierId;
}

export interface WorkloadOptionDefinition {
  labels: LocalizedText;
  description: LocalizedText;
  example: LocalizedText;
  recommendationImpact: LocalizedText;
}

export interface LatencyOptionDefinition extends WorkloadOptionDefinition {
  /** Configurable planning target, not a claim of an industry-wide SLA. */
  targetTimeToFirstTokenSeconds: number;
}

export interface AssumptionsRecord {
  currency: "USD";
  capabilityTiers: CapabilityTierDefinition[];
  workloadDefinitions: {
    privacy: Record<PrivacyRequirement, WorkloadOptionDefinition>;
    latency: Record<LatencyRequirement, LatencyOptionDefinition>;
  };
  economics: {
    electricityPricePerKWh: number;
    hardwareLifetimeMonths: number;
    maintenanceCostMonthly: number;
    defaultUtilizationRatio: number;
    defaultCachedInputRatio: number;
    hostPurchasePriceUSD: number;
    hostIdlePowerWatts: number;
    hostLoadPowerWatts: number;
    gpuIdlePowerRatio: number;
  };
  vram: {
    defaultRuntimeOverheadRatio: number;
    minimumRuntimeOverheadGB: number;
    safetyMarginRatio: number;
    fallbackKvCacheBytesPerTokenByTier: Record<CapabilityTierId, number>;
    fitThresholds: {
      marginalCapacityRatio: number;
      recommendedCapacityRatio: number;
      comfortableCapacityRatio: number;
    };
  };
  multiGpuEfficiency: Record<Interconnect, Record<string, number>>;
  simpleModeMappings: {
    useCases: Record<string, SimpleUseCaseDefaults>;
    usageFrequency: Record<string, UsageFrequencyDefaults>;
    intelligence: Record<CapabilityTierId, ModelRequirementDefaults>;
  };
  recommendation: {
    lowUtilizationRatio: number;
    highUtilizationRatio: number;
    maximumPreferredBreakEvenMonths: number;
    highPrivacyLevels: Array<"high" | "critical">;
    minimumHybridLocalCoverageRatio: number;
    minimumMeaningfulSavingsRatio: number;
    costTieToleranceRatio: number;
  };
}

export interface PresetRecord {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  workload: Partial<WorkloadConfig>;
  suggestedLocalCoverageRatio?: number;
}

export type CatalogKey =
  | "models"
  | "modelBenchmarks"
  | "gpus"
  | "inferenceProfiles"
  | "cloudPricing"
  | "assumptions"
  | "presets"
  | "systems"
  | "exchangeRates";

export interface NormalizedCatalogs {
  dataVersion: string;
  models: ModelRecord[];
  modelBenchmarks: ModelBenchmarkRecord[];
  gpus: GpuRecord[];
  inferenceProfiles: InferenceProfileRecord[];
  cloudPricing: CloudPricingRecord[];
  assumptions: AssumptionsRecord;
  presets: PresetRecord[];
  systems: DesktopSystemRecord[];
  exchangeRates: ExchangeRateCatalog;
  metadata: Record<CatalogKey, CatalogMetadata>;
  /**
   * Identifies records layered over a Data Pack for the current browser only.
   * Portable Data Pack exports omit these IDs so local catalog edits are never
   * mistaken for authoritative pack data.
   */
  localModelOverlay?: {
    kind: "browser-local-models";
    modelIds: string[];
    cloudPricingIds: string[];
  };
}

export interface RawCatalogBundle {
  manifest: unknown;
  models: unknown;
  modelBenchmarks: unknown;
  gpus: unknown;
  inferenceProfiles: unknown;
  cloudPricing: unknown;
  assumptions: unknown;
  presets: unknown;
  systems: unknown;
  exchangeRates: unknown;
}
