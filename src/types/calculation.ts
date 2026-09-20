import type {
  CloudPricingRecord,
  ComputeHardwareRecord,
  CapabilityTierId,
  MetricMethod,
  ModelRecord,
  QuantizationProfile,
} from "./catalog";
import type { AdvisorConfig } from "./config";
import type { DeploymentComparison, RecommendationResult } from "./recommendation";
import type { NormalizedDesktopHardware } from "../systems";

export type CalculationUnit =
  | "text"
  | "tokens"
  | "tokens/month"
  | "tokens/second"
  | "GB"
  | "USD"
  | "USD/month"
  | "USD/1M tokens"
  | "ratio"
  | "months"
  | "hours"
  | "watts";

export interface CalculationValue {
  key: string;
  label: string;
  rawValue: number | string | null;
  unit: CalculationUnit;
  source:
    | "user"
    | "preset"
    | "model-data"
    | "gpu-data"
    | "pricing-data"
    | "assumption"
    | "derived";
}

export interface CalculationTrace {
  id: string;
  title: string;
  formula: string;
  inputs: CalculationValue[];
  intermediateValues: CalculationValue[];
  result: CalculationValue;
  method: MetricMethod;
  warnings: string[];
  sourceIds: string[];
}

export interface TokenDemandResult {
  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  monthlyTotalTokens: number;
  monthlyRequests: number;
  trace: CalculationTrace;
}

export interface ModelRequirementResult {
  recommendedClass: CapabilityTierId;
  eligibleModelIds: string[];
  selectedModelId: string | null;
  reasonCodes: string[];
  warnings: string[];
}

export interface VramResult {
  modelWeightGB: number;
  systemMemoryOffloadGB: number;
  gpuResidentWeightGB: number;
  totalKvCacheGB: number;
  kvCacheGB: number;
  ssdKvCacheOffloadGB: number;
  gpuResidentKvCacheGB: number;
  runtimeOverheadGB: number;
  safetyMarginGB: number;
  safetyMarginRatio: number;
  hardMinimumGB: number;
  recommendedVramGB: number;
  kvCacheMethod: "model-data" | "class-fallback";
  trace: CalculationTrace;
}

export type HardwareFitStatus = "cannot-run" | "marginal" | "recommended" | "comfortable";

export interface HardwareFitResult {
  status: HardwareFitStatus;
  availableVramGB: number;
  requiredVramGB: number;
  capacityRatio: number;
  headroomGB: number;
  multiGpuEfficiency: number;
  multiGpuEfficiencyMethod: "configured" | "conservative-fallback";
  multiGpuPerformanceScale: number;
  warnings: string[];
  trace: CalculationTrace;
}

export interface PerformanceResult {
  method: MetricMethod;
  profileId: string | null;
  effectiveTokensPerSecond: number | null;
  outputTokensPerSecond: number | null;
  timeToFirstTokenSeconds: number | null;
  monthlyTokenCapacity: number | null;
  workloadComputeUtilizationRatio: number | null;
  warnings: string[];
  trace: CalculationTrace;
}

export interface LocalCostResult {
  hardwarePurchasePriceUSD: number;
  monthlyDepreciationUSD: number;
  averageSystemPowerWatts: number;
  monthlyBaseElectricityUSD: number;
  monthlyDynamicElectricityAtFullUtilizationUSD: number;
  monthlyElectricityUSD: number;
  monthlyMaintenanceUSD: number;
  monthlyOperatingCostUSD: number;
  monthlyTcoUSD: number;
  costPerMillionTokensUSD: number | null;
  threeYearTcoUSD: number;
  trace: CalculationTrace;
}

export interface CloudCostResult {
  pricing: CloudPricingRecord | null;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  inputCostUSD: number;
  cachedInputCostUSD: number;
  outputCostUSD: number;
  monthlyCostUSD: number;
  costPerMillionTokensUSD: number | null;
  threeYearTcoUSD: number;
  warnings: string[];
  trace: CalculationTrace;
}

export interface HybridCostResult {
  localCoverageRatio: number;
  cloudEscalationRatio: number;
  cloudTokenAvoidanceRatio: number;
  locallyServedTokens: number;
  cloudEscalationCostUSD: number;
  monthlyCostUSD: number;
  costPerMillionTokensUSD: number | null;
  savingVsCloudRatio: number | null;
  threeYearTcoUSD: number;
  warnings: string[];
  trace: CalculationTrace;
}

export type BreakEvenAvailability = "available" | "none" | "unavailable";

export interface BreakEvenResult {
  month: {
    status: BreakEvenAvailability;
    months: number | null;
    withinHardwareLifetime: boolean | null;
    reason?: string;
  };
  requiredUtilization: {
    status: BreakEvenAvailability;
    ratio: number | null;
    reason?: string;
  };
  traces: CalculationTrace[];
}

export interface OpportunityMapCell {
  utilizationRatio: number;
  intelligenceClass: CapabilityTierId;
  deployment: "local" | "hybrid" | "cloud" | "constraint-conflict";
}

export interface OpportunityMapResult {
  cells: OpportunityMapCell[];
  currentPoint: {
    utilizationRatio: number;
    intelligenceClass: CapabilityTierId;
    method: "derived" | "assumed";
    deployment: "local" | "hybrid" | "cloud" | "constraint-conflict";
  };
  boundaryReasonCodes: string[];
}

export interface AnalysisResult {
  status: "complete" | "incomplete";
  config: AdvisorConfig;
  tokenDemand: TokenDemandResult;
  modelRequirement: ModelRequirementResult;
  selectedModel: ModelRecord | null;
  selectedQuantization: QuantizationProfile | null;
  selectedGpu: ComputeHardwareRecord | null;
  selectedSystem: NormalizedDesktopHardware | null;
  systemValidationErrors: Partial<Record<string, string>>;
  vram: VramResult | null;
  hardwareFit: HardwareFitResult | null;
  performance: PerformanceResult | null;
  localCost: LocalCostResult | null;
  cloudCost: CloudCostResult | null;
  hybridCost: HybridCostResult | null;
  breakEven: BreakEvenResult | null;
  comparisons: DeploymentComparison[];
  recommendation: RecommendationResult;
  opportunityMap: OpportunityMapResult;
  traces: CalculationTrace[];
  warnings: string[];
}
