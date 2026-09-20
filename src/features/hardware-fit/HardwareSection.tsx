import { Cpu, ExternalLink, Gauge, MemoryStick, TriangleAlert } from "lucide-react";
import type {
  AnalysisResult,
  ComputeHardwareRecord,
  CustomDesktopSystemDraft,
  GpuCount,
  GpuRecord,
} from "../../types";
import type { DesktopSystemRecord } from "../../systems";
import type { CurrencyCode, ExchangeRateCatalog } from "../../currency";
import { useI18n, type Locale, type Translate } from "../../i18n";
import {
  convertDisplayToUsd,
  convertUsdToDisplay,
  formatUsdAsCurrency,
} from "../../currency";
import { formatMemory, formatPercentage, formatTokens } from "../../utils";
import { createDefaultCustomSystemDraft } from "../../state";
import {
  Button,
  controlClassName,
  Field,
  InlineNotice,
  Metric,
  Panel,
  SectionHeading,
  SegmentedControl,
  StatusBadge,
  type Tone,
} from "../../components/ui/AdvisorUI";
import {
  LocalSystemConfigurator,
  type CatalogLocalSystem,
  type CustomLocalSystemDraft,
} from "../local-system";
import { formatNumber, sentenceCase } from "../advisor-ui/presentation";

const fitTone: Record<NonNullable<AnalysisResult["hardwareFit"]>["status"], Tone> = {
  "cannot-run": "red",
  marginal: "amber",
  recommended: "green",
  comfortable: "green",
};

const evidenceKindTranslationKey = {
  specification: "hardware.evidenceKind.specification",
  price: "hardware.evidenceKind.price",
  "system-qualification": "hardware.evidenceKind.system-qualification",
} as const;

function formatMemoryValue(value: number | null | undefined, t: Translate) {
  return value == null || !Number.isFinite(value)
    ? t("common.notAvailable")
    : formatMemory(value);
}

function formatPercentageValue(value: number | null | undefined, t: Translate) {
  return value == null || !Number.isFinite(value)
    ? t("common.notAvailable")
    : formatPercentage(value);
}

function formatTokenValue(value: number | null | undefined, t: Translate) {
  return value == null || !Number.isFinite(value)
    ? t("common.notAvailable")
    : formatTokens(value);
}

function asCatalogSystem(
  system: DesktopSystemRecord,
  locale: Locale,
  t: Translate,
): CatalogLocalSystem {
  return {
    id: system.id,
    name: system.name,
    vendor: system.vendor,
    memoryArchitecture: system.memoryArchitecture,
    systemMemoryType: system.systemMemoryType,
    systemRamGB: system.systemMemoryGB,
    acceleratorType: system.acceleratorType,
    acceleratorBehaviorCategory: system.acceleratorBehaviorCategory,
    acceleratorName: system.acceleratorModel,
    acceleratorCount: system.acceleratorCount,
    supportsModelSharding: system.supportsModelSharding,
    ...(system.memoryArchitecture === "dedicated"
      ? { dedicatedMemoryPerUnitGB: system.dedicatedMemoryGBPerDevice }
      : { allocatableUnifiedMemoryGB: system.allocatableUnifiedMemoryGB }),
    memoryBandwidthGBps: system.memoryBandwidthGBps,
    idlePowerWatts: system.systemIdleWatts,
    loadPowerWatts: system.systemLoadWatts,
    purchasePriceUSD: system.purchasePriceUSD,
    tops: system.peakTops?.value,
    topsPrecision: system.peakTops?.precision,
    effectiveTokensPerSecond: system.performance?.effectiveTokensPerSecond,
    runtimeSupportStatus: system.runtimeSupport.status,
    notes: `${t("localSystem.catalogEvidence", {
      quality: sentenceCase(system.dataQuality, locale),
      support: sentenceCase(system.runtimeSupport.status, locale),
    })}${system.notes ? ` ${system.notes}` : ""}`,
    lastUpdated: system.lastUpdated,
  };
}

function GpuConfiguration({
  selectedGpu,
  gpus,
  count,
  recommended,
  formatUsd,
  onGpuChange,
  onCountChange,
}: {
  selectedGpu: ComputeHardwareRecord | null;
  gpus: GpuRecord[];
  count: GpuCount;
  recommended: boolean;
  formatUsd: (value: number | null | undefined) => string;
  onGpuChange: (gpuId: string) => void;
  onCountChange: (count: GpuCount) => void;
}) {
  const { locale, t } = useI18n();
  const countOptions = selectedGpu
    ? [...new Set(selectedGpu.supportedCounts)].sort((left, right) => left - right)
    : [count];

  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2">
        <Cpu className="size-4.5 text-slate-600" aria-hidden="true" />
        <h3 className="font-bold text-slate-950">{t("hardware.gpuConfiguration")}</h3>
      </div>
      <div className="mt-5 grid gap-4">
        <Field label={t("hardware.gpuModel")} hint={recommended ? t("hardware.eligibleHint") : undefined}>
          <select aria-label={t("hardware.gpuModel")} className={controlClassName} value={selectedGpu?.id ?? ""} onChange={(event) => onGpuChange(event.target.value)}>
            <option value="" disabled>{t("hardware.selectGpu")}</option>
            {gpus.map((gpu) => <option key={gpu.id} value={gpu.id}>{gpu.vendor} {gpu.name} · {formatNumber(gpu.vramGB, 1, locale)} GB</option>)}
          </select>
        </Field>
        <Field label={t("hardware.gpuCount")} hint={t("hardware.physicalCountHint")}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2">
            {countOptions.map((value) => (
              <button key={value} type="button" aria-pressed={count === value} onClick={() => onCountChange(value)} className={`min-h-10 rounded-lg border text-sm font-bold transition ${count === value ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>
                {t("hardware.gpuCountValue", { count: formatNumber(value, 0, locale) })}
              </button>
            ))}
          </div>
        </Field>
        {selectedGpu && count > 1 && !selectedGpu.supportsTensorParallel ? (
          <InlineNotice tone="amber" title={t("hardware.unpooledMultiGpuTitle")}>
            {t("hardware.unpooledMultiGpuDescription")}
          </InlineNotice>
        ) : null}
        {selectedGpu ? (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Metric label={t("hardware.vramPerGpu")} value={formatMemoryValue(selectedGpu.vramGB, t)} />
              <Metric label={t("hardware.bandwidth")} value={`${formatNumber(selectedGpu.memoryBandwidthGBps, 0, locale)} GB/s`} />
              <Metric label={t("hardware.tdpPerGpu")} value={selectedGpu.tdpWatts == null ? t("common.notAvailable") : `${formatNumber(selectedGpu.tdpWatts, 0, locale)} W`} />
              <Metric label={t("hardware.streetPrice")} value={formatUsd(selectedGpu.streetPriceUSD)} />
              <Metric label={t("hardware.interconnect")} value={sentenceCase(selectedGpu.interconnect, locale)} />
              <Metric
                label={t("hardware.aiTops")}
                value={selectedGpu.peakAiTops ? `${formatNumber(selectedGpu.peakAiTops.value, 0, locale)} TOPS` : t("common.notAvailable")}
                note={selectedGpu.peakAiTops ? `${selectedGpu.peakAiTops.precision} · ${t("hardware.aiTopsNotTps")}` : undefined}
              />
              <Metric
                label={t("hardware.modelMemoryPooling")}
                value={selectedGpu.supportsTensorParallel ? t("hardware.poolingValidated") : t("hardware.poolingNotValidated")}
                className="col-span-2"
              />
            </div>
            {selectedGpu.evidence?.length ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                <h4 className="text-sm font-bold text-blue-950">{t("hardware.evidenceSources")}</h4>
                <ul className="mt-2 grid gap-2">
                  {selectedGpu.evidence.map((evidence, index) => (
                    <li key={`${evidence.kind}-${evidence.observedAt}-${index}`} className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {evidence.url ? (
                          <a className="inline-flex items-center gap-1 font-bold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950" href={evidence.url} target="_blank" rel="noreferrer">
                            {evidence.label}
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="font-bold text-slate-800">{evidence.label}</span>
                        )}
                        <span>{t(evidenceKindTranslationKey[evidence.kind])}</span>
                        <span>{t("hardware.evidenceChecked", { date: evidence.observedAt })}</span>
                      </div>
                      {evidence.notes ? <p className="mt-0.5">{evidence.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedGpu.notes ? (
              <InlineNotice tone="amber" title={t("hardware.catalogCaveatsTitle")}>
                {selectedGpu.notes}
              </InlineNotice>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function MemoryRequirementPanel({ analysis }: { analysis: AnalysisResult }) {
  const { t } = useI18n();
  const vram = analysis.vram;
  const kvLabel = analysis.selectedModel?.id.endsWith("-ai-fusion-2")
    ? t("hardware.kvCacheAiFusion2")
    : t("hardware.kvCache");
  const offloadGB = vram?.systemMemoryOffloadGB ?? 0;
  const ssdKvGB = vram?.ssdKvCacheOffloadGB ?? 0;
  const isFusion = analysis.selectedModel?.id.endsWith("-ai-fusion-2") ?? false;
  const rows: Array<[string, number | undefined]> = [
    [t("hardware.modelWeights"), vram?.modelWeightGB],
  ];
  if (offloadGB > 0) {
    rows.push(
      [t("hardware.systemMemoryOffload"), offloadGB],
      [t("hardware.gpuResidentWeights"), vram?.gpuResidentWeightGB],
    );
  }
  rows.push([kvLabel, vram?.totalKvCacheGB ?? vram?.kvCacheGB]);
  if (ssdKvGB > 0) {
    rows.push(
      [t("hardware.ssdKvCacheOffload"), ssdKvGB],
      [t("hardware.gpuResidentKvCache"), vram?.gpuResidentKvCacheGB],
    );
  }
  rows.push(
    [t("hardware.runtimeOverhead"), vram?.runtimeOverheadGB],
    [t("hardware.safetyMargin"), vram?.safetyMarginGB],
  );
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <MemoryStick className="size-4.5 text-slate-600" aria-hidden="true" />
        <h3 className="font-bold text-slate-950">{t("hardware.memoryRequirement")}</h3>
      </div>
      <dl className="divide-y divide-slate-100 px-5">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="flex items-center justify-between gap-4 py-3 text-sm">
            <dt className="font-medium text-slate-600">{label}</dt>
            <dd className="font-bold tabular-nums text-slate-950">{formatMemoryValue(value, t)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="font-bold text-slate-950">{t("hardware.recommendedMemory")}</dt>
          <dd className="text-2xl font-bold tracking-[-0.03em] tabular-nums text-slate-950">{formatMemoryValue(vram?.recommendedVramGB, t)}</dd>
        </div>
      </dl>
      {isFusion || offloadGB > 0 || ssdKvGB > 0 ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <InlineNotice tone="blue" title={t("hardware.fusionOffloadTitle")}>
            {t("hardware.fusionOffloadDescription", {
              ram: formatMemoryValue(offloadGB || 5, t),
              kv: formatMemoryValue(ssdKvGB || 1, t),
              safety: "5%",
            })}
          </InlineNotice>
        </div>
      ) : null}
    </Panel>
  );
}

function FitPanel({ analysis, onViewCalculation }: { analysis: AnalysisResult; onViewCalculation: () => void }) {
  const { locale, t } = useI18n();
  const fit = analysis.hardwareFit;
  return (
    <Panel tone={fit ? fitTone[fit.status] : "neutral"} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
          {fit?.status === "cannot-run" ? <TriangleAlert className="size-5 text-red-700" aria-hidden="true" /> : <Gauge className="size-5" aria-hidden="true" />}
        </span>
        {fit ? <StatusBadge tone={fitTone[fit.status]}>{sentenceCase(fit.status, locale)}</StatusBadge> : null}
      </div>
      <p className="mt-5 text-xs font-extrabold tracking-[0.08em] text-slate-500 uppercase">{t("hardware.memoryFitVerdict")}</p>
      <p className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">{fit ? sentenceCase(fit.status, locale) : t("hardware.incompleteInput")}</p>
      <div className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-200 py-4">
        <Metric label={t("hardware.available")} value={formatMemoryValue(fit?.availableVramGB, t)} />
        <Metric label={fit && fit.headroomGB < 0 ? t("hardware.shortfall") : t("hardware.headroom")} value={formatMemoryValue(fit ? Math.abs(fit.headroomGB) : null, t)} />
        <Metric label={t("hardware.capacityRatio")} value={formatPercentageValue(fit?.capacityRatio, t)} />
        <Metric label={t("hardware.scalingFactor")} value={fit ? `${formatNumber(fit.multiGpuPerformanceScale, 1, locale)}×` : t("common.notAvailable")} />
      </div>
      <InlineNotice tone="amber" title={t("hardware.capacityNotThroughput")}>
        {t("hardware.capacityNotice")}
      </InlineNotice>
      <Button variant="secondary" className="mt-4 w-full" disabled={!analysis.vram} onClick={onViewCalculation}>{t("hardware.viewMemoryCalculation")}</Button>
    </Panel>
  );
}

function PerformancePanel({ analysis }: { analysis: AnalysisResult }) {
  const { locale, t } = useI18n();
  const performance = analysis.performance;
  const utilization = performance?.workloadComputeUtilizationRatio ?? null;
  const overCapacity = utilization !== null && utilization > 1;
  const performanceAvailable =
    performance?.method !== undefined &&
    performance.method !== "unavailable" &&
    performance.effectiveTokensPerSecond !== null;
  return (
    <Panel className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Gauge className="size-4.5 text-slate-600" aria-hidden="true" />
          <div><h3 className="font-bold text-slate-950">{t("hardware.performanceCapacity")}</h3><p className="mt-0.5 text-xs text-slate-500">{t("hardware.performanceDescription")}</p></div>
        </div>
        <StatusBadge tone={!performanceAvailable ? "amber" : overCapacity ? "red" : "green"}>
          {!performanceAvailable ? t("hardware.noMatchingProfile") : overCapacity ? t("hardware.demandExceeds") : t("hardware.profile", { method: sentenceCase(performance.method, locale) })}
        </StatusBadge>
      </div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label={t("hardware.effectiveThroughput")} value={performance?.effectiveTokensPerSecond == null ? t("common.notAvailable") : `${formatNumber(performance.effectiveTokensPerSecond, 1, locale)} tok/s`} className="bg-white p-4" />
        <Metric label={t("hardware.outputGeneration")} value={performance?.outputTokensPerSecond == null ? t("common.notAvailable") : `${formatNumber(performance.outputTokensPerSecond, 1, locale)} tok/s`} className="bg-white p-4" />
        <Metric label={t("hardware.firstToken")} value={performance?.timeToFirstTokenSeconds == null ? t("common.notAvailable") : `${formatNumber(performance.timeToFirstTokenSeconds, 2, locale)} s`} className="bg-white p-4" />
        <Metric label={t("hardware.monthlyCapacity")} value={formatTokenValue(performance?.monthlyTokenCapacity, t)} className="bg-white p-4" />
        <Metric label={t("hardware.workloadUtilization")} value={formatPercentageValue(utilization, t)} note={t("hardware.derivedDemand")} className="bg-white p-4" />
        <Metric label={t("hardware.peakConcurrency")} value={formatNumber(analysis.config.workload.peakConcurrentUsers, 0, locale)} note={t("hardware.concurrentSequences")} className="bg-white p-4" />
      </div>
      {overCapacity ? <div className="border-t border-red-200 bg-red-50 px-5 py-4"><InlineNotice tone="red" title={t("hardware.insufficientTitle")}>{t("hardware.insufficientDescription")}</InlineNotice></div> : !performanceAvailable ? <div className="border-t border-amber-200 bg-amber-50 px-5 py-4"><InlineNotice tone="amber" title={t("hardware.performanceUnavailableTitle")}>{t("hardware.performanceUnavailableDescription")}</InlineNotice></div> : null}
    </Panel>
  );
}

export function HardwareSection({
  analysis,
  gpus,
  systems,
  browserSystems = [],
  currency,
  exchangeRates,
  onModeChange,
  onGpuChange,
  onCountChange,
  onSystemInputModeChange,
  onSystemChange,
  onCustomSystemChange,
  customSystemLibraryErrors,
  editingBrowserSystemId,
  onSaveCustomSystem,
  onEditBrowserSystem,
  onCancelBrowserSystemEdit,
  onDeleteBrowserSystem,
  onViewCalculation,
}: {
  analysis: AnalysisResult;
  gpus: GpuRecord[];
  systems: DesktopSystemRecord[];
  browserSystems?: DesktopSystemRecord[];
  currency: CurrencyCode;
  exchangeRates: ExchangeRateCatalog;
  onModeChange: (mode: "existing" | "recommended" | "system") => void;
  onGpuChange: (gpuId: string) => void;
  onCountChange: (count: GpuCount) => void;
  onSystemInputModeChange: (mode: "catalog" | "custom") => void;
  onSystemChange: (systemId: string) => void;
  onCustomSystemChange: (patch: Partial<CustomDesktopSystemDraft>) => void;
  customSystemLibraryErrors?: Partial<Record<keyof CustomDesktopSystemDraft, string>>;
  editingBrowserSystemId?: string | null;
  onSaveCustomSystem?: () => void;
  onEditBrowserSystem?: (systemId: string) => void;
  onCancelBrowserSystemEdit?: () => void;
  onDeleteBrowserSystem?: (systemId: string) => void;
  onViewCalculation: () => void;
}) {
  const { locale, t } = useI18n();
  const mode = analysis.config.hardwareSelection.mode;
  const selectedCatalogGpu =
    mode === "system"
      ? null
      : gpus.find((gpu) => gpu.id === analysis.selectedGpu?.id) ?? null;
  const customSystem = analysis.config.hardwareSelection.customSystem ?? createDefaultCustomSystemDraft();
  const browserSystemIds = new Set(browserSystems.map((system) => system.id));
  const dataPackSystems = systems.filter((system) => !browserSystemIds.has(system.id));
  const displayCustom: CustomLocalSystemDraft = {
    ...customSystem,
    purchasePriceDisplay: customSystem.purchasePriceUSD === null ? null : convertUsdToDisplay(customSystem.purchasePriceUSD, currency, exchangeRates),
  };
  const formatUsd = (value: number | null | undefined) =>
    value == null
      ? t("common.notAvailable")
      : formatUsdAsCurrency(value, currency, exchangeRates, { locale });
  const updateCustom = (patch: Partial<CustomLocalSystemDraft>) => {
    const { purchasePriceDisplay: _purchasePriceDisplay, ...otherPatch } = patch;
    const next: Partial<CustomDesktopSystemDraft> = { ...otherPatch };
    if ("purchasePriceDisplay" in patch) {
      next.purchasePriceUSD = patch.purchasePriceDisplay === null || patch.purchasePriceDisplay === undefined
        ? null
        : convertDisplayToUsd(patch.purchasePriceDisplay, currency, exchangeRates);
    }
    if (
      "effectiveTokensPerSecond" in patch ||
      "timeToFirstTokenSeconds" in patch
    ) {
      const nextTps =
        "effectiveTokensPerSecond" in patch
          ? patch.effectiveTokensPerSecond ?? null
          : customSystem.effectiveTokensPerSecond;
      const nextTtft =
        "timeToFirstTokenSeconds" in patch
          ? patch.timeToFirstTokenSeconds ?? null
          : customSystem.timeToFirstTokenSeconds;
      const hasObservation = nextTps !== null || nextTtft !== null;
      next.performanceModelId = hasObservation
        ? analysis.selectedModel?.id ?? null
        : null;
      next.performanceQuantizationId = hasObservation
        ? analysis.selectedQuantization?.id ?? null
        : null;
      next.performanceContextTokens = hasObservation
        ? analysis.config.workload.averageContextLength
        : null;
      next.performanceConcurrency = hasObservation
        ? analysis.config.workload.peakConcurrentUsers
        : null;
    }
    onCustomSystemChange(next);
  };

  return (
    <section id="hardware" className="advisor-section">
      <SectionHeading id="hardware-heading" title={t("hardware.title")} description={t("hardware.description")} />
      <Panel className="mb-5 p-4">
        <div className="overflow-x-auto pb-1">
          <SegmentedControl label={t("hardware.selectionMode")} className="flex min-w-max sm:w-full sm:min-w-0" value={mode} onChange={onModeChange} options={[{ value: "existing", label: t("hardware.gpuBuild") }, { value: "recommended", label: t("hardware.findGpu") }, { value: "system", label: t("hardware.desktopSystem") }]} />
        </div>
        {analysis.config.analysisMode === "configuration-first" && mode === "recommended" ? (
          <div className="mt-3">
            <InlineNotice tone="amber" title={t("hardware.configurationFirstFallbackTitle")}>
              {t("hardware.configurationFirstFallbackDescription")}
            </InlineNotice>
          </div>
        ) : null}
      </Panel>

      {mode === "system" ? (
        <LocalSystemConfigurator
          mode={analysis.config.hardwareSelection.systemInputMode ?? "catalog"}
          catalogSystems={dataPackSystems.map((system) => asCatalogSystem(system, locale, t))}
          browserSystems={browserSystems.map((system) => asCatalogSystem(system, locale, t))}
          selectedSystemId={analysis.config.hardwareSelection.systemId ?? systems[0]?.id}
          customSystem={displayCustom}
          errors={{
            ...(analysis.systemValidationErrors as Partial<Record<keyof CustomLocalSystemDraft, string>>),
            ...(customSystemLibraryErrors as Partial<Record<keyof CustomLocalSystemDraft, string>>),
            ...(analysis.systemValidationErrors.purchasePriceUSD
              ? { purchasePriceDisplay: analysis.systemValidationErrors.purchasePriceUSD }
              : {}),
          }}
          onModeChange={onSystemInputModeChange}
          onCatalogSystemChange={onSystemChange}
          onCustomSystemChange={updateCustom}
          onSaveCustomSystem={onSaveCustomSystem}
          onEditBrowserSystem={onEditBrowserSystem}
          onCancelBrowserSystemEdit={onCancelBrowserSystemEdit}
          onDeleteBrowserSystem={onDeleteBrowserSystem}
          editingBrowserSystemId={editingBrowserSystemId}
          formatUsd={formatUsd}
          purchaseCurrency={currency}
          performanceBindingLabel={
            customSystem.performanceModelId
              ? t("localSystem.bindingFull", {
                  model: customSystem.performanceModelId,
                  quantization: customSystem.performanceQuantizationId ?? t("localSystem.quantizationUnknown"),
                  context: formatNumber(customSystem.performanceContextTokens, 0, locale),
                  concurrency: formatNumber(customSystem.performanceConcurrency, 0, locale),
                })
              : analysis.selectedModel
                ? `${analysis.selectedModel.name} / ${analysis.selectedQuantization?.label ?? t("localSystem.selectedQuantization")}`
                : undefined
          }
        />
      ) : null}

      <div className={`grid gap-5 ${mode === "system" ? "mt-5 xl:grid-cols-2" : "xl:grid-cols-3"}`}>
        {mode !== "system" ? <GpuConfiguration selectedGpu={selectedCatalogGpu} gpus={gpus} count={analysis.config.hardwareSelection.gpuCount} recommended={mode === "recommended"} formatUsd={formatUsd} onGpuChange={onGpuChange} onCountChange={onCountChange} /> : null}
        <MemoryRequirementPanel analysis={analysis} />
        <FitPanel analysis={analysis} onViewCalculation={onViewCalculation} />
      </div>
      <PerformancePanel analysis={analysis} />
    </section>
  );
}
