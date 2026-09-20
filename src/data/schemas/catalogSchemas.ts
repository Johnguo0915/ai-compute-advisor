import { z } from "zod";
import type {
  CatalogEnvelope,
  CatalogKey,
  CatalogMetadata,
  NormalizedCatalogs,
  RawCatalogBundle,
} from "../../types";
import {
  CapabilityTierIdSchema,
  GpuCountSchema,
  migrateLegacyWorkload,
  WorkloadConfigBaseSchema,
} from "./configSchemas";
import { DesktopSystemsCatalogSchema } from "../../systems";
import { ExchangeRateCatalogSchema } from "../../currency/schemas";

const id = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);
const isoDate = z.iso.date();
const finite = z.number().finite();
const positive = finite.positive();
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegative = finite.nonnegative();
const ratio = finite.min(0).max(1);

export const LocalizedTextSchema = z.strictObject({
  en: z.string().min(1),
  "zh-CN": z.string().min(1),
});

/** Compatibility seed used only when a v1 Data Pack predates capabilityTiers. */
export const DEFAULT_CAPABILITY_TIERS = [
  {
    id: "basic",
    labels: { en: "Basic", "zh-CN": "基础" },
    rank: 0,
    description: {
      en: "Routine language tasks with clear instructions and limited reasoning depth; efficiency matters more than handling difficult edge cases.",
      "zh-CN": "适合指令清晰、推理深度有限的常规语言任务；更看重资源效率，不要求处理复杂边界情况。",
    },
    example: {
      en: "Examples: classification, extraction, short summaries and FAQ drafting.",
      "zh-CN": "示例：分类、信息抽取、短摘要和常见问答草拟。",
    },
    recommendationImpact: {
      en: "The calculator may choose the smallest eligible model with supporting evidence.",
      "zh-CN": "计算器可选择有证据支持的最小可用模型。",
    },
  },
  {
    id: "balanced",
    labels: { en: "Balanced", "zh-CN": "均衡" },
    rank: 1,
    description: {
      en: "General business quality for common knowledge work, with moderate reasoning and instruction following at a practical cost.",
      "zh-CN": "面向常见知识工作的通用业务质量，在适中成本下提供中等推理与指令遵循能力。",
    },
    example: {
      en: "Examples: internal copilots, document Q&A, routine analysis and everyday coding assistance.",
      "zh-CN": "示例：内部 Copilot、文档问答、常规分析和日常编程辅助。",
    },
    recommendationImpact: {
      en: "The calculator favors mainstream mid-tier models that balance quality, speed and cost.",
      "zh-CN": "计算器会偏向在质量、速度与成本之间折中的主流中档模型。",
    },
  },
  {
    id: "advanced",
    labels: { en: "Advanced", "zh-CN": "高级" },
    rank: 2,
    description: {
      en: "Complex multi-step work that needs stronger reasoning, coding, tool use or long-context reliability, where errors have meaningful business impact.",
      "zh-CN": "适合需要更强推理、编程、工具调用或长上下文可靠性的复杂多步任务，错误会带来明显业务影响。",
    },
    example: {
      en: "Examples: coding agents, complex RAG synthesis, workflow agents and expert document review.",
      "zh-CN": "示例：编程 Agent、复杂 RAG 综合、工作流 Agent 和专家级文档审阅。",
    },
    recommendationImpact: {
      en: "The calculator requires a higher-ranked model and may accept higher memory, latency or cost.",
      "zh-CN": "计算器会要求更高能力档模型，并可能接受更高显存、延迟或成本。",
    },
  },
  {
    id: "frontier",
    labels: { en: "Frontier", "zh-CN": "前沿" },
    rank: 3,
    description: {
      en: "The hardest novel, expert or high-consequence tasks where the best available capability is prioritized over cost and deployment simplicity.",
      "zh-CN": "面向最困难、创新性强、专家级或高后果任务，优先追求当前最佳能力，而非成本和部署简易度。",
    },
    example: {
      en: "Examples: difficult research, frontier agentic coding and high-stakes expert analysis with human review.",
      "zh-CN": "示例：高难度研究、前沿 Agent 编程，以及配有人审的高风险专家分析。",
    },
    recommendationImpact: {
      en: "The calculator considers only the highest configured capability tier; cloud escalation may be required if local evidence is insufficient.",
      "zh-CN": "计算器只考虑配置中最高能力档；本地证据不足时可能需要升级到云端。",
    },
  },
] as const;

export const DEFAULT_WORKLOAD_DEFINITIONS = {
  privacy: {
    low: {
      labels: { en: "Low privacy", "zh-CN": "低隐私" },
      description: {
        en: "Public, synthetic or non-sensitive content. External cloud processing is normally acceptable.",
        "zh-CN": "公开、合成或非敏感内容，通常可以接受外部云端处理。",
      },
      example: {
        en: "Examples: public documents, demos and synthetic test data.",
        "zh-CN": "示例：公开文档、演示内容和合成测试数据。",
      },
      recommendationImpact: {
        en: "Cloud is allowed; capability and economics drive the recommendation.",
        "zh-CN": "允许使用云端，推荐主要由能力与经济性决定。",
      },
    },
    medium: {
      labels: { en: "Medium privacy", "zh-CN": "中等隐私" },
      description: {
        en: "Routine internal business data without regulated or high-value secrets. Use approved providers and retention controls.",
        "zh-CN": "常规内部业务数据，不包含受监管信息或高价值机密；应使用获批服务商并控制数据留存。",
      },
      example: {
        en: "Examples: internal summaries, ordinary operations and non-sensitive support content.",
        "zh-CN": "示例：内部摘要、常规运营资料和非敏感客服内容。",
      },
      recommendationImpact: {
        en: "Cloud remains possible when organizational controls are satisfied.",
        "zh-CN": "满足组织安全控制后仍可采用云端。",
      },
    },
    high: {
      labels: { en: "High privacy", "zh-CN": "高隐私" },
      description: {
        en: "Raw sensitive content stays inside an organization-controlled local or private boundary. Hybrid processing may send only redacted, minimized context or a non-sensitive subtask to an approved cloud.",
        "zh-CN": "原始敏感内容留在组织可控的本地或私有边界内；混合计算只能向获批云端发送脱敏、最小化后的上下文或非敏感子任务。",
      },
      example: {
        en: "Examples: unreleased products, private repositories and customer-confidential documents.",
        "zh-CN": "示例：未发布产品、私有代码库和客户保密文档。",
      },
      recommendationImpact: {
        en: "Local or Hybrid is preferred. Public cloud must not receive raw sensitive fields; any escalation requires explicit organizational controls.",
        "zh-CN": "优先本地或混合部署；公共云不得接收原始敏感字段，任何云端升级都必须经过明确的组织控制。",
      },
    },
    critical: {
      labels: { en: "Critical privacy", "zh-CN": "关键隐私" },
      description: {
        en: "All prompts, context, retrieved data, outputs and inference telemetry remain inside the approved local, on-premises or sovereign boundary.",
        "zh-CN": "提示词、上下文、检索数据、输出和推理遥测全部留在获批的本地、企业内网或主权边界内。",
      },
      example: {
        en: "Examples: protected health data, classified workloads and strict data-residency cases.",
        "zh-CN": "示例：受保护健康数据、涉密工作负载和严格数据驻留场景。",
      },
      recommendationImpact: {
        en: "Public-cloud inference is prohibited by this planning policy. Local is a hard requirement; the calculator reports a conflict when no capable local path exists.",
        "zh-CN": "本规划策略禁止公共云推理；本地部署是硬性要求，没有可行本地方案时计算器会明确报告约束冲突。",
      },
    },
  },
  latency: {
    "best-effort": {
      labels: { en: "Best effort", "zh-CN": "尽力而为" },
      description: {
        en: "Background or asynchronous work where the user is not waiting on every response.",
        "zh-CN": "后台或异步任务，用户不会等待每一次响应。",
      },
      example: {
        en: "Examples: batch classification, nightly summaries and offline document processing.",
        "zh-CN": "示例：批量分类、夜间摘要和离线文档处理。",
      },
      recommendationImpact: {
        en: "Planning target: first token within about 10 seconds; throughput and cost usually matter more.",
        "zh-CN": "规划目标：首 Token 约 10 秒内；通常吞吐量和成本更重要。",
      },
      targetTimeToFirstTokenSeconds: 10,
    },
    interactive: {
      labels: { en: "Interactive", "zh-CN": "交互式" },
      description: {
        en: "A person is actively waiting, but a short conversational pause is acceptable.",
        "zh-CN": "用户正在等待响应，但可以接受短暂的对话停顿。",
      },
      example: {
        en: "Examples: chat assistants, document Q&A and internal copilots.",
        "zh-CN": "示例：聊天助手、文档问答和内部 Copilot。",
      },
      recommendationImpact: {
        en: "Planning target: first token within about 2 seconds.",
        "zh-CN": "规划目标：首 Token 约 2 秒内。",
      },
      targetTimeToFirstTokenSeconds: 2,
    },
    fast: {
      labels: { en: "Fast", "zh-CN": "快速" },
      description: {
        en: "The response should feel immediate enough to preserve a rapid working rhythm.",
        "zh-CN": "响应应足够即时，以保持快速连续的工作节奏。",
      },
      example: {
        en: "Examples: coding assistance, rapid search and high-frequency agent interaction.",
        "zh-CN": "示例：编程辅助、快速检索和高频 Agent 交互。",
      },
      recommendationImpact: {
        en: "Planning target: first token within about 1 second.",
        "zh-CN": "规划目标：首 Token 约 1 秒内。",
      },
      targetTimeToFirstTokenSeconds: 1,
    },
    "real-time": {
      labels: { en: "Real time", "zh-CN": "实时" },
      description: {
        en: "Delay interrupts a live conversation or control loop and must be minimized end to end.",
        "zh-CN": "延迟会打断实时对话或控制循环，需要尽量降低端到端等待。",
      },
      example: {
        en: "Examples: live voice turns, operator assistance and interactive control.",
        "zh-CN": "示例：实时语音轮次、操作员辅助和交互控制。",
      },
      recommendationImpact: {
        en: "Planning target: first token within about 0.25 seconds; the engine prefers a local network path when feasible.",
        "zh-CN": "规划目标：首 Token 约 0.25 秒内；可行时引擎会偏好本地网络路径。",
      },
      targetTimeToFirstTokenSeconds: 0.25,
    },
  },
} as const;

const legacyUseCaseLabels: Record<string, { en: string; "zh-CN": string }> = {
  "ai-assistant": { en: "AI assistant", "zh-CN": "AI 助手" },
  "enterprise-agent": { en: "Enterprise agent", "zh-CN": "企业智能体" },
  coding: { en: "Coding", "zh-CN": "编程" },
  "document-rag": { en: "Document RAG", "zh-CN": "文档 RAG" },
  "meeting-agent": { en: "Meeting agent", "zh-CN": "会议助手" },
  "content-creation": { en: "Content creation", "zh-CN": "内容创作" },
  custom: { en: "Custom", "zh-CN": "自定义" },
};

const legacyFrequencyLabels: Record<string, { en: string; "zh-CN": string }> = {
  occasional: { en: "Occasional", "zh-CN": "偶尔" },
  daily: { en: "Daily", "zh-CN": "日常" },
  heavy: { en: "Heavy", "zh-CN": "高频" },
  "always-on": { en: "Always on", "zh-CN": "持续运行" },
};

export const CatalogSourceSchema = z.strictObject({
  label: z.string().min(1),
  url: z.url().optional(),
  methodology: z.string().min(1).optional(),
  license: z.string().min(1).optional(),
});

export const CatalogEnvelopeSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.strictObject({
    schemaVersion: z.literal(1),
    catalogId: id,
    lastUpdated: isoDate,
    source: CatalogSourceSchema,
    data: z.array(itemSchema),
  });

export const DataManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  dataVersion: z.string().min(1),
  lastUpdated: isoDate,
  catalogs: z.strictObject({
    models: z.string().min(1),
    modelBenchmarks: z.string().min(1),
    gpus: z.string().min(1),
    inferenceProfiles: z.string().min(1),
    cloudPricing: z.string().min(1),
    assumptions: z.string().min(1),
    presets: z.string().min(1),
    systems: z.string().min(1),
    exchangeRates: z.string().min(1),
  }),
});

export const QuantizationProfileSchema = z.strictObject({
  id,
  label: z.string().min(1),
  bitsPerParameter: positive.max(32),
  packingOverheadRatio: ratio,
});

const ModelRecordBaseSchema = z.strictObject({
    id,
    name: z.string().min(1),
    provider: z.string().min(1),
    family: z.string().min(1).optional(),
    modelType: z.enum(["dense", "moe"]),
    totalParametersB: positive,
    activeParametersB: positive,
    contextWindowTokens: positiveInteger,
    maxOutputTokens: positiveInteger.optional(),
    recommendedQuantizationId: id,
    quantizations: z.array(QuantizationProfileSchema).min(1),
    capabilityTierId: CapabilityTierIdSchema,
    reasoning: z.boolean(),
    modalities: z.array(z.enum(["text", "image", "audio", "video"])).min(1),
    openWeight: z.boolean(),
    commercialUse: z.enum(["allowed", "restricted", "unknown"]),
    kvCacheBytesPerToken: positive.optional(),
    systemMemoryOffloadGB: positive.optional(),
    ssdKvCacheOffloadGB: positive.optional(),
    safetyMarginRatio: ratio.optional(),
    notes: z.string().optional(),
  });

function migrateLegacyModel(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const migrated = { ...(value as Record<string, unknown>) };
  if (migrated.capabilityTierId === undefined && typeof migrated.intelligenceClass === "string") {
    migrated.capabilityTierId = migrated.intelligenceClass;
  }
  delete migrated.intelligenceClass;
  return migrated;
}

export const ModelRecordSchema = z
  .preprocess(migrateLegacyModel, ModelRecordBaseSchema)
  .superRefine((model, ctx) => {
    if (model.activeParametersB > model.totalParametersB) {
      ctx.addIssue({
        code: "custom",
        path: ["activeParametersB"],
        message: "activeParametersB cannot exceed totalParametersB",
      });
    }
    if (model.modelType === "dense" && model.activeParametersB !== model.totalParametersB) {
      ctx.addIssue({
        code: "custom",
        path: ["activeParametersB"],
        message: "Dense models must use totalParametersB as activeParametersB",
      });
    }
    const quantizationIds = model.quantizations.map((item) => item.id);
    if (new Set(quantizationIds).size !== quantizationIds.length) {
      ctx.addIssue({ code: "custom", path: ["quantizations"], message: "Duplicate quantization IDs" });
    }
    if (!quantizationIds.includes(model.recommendedQuantizationId)) {
      ctx.addIssue({
        code: "custom",
        path: ["recommendedQuantizationId"],
        message: "recommendedQuantizationId must reference a model quantization",
      });
    }
  });

export const ModelBenchmarkRecordSchema = z
  .strictObject({
    id,
    modelId: id,
    sourceId: id,
    methodologyVersion: z.string().min(1),
    measuredAt: isoDate,
    intelligenceScore: finite.optional(),
    intelligenceScale: z.strictObject({ min: finite, max: finite }).optional(),
    codingScore: finite.optional(),
    agenticScore: finite.optional(),
    longContextScore: finite.optional(),
    knowledgeReliabilityScore: finite.optional(),
    opennessScore: finite.optional(),
    outputTokensPerSecond: positive.optional(),
    timeToFirstTokenSeconds: nonNegative.optional(),
    timeToFirstAnswerTokenSeconds: nonNegative.optional(),
    endToEnd500TokensSeconds: nonNegative.optional(),
    averageOutputTokensPerTask: nonNegative.optional(),
    method: z.enum(["measured", "derived", "estimated"]),
  })
  .superRefine((benchmark, ctx) => {
    if (
      benchmark.intelligenceScale &&
      benchmark.intelligenceScale.min >= benchmark.intelligenceScale.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["intelligenceScale"],
        message: "Intelligence scale max must be greater than min",
      });
    }
  });

const PeakAiTopsSpecificationSchema = z.strictObject({
  value: positive,
  precision: z.string().min(1),
});

const GpuEvidenceRecordSchema = z.strictObject({
  kind: z.enum(["specification", "price", "system-qualification"]),
  label: z.string().min(1),
  url: z
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Evidence URL must use HTTP or HTTPS")
    .optional(),
  observedAt: isoDate,
  notes: z.string().min(1).optional(),
});

export const GpuRecordSchema = z
  .strictObject({
    id,
    name: z.string().min(1),
    vendor: z.string().min(1),
    vramGB: positive,
    memoryBandwidthGBps: positive,
    tdpWatts: positive,
    streetPriceUSD: nonNegative,
    interconnect: z.enum(["pcie", "nvlink", "unified", "other"]),
    supportedCounts: z.array(GpuCountSchema).min(1),
    supportsTensorParallel: z.boolean(),
    peakAiTops: PeakAiTopsSpecificationSchema.optional(),
    evidence: z.array(GpuEvidenceRecordSchema).min(1).optional(),
    notes: z.string().optional(),
  })
  .superRefine((gpu, ctx) => {
    if (
      gpu.peakAiTops &&
      !gpu.evidence?.some(
        (item) => item.kind === "specification" && item.url !== undefined,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Peak AI TOPS requires a dated specification evidence URL",
      });
    }
  });

export const InferenceProfileRecordSchema = z.strictObject({
  id,
  modelId: id,
  gpuId: id,
  quantizationId: id,
  gpuCount: GpuCountSchema,
  inputTokens: nonNegative,
  outputTokens: nonNegative,
  contextTokens: positiveInteger,
  concurrency: positiveInteger,
  effectiveTokensPerSecond: positive,
  outputTokensPerSecond: positive.optional(),
  timeToFirstTokenSeconds: nonNegative.optional(),
  framework: z.string().min(1).optional(),
  method: z.enum(["measured", "derived", "estimated"]),
  sourceUrl: z.url().optional(),
  lastUpdated: isoDate,
});

export const CloudPricingRecordSchema = z.strictObject({
  id,
  provider: z.string().min(1),
  modelId: id.optional(),
  modelName: z.string().min(1),
  currency: z.literal("USD"),
  inputPricePerMillionTokens: nonNegative,
  outputPricePerMillionTokens: nonNegative,
  cachedInputPricePerMillionTokens: nonNegative.optional(),
  cacheWritePricePerMillionTokens: nonNegative.optional(),
  sourceUrl: z.url().optional(),
  lastUpdated: isoDate,
});

const SimpleUseCaseDefaultsSchema = z.strictObject({
  labels: LocalizedTextSchema,
  averageInputTokens: nonNegative,
  averageOutputTokens: nonNegative,
  averageAgentSteps: positive,
  peakConcurrentUsersRatio: ratio,
  averageContextLength: positiveInteger,
  peakContextLength: positiveInteger,
});

const UsageFrequencyDefaultsSchema = z.strictObject({
  labels: LocalizedTextSchema,
  requestsPerUserPerWorkingDay: nonNegative,
  workingHoursPerDay: positive.max(24),
  workingDaysPerMonth: positive.max(31),
});

const efficiencyByCountSchema = z
  .record(z.string().regex(/^[1-9]\d*$/), positive.max(1))
  .refine((value) => Object.keys(value).length > 0, "At least one GPU count efficiency is required");

const CapabilityTierDefinitionSchema = z.strictObject({
  id: CapabilityTierIdSchema,
  labels: LocalizedTextSchema,
  rank: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  description: LocalizedTextSchema.optional(),
  example: LocalizedTextSchema.optional(),
  recommendationImpact: LocalizedTextSchema.optional(),
});

const WorkloadOptionDefinitionSchema = z.strictObject({
  labels: LocalizedTextSchema,
  description: LocalizedTextSchema,
  example: LocalizedTextSchema,
  recommendationImpact: LocalizedTextSchema,
});

const LatencyOptionDefinitionSchema = WorkloadOptionDefinitionSchema.extend({
  targetTimeToFirstTokenSeconds: positive,
});

const WorkloadDefinitionsSchema = z.strictObject({
  privacy: z.strictObject({
    low: WorkloadOptionDefinitionSchema,
    medium: WorkloadOptionDefinitionSchema,
    high: WorkloadOptionDefinitionSchema,
    critical: WorkloadOptionDefinitionSchema,
  }),
  latency: z.strictObject({
    "best-effort": LatencyOptionDefinitionSchema,
    interactive: LatencyOptionDefinitionSchema,
    fast: LatencyOptionDefinitionSchema,
    "real-time": LatencyOptionDefinitionSchema,
  }),
});

const nonEmptyRecord = <T extends z.ZodType>(valueSchema: T) =>
  z
    .record(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/), valueSchema)
    .refine((value) => Object.keys(value).length > 0, "At least one mapping is required");

function withLabels(
  mappings: unknown,
  fallback: Record<string, { en: string; "zh-CN": string }>,
): unknown {
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) return mappings;
  return Object.fromEntries(
    Object.entries(mappings).map(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [key, value];
      const record = { ...(value as Record<string, unknown>) };
      record.labels ??= fallback[key] ?? { en: key, "zh-CN": key };
      return [key, record];
    }),
  );
}

function migrateLegacyAssumptions(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const migrated = { ...(value as Record<string, unknown>) };
  migrated.capabilityTiers ??= DEFAULT_CAPABILITY_TIERS.map((tier) => ({
    ...tier,
    labels: { ...tier.labels },
  }));
  migrated.workloadDefinitions ??= structuredClone(DEFAULT_WORKLOAD_DEFINITIONS);

  if (migrated.vram && typeof migrated.vram === "object" && !Array.isArray(migrated.vram)) {
    const vram = { ...(migrated.vram as Record<string, unknown>) };
    if (
      vram.fallbackKvCacheBytesPerTokenByTier === undefined &&
      vram.fallbackKvCacheBytesPerTokenByClass !== undefined
    ) {
      vram.fallbackKvCacheBytesPerTokenByTier = vram.fallbackKvCacheBytesPerTokenByClass;
    }
    delete vram.fallbackKvCacheBytesPerTokenByClass;
    migrated.vram = vram;
  }

  if (
    migrated.simpleModeMappings &&
    typeof migrated.simpleModeMappings === "object" &&
    !Array.isArray(migrated.simpleModeMappings)
  ) {
    const mappings = { ...(migrated.simpleModeMappings as Record<string, unknown>) };
    mappings.useCases = withLabels(mappings.useCases, legacyUseCaseLabels);
    mappings.usageFrequency = withLabels(mappings.usageFrequency, legacyFrequencyLabels);
    migrated.simpleModeMappings = mappings;
  }
  return migrated;
}

export const AssumptionsRecordSchema = z
  .preprocess(migrateLegacyAssumptions, z.strictObject({
    currency: z.literal("USD"),
    capabilityTiers: z.array(CapabilityTierDefinitionSchema).min(1),
    workloadDefinitions: WorkloadDefinitionsSchema,
    economics: z.strictObject({
      electricityPricePerKWh: nonNegative,
      hardwareLifetimeMonths: positiveInteger,
      maintenanceCostMonthly: nonNegative,
      defaultUtilizationRatio: ratio,
      defaultCachedInputRatio: ratio,
      hostPurchasePriceUSD: nonNegative,
      hostIdlePowerWatts: nonNegative,
      hostLoadPowerWatts: nonNegative,
      gpuIdlePowerRatio: ratio,
    }),
    vram: z.strictObject({
      defaultRuntimeOverheadRatio: ratio,
      minimumRuntimeOverheadGB: nonNegative,
      safetyMarginRatio: ratio,
      fallbackKvCacheBytesPerTokenByTier: z.record(CapabilityTierIdSchema, positive),
      fitThresholds: z.strictObject({
        marginalCapacityRatio: positive,
        recommendedCapacityRatio: positive,
        comfortableCapacityRatio: positive,
      }),
    }),
    multiGpuEfficiency: z.strictObject({
      pcie: efficiencyByCountSchema,
      nvlink: efficiencyByCountSchema,
      unified: efficiencyByCountSchema,
      other: efficiencyByCountSchema,
    }),
    simpleModeMappings: z.strictObject({
      useCases: nonEmptyRecord(SimpleUseCaseDefaultsSchema),
      usageFrequency: nonEmptyRecord(UsageFrequencyDefaultsSchema),
      intelligence: nonEmptyRecord(
        z.strictObject({ startingClass: CapabilityTierIdSchema }),
      ),
    }),
    recommendation: z.strictObject({
      lowUtilizationRatio: ratio,
      highUtilizationRatio: ratio,
      maximumPreferredBreakEvenMonths: positive,
      highPrivacyLevels: z.array(z.enum(["high", "critical"])).min(1),
      minimumHybridLocalCoverageRatio: ratio,
      minimumMeaningfulSavingsRatio: ratio,
      costTieToleranceRatio: ratio,
    }),
  }))
  .superRefine((assumptions, ctx) => {
    if (assumptions.economics.hostLoadPowerWatts < assumptions.economics.hostIdlePowerWatts) {
      ctx.addIssue({
        code: "custom",
        path: ["economics", "hostLoadPowerWatts"],
        message: "hostLoadPowerWatts cannot be below hostIdlePowerWatts",
      });
    }
    const { marginalCapacityRatio, recommendedCapacityRatio, comfortableCapacityRatio } =
      assumptions.vram.fitThresholds;
    if (
      marginalCapacityRatio > recommendedCapacityRatio ||
      recommendedCapacityRatio > comfortableCapacityRatio
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["vram", "fitThresholds"],
        message: "Fit thresholds must be ordered marginal <= recommended <= comfortable",
      });
    }
    const tierIds = assumptions.capabilityTiers.map((tier) => tier.id);
    const tierRanks = assumptions.capabilityTiers.map((tier) => tier.rank);
    if (new Set(tierIds).size !== tierIds.length) {
      ctx.addIssue({ code: "custom", path: ["capabilityTiers"], message: "Capability tier IDs must be unique" });
    }
    if (new Set(tierRanks).size !== tierRanks.length) {
      ctx.addIssue({ code: "custom", path: ["capabilityTiers"], message: "Capability tier ranks must be unique" });
    }
    if (tierRanks.some((rank, index) => index > 0 && rank <= tierRanks[index - 1]!)) {
      ctx.addIssue({ code: "custom", path: ["capabilityTiers"], message: "Capability tiers must be ordered by ascending rank" });
    }
    const tierIdSet = new Set(tierIds);
    for (const tierId of tierIds) {
      if (assumptions.vram.fallbackKvCacheBytesPerTokenByTier[tierId] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["vram", "fallbackKvCacheBytesPerTokenByTier", tierId],
          message: `Missing KV-cache fallback for capability tier '${tierId}'`,
        });
      }
      if (assumptions.simpleModeMappings.intelligence[tierId] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["simpleModeMappings", "intelligence", tierId],
          message: `Missing Simple Mode capability mapping for tier '${tierId}'`,
        });
      }
    }
    for (const [tierId, mapping] of Object.entries(assumptions.simpleModeMappings.intelligence)) {
      if (!tierIdSet.has(tierId) || !tierIdSet.has(mapping.startingClass)) {
        ctx.addIssue({
          code: "custom",
          path: ["simpleModeMappings", "intelligence", tierId],
          message: "Intelligence mapping must reference configured capability tiers",
        });
      }
    }
  });

function migrateLegacyLocalizedText(value: unknown): unknown {
  return typeof value === "string" ? { en: value, "zh-CN": value } : value;
}

function migrateLegacyPreset(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const migrated = { ...(value as Record<string, unknown>) };
  migrated.name = migrateLegacyLocalizedText(migrated.name);
  migrated.description = migrateLegacyLocalizedText(migrated.description);
  migrated.workload = migrateLegacyWorkload(migrated.workload);
  return migrated;
}

export const PresetRecordSchema = z.preprocess(migrateLegacyPreset, z.strictObject({
  id,
  name: LocalizedTextSchema,
  description: LocalizedTextSchema,
  workload: WorkloadConfigBaseSchema.partial(),
  suggestedLocalCoverageRatio: ratio.optional(),
}));

export const ModelsCatalogSchema = CatalogEnvelopeSchema(ModelRecordSchema);
export const ModelBenchmarksCatalogSchema = CatalogEnvelopeSchema(ModelBenchmarkRecordSchema);
export const GpusCatalogSchema = CatalogEnvelopeSchema(GpuRecordSchema);
export const InferenceProfilesCatalogSchema = CatalogEnvelopeSchema(InferenceProfileRecordSchema);
export const CloudPricingCatalogSchema = CatalogEnvelopeSchema(CloudPricingRecordSchema);
export const AssumptionsCatalogSchema = CatalogEnvelopeSchema(AssumptionsRecordSchema);
export const PresetsCatalogSchema = CatalogEnvelopeSchema(PresetRecordSchema);
export { DesktopSystemsCatalogSchema, ExchangeRateCatalogSchema };

export class CatalogIntegrityError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Catalog integrity validation failed:\n${issues.join("\n")}`);
    this.name = "CatalogIntegrityError";
    this.issues = issues;
  }
}

function metadataOf<T>(catalog: CatalogEnvelope<T>): CatalogMetadata {
  return {
    catalogId: catalog.catalogId,
    lastUpdated: catalog.lastUpdated,
    source: catalog.source,
  };
}

function duplicateIds(items: Array<{ id: string }>, label: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates].map((duplicate) => `${label}: duplicate id '${duplicate}'`);
}

export function parseCatalogBundle(raw: RawCatalogBundle): NormalizedCatalogs {
  const manifest = DataManifestSchema.parse(raw.manifest);
  const models = ModelsCatalogSchema.parse(raw.models);
  const modelBenchmarks = ModelBenchmarksCatalogSchema.parse(raw.modelBenchmarks);
  const gpus = GpusCatalogSchema.parse(raw.gpus);
  const inferenceProfiles = InferenceProfilesCatalogSchema.parse(raw.inferenceProfiles);
  const cloudPricing = CloudPricingCatalogSchema.parse(raw.cloudPricing);
  const assumptions = AssumptionsCatalogSchema.parse(raw.assumptions);
  const presets = PresetsCatalogSchema.parse(raw.presets);
  const systems = DesktopSystemsCatalogSchema.parse(raw.systems);
  const exchangeRates = ExchangeRateCatalogSchema.parse(raw.exchangeRates);

  const issues = [
    ...duplicateIds(models.data, "models"),
    ...duplicateIds(modelBenchmarks.data, "modelBenchmarks"),
    ...duplicateIds(gpus.data, "gpus"),
    ...duplicateIds(inferenceProfiles.data, "inferenceProfiles"),
    ...duplicateIds(cloudPricing.data, "cloudPricing"),
    ...duplicateIds(presets.data, "presets"),
    ...duplicateIds(systems.data, "systems"),
  ];

  if (assumptions.data.length !== 1) {
    issues.push("assumptions: catalog must contain exactly one record");
  }

  const modelById = new Map(models.data.map((model) => [model.id, model]));
  const gpuIds = new Set(gpus.data.map((gpu) => gpu.id));
  const assumptionsRecord = assumptions.data[0];
  if (assumptionsRecord) {
    const capabilityTierIds = new Set(
      assumptionsRecord.capabilityTiers.map((tier) => tier.id),
    );
    const useCaseIds = new Set(
      Object.keys(assumptionsRecord.simpleModeMappings.useCases),
    );
    const frequencyIds = new Set(
      Object.keys(assumptionsRecord.simpleModeMappings.usageFrequency),
    );
    for (const model of models.data) {
      if (!capabilityTierIds.has(model.capabilityTierId)) {
        issues.push(
          `models: '${model.id}' references unknown capability tier '${model.capabilityTierId}'`,
        );
      }
    }
    for (const preset of presets.data) {
      if (preset.workload.useCase && !useCaseIds.has(preset.workload.useCase)) {
        issues.push(
          `presets: '${preset.id}' references unknown use-case mapping '${preset.workload.useCase}'`,
        );
      }
      if (
        preset.workload.usageFrequency &&
        !frequencyIds.has(preset.workload.usageFrequency)
      ) {
        issues.push(
          `presets: '${preset.id}' references unknown usage-frequency mapping '${preset.workload.usageFrequency}'`,
        );
      }
      if (
        preset.workload.capabilityRequirementTierId &&
        !capabilityTierIds.has(preset.workload.capabilityRequirementTierId)
      ) {
        issues.push(
          `presets: '${preset.id}' references unknown capability tier '${preset.workload.capabilityRequirementTierId}'`,
        );
      }
    }
  }
  for (const benchmark of modelBenchmarks.data) {
    if (!modelById.has(benchmark.modelId)) {
      issues.push(`modelBenchmarks: '${benchmark.id}' references unknown model '${benchmark.modelId}'`);
    }
  }
  for (const profile of inferenceProfiles.data) {
    const model = modelById.get(profile.modelId);
    if (!model) {
      issues.push(`inferenceProfiles: '${profile.id}' references unknown model '${profile.modelId}'`);
    } else if (!model.quantizations.some((quantization) => quantization.id === profile.quantizationId)) {
      issues.push(
        `inferenceProfiles: '${profile.id}' references unknown quantization '${profile.quantizationId}'`,
      );
    }
    if (!gpuIds.has(profile.gpuId)) {
      issues.push(`inferenceProfiles: '${profile.id}' references unknown GPU '${profile.gpuId}'`);
    }
  }
  for (const pricing of cloudPricing.data) {
    if (pricing.modelId && !modelById.has(pricing.modelId)) {
      issues.push(`cloudPricing: '${pricing.id}' references unknown model '${pricing.modelId}'`);
    }
  }
  for (const system of systems.data) {
    if (!system.performance) continue;
    const model = modelById.get(system.performance.modelId);
    if (!model) {
      issues.push(
        `systems: '${system.id}' performance references unknown model '${system.performance.modelId}'`,
      );
      continue;
    }
    if (
      system.performance.quantizationId &&
      !model.quantizations.some(
        (quantization) =>
          quantization.id === system.performance?.quantizationId,
      )
    ) {
      issues.push(
        `systems: '${system.id}' performance references unknown quantization '${system.performance.quantizationId}'`,
      );
    }
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);

  const metadata = {
    models: metadataOf(models),
    modelBenchmarks: metadataOf(modelBenchmarks),
    gpus: metadataOf(gpus),
    inferenceProfiles: metadataOf(inferenceProfiles),
    cloudPricing: metadataOf(cloudPricing),
    assumptions: metadataOf(assumptions),
    presets: metadataOf(presets),
    systems: metadataOf(systems),
    exchangeRates: {
      catalogId: "exchange-rates",
      lastUpdated: exchangeRates.lastUpdated,
      source: {
        label: exchangeRates.source.label,
        url: exchangeRates.source.url,
        methodology: exchangeRates.source.methodology,
      },
    },
  } satisfies Record<CatalogKey, CatalogMetadata>;

  return {
    dataVersion: manifest.dataVersion,
    models: models.data,
    modelBenchmarks: modelBenchmarks.data,
    gpus: gpus.data,
    inferenceProfiles: inferenceProfiles.data,
    cloudPricing: cloudPricing.data,
    assumptions: assumptions.data[0]!,
    presets: presets.data,
    systems: systems.data,
    exchangeRates,
    metadata,
  };
}
