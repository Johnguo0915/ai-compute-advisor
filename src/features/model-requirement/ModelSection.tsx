import { useId, useState, type ChangeEvent, type ReactNode } from "react";
import {
  BrainCircuit,
  Check,
  Database,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type {
  AnalysisResult,
  CapabilityTierDefinition,
  CatalogSource,
  CloudPricingRecord,
  ModelBenchmarkRecord,
  ModelRecord,
} from "../../types";
import { formatMemory, formatTokens } from "../../utils";
import type { CurrencyCode, ExchangeRateCatalog } from "../../currency";
import { useI18n } from "../../i18n";
import type { LocalModelDraft } from "../../state/localModelLibrary";
import { ModelComparisonChart } from "../../components/charts/ModelComparisonChart";
import {
  Button,
  controlClassName,
  Field,
  InlineNotice,
  Metric,
  Panel,
  SectionHeading,
  StatusBadge,
} from "../../components/ui/AdvisorUI";
import type { ModelComparisonView } from "../advisor-ui/viewModels";
import {
  formatNumber,
  reasonLabel,
  sentenceCase,
} from "../advisor-ui/presentation";
import { isSameBenchmarkCohort } from "./intelligenceMethodology";
import {
  modelSelectorOptionLabel,
  sortModelsForSelector,
} from "./modelSelectorOptions";

export type LocalModelEditorStatus =
  "idle" | "editing" | "saving" | "saved" | "deleting" | "error";

export interface LocalModelEditorErrors {
  summary?: string;
  /** Dot paths such as `name`, `quantizations.0.label`, or `cloudPricing.provider`. */
  fields?: Readonly<Record<string, string>>;
}

export interface ModelSectionProps {
  analysis: AnalysisResult;
  capabilityTiers: CapabilityTierDefinition[];
  models: ModelRecord[];
  benchmarks: ModelBenchmarkRecord[];
  pricing: CloudPricingRecord[];
  modelLastUpdated?: string;
  modelCatalogSource?: CatalogSource;
  currency: CurrencyCode;
  exchangeRates: ExchangeRateCatalog;
  onSelectModel: (modelId: string) => void;
  onSelectQuantization: (quantizationId: string) => void;
  onUseRecommendation: () => void;
  onViewCalculation: () => void;
  /** IDs merged from the browser library; every remaining model is read-only Data Pack data. */
  localModelIds?: readonly string[];
  localModelDraft?: LocalModelDraft | null;
  editingLocalModelId?: string | null;
  localModelStatus?: LocalModelEditorStatus;
  localModelErrors?: LocalModelEditorErrors | null;
  onLocalModelDraftChange?: (draft: LocalModelDraft) => void;
  onBeginAddLocalModel?: () => void;
  onBeginUpdateLocalModel?: (modelId: string) => void;
  onSaveLocalModel?: (
    draft: LocalModelDraft,
    editingModelId: string | null,
  ) => void;
  onDeleteLocalModel?: (modelId: string) => void;
  onCancelLocalModelEdit?: () => void;
  externalComparisonPanel?: ReactNode;
}

function latestBenchmark(
  benchmarks: ModelBenchmarkRecord[],
  modelId?: string,
): ModelBenchmarkRecord | undefined {
  return benchmarks
    .filter((benchmark) => !modelId || benchmark.modelId === modelId)
    .reduce<ModelBenchmarkRecord | undefined>((latest, benchmark) => {
      if (!latest) return benchmark;
      const latestTime = Date.parse(latest.measuredAt);
      const benchmarkTime = Date.parse(benchmark.measuredAt);
      return benchmarkTime > latestTime ? benchmark : latest;
    }, undefined);
}

function selectBenchmarkCohort(
  benchmarks: ModelBenchmarkRecord[],
  selectedModelId?: string,
): ModelBenchmarkRecord[] {
  const cohortAnchor =
    latestBenchmark(benchmarks, selectedModelId) ?? latestBenchmark(benchmarks);
  if (!cohortAnchor) return [];

  return benchmarks.filter(
    (benchmark) => isSameBenchmarkCohort(benchmark, cohortAnchor),
  );
}

function buildComparisonModels(
  models: ModelRecord[],
  benchmarks: ModelBenchmarkRecord[],
  pricing: CloudPricingRecord[],
  analysis: AnalysisResult,
): Array<
  ModelComparisonView & {
    priceProvider: string | null;
    priceSourceUrl: string | null;
    priceLastUpdated: string | null;
    benchmarkSourceId: string | null;
    benchmarkMeasuredAt: string | null;
    benchmarkMethodology: string | null;
    benchmarkScaleMin: number | null;
    benchmarkScaleMax: number | null;
  }
> {
  const selectedId = analysis.selectedModel?.id;
  const cohortBenchmarks = selectBenchmarkCohort(benchmarks, selectedId);
  const preferredIds = [
    selectedId,
    ...analysis.modelRequirement.eligibleModelIds,
    ...models.map((model) => model.id),
  ].filter((id): id is string => Boolean(id));
  const uniqueIds = [...new Set(preferredIds)].slice(0, 5);

  return uniqueIds
    .map((id) => models.find((model) => model.id === id))
    .filter((model): model is ModelRecord => Boolean(model))
    .map((model) => {
      const benchmark = latestBenchmark(cohortBenchmarks, model.id);
      const cloud = pricing
        .filter((item) => item.modelId === model.id)
        .sort(
          (left, right) =>
            left.inputPricePerMillionTokens - right.inputPricePerMillionTokens,
        )[0];
      return {
        id: model.id,
        name: model.name,
        provider: model.provider,
        selected: model.id === selectedId,
        recommended: analysis.modelRequirement.eligibleModelIds[0] === model.id,
        intelligence: benchmark?.intelligenceScore ?? null,
        context: model.contextWindowTokens,
        size: model.totalParametersB,
        price: cloud?.inputPricePerMillionTokens ?? null,
        priceProvider: cloud?.provider ?? null,
        priceSourceUrl: cloud?.sourceUrl ?? null,
        priceLastUpdated: cloud?.lastUpdated ?? null,
        speed: benchmark?.outputTokensPerSecond ?? null,
        latency: benchmark?.timeToFirstTokenSeconds ?? null,
        benchmarkSourceId: benchmark?.sourceId ?? null,
        benchmarkMeasuredAt: benchmark?.measuredAt ?? null,
        benchmarkMethodology: benchmark?.methodologyVersion ?? null,
        benchmarkScaleMin: benchmark?.intelligenceScale?.min ?? null,
        benchmarkScaleMax: benchmark?.intelligenceScale?.max ?? null,
      };
    });
}

function nullableNumber(event: ChangeEvent<HTMLInputElement>): number | null {
  if (event.currentTarget.value === "") return null;
  const value = event.currentTarget.valueAsNumber;
  return Number.isFinite(value) ? value : null;
}

function LocalModelEditor({
  draft,
  capabilityTiers,
  editingModelId,
  status,
  errors,
  onChange,
  onSave,
  onCancel,
}: {
  draft: LocalModelDraft;
  capabilityTiers: CapabilityTierDefinition[];
  editingModelId: string | null;
  status: LocalModelEditorStatus;
  errors?: LocalModelEditorErrors | null;
  onChange?: (draft: LocalModelDraft) => void;
  onSave?: (draft: LocalModelDraft, editingModelId: string | null) => void;
  onCancel?: () => void;
}) {
  const { locale, t } = useI18n();
  const quantizationGroupId = useId();
  const busy = status === "saving" || status === "deleting";
  const fieldError = (path: string) => errors?.fields?.[path];
  const change = <Key extends keyof LocalModelDraft>(
    key: Key,
    value: LocalModelDraft[Key],
  ) => onChange?.({ ...draft, [key]: value });
  const changePricing = (patch: Partial<LocalModelDraft["cloudPricing"]>) =>
    change("cloudPricing", {
      ...draft.cloudPricing,
      ...patch,
    });
  const updateQuantization = (
    index: number,
    patch: Partial<LocalModelDraft["quantizations"][number]>,
  ) => {
    const previous = draft.quantizations[index];
    if (!previous) return;
    const next = draft.quantizations.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    );
    const nextRecommendedId =
      patch.id !== undefined && previous.id === draft.recommendedQuantizationId
        ? patch.id
        : draft.recommendedQuantizationId;
    onChange?.({
      ...draft,
      quantizations: next,
      recommendedQuantizationId: nextRecommendedId,
    });
  };
  const addQuantization = () => {
    const ids = new Set(draft.quantizations.map((item) => item.id));
    let index = draft.quantizations.length + 1;
    while (ids.has(`q-custom-${index}`)) index += 1;
    const id = `q-custom-${index}`;
    change("quantizations", [
      ...draft.quantizations,
      {
        id,
        label: t("model.local.quantizationDefaultLabel", { index }),
        bitsPerParameter: 4,
        packingOverheadRatio: 0.1,
      },
    ]);
  };
  const removeQuantization = (index: number) => {
    if (draft.quantizations.length <= 1) return;
    const removed = draft.quantizations[index];
    const next = draft.quantizations.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    onChange?.({
      ...draft,
      quantizations: next,
      recommendedQuantizationId:
        removed?.id === draft.recommendedQuantizationId
          ? (next[0]?.id ?? "")
          : draft.recommendedQuantizationId,
    });
  };
  const toggleModality = (
    modality: LocalModelDraft["modalities"][number],
    enabled: boolean,
  ) => {
    if (enabled) {
      change("modalities", [...new Set([...draft.modalities, modality])]);
      return;
    }
    if (draft.modalities.length > 1) {
      change(
        "modalities",
        draft.modalities.filter((item) => item !== modality),
      );
    }
  };
  const statusBadge =
    status === "saving" ? (
      <StatusBadge tone="blue">{t("model.local.status.saving")}</StatusBadge>
    ) : status === "saved" ? (
      <StatusBadge tone="green">{t("model.local.status.saved")}</StatusBadge>
    ) : status === "deleting" ? (
      <StatusBadge tone="amber">{t("model.local.status.deleting")}</StatusBadge>
    ) : status === "error" ? (
      <StatusBadge tone="red">{t("model.local.status.error")}</StatusBadge>
    ) : null;

  return (
    <Panel className="mt-5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-950">
              {editingModelId
                ? t("model.local.editTitle")
                : t("model.local.addTitle")}
            </h3>
            {statusBadge}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            {t("model.local.editorDescription")}
          </p>
        </div>
        <Button variant="ghost" onClick={onCancel} disabled={busy || !onCancel}>
          <X className="size-4" aria-hidden="true" />
          {t("model.local.cancel")}
        </Button>
      </div>

      <form
        className="grid gap-6 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave?.(draft, editingModelId);
        }}
      >
        {errors?.summary ? (
          <InlineNotice tone="red" title={t("model.local.checkFields")}>
            {errors.summary}
          </InlineNotice>
        ) : null}

        <fieldset disabled={busy || !onChange} className="grid gap-4">
          <legend className="mb-3 text-sm font-bold text-slate-950">
            {t("model.local.identityAndCapability")}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field
              label={t("model.local.libraryId")}
              hint={t("model.local.libraryIdHint")}
              error={fieldError("id")}
            >
              <input
                aria-label={t("model.local.libraryId")}
                aria-invalid={Boolean(fieldError("id")) || undefined}
                className={controlClassName}
                value={draft.id}
                disabled={Boolean(editingModelId)}
                onChange={(event) => change("id", event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label={t("model.local.name")} error={fieldError("name")}>
              <input
                aria-label={t("model.local.name")}
                aria-invalid={Boolean(fieldError("name")) || undefined}
                className={controlClassName}
                value={draft.name}
                onChange={(event) => change("name", event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field
              label={t("model.local.modelProvider")}
              error={fieldError("provider")}
            >
              <input
                aria-label={t("model.local.modelProvider")}
                aria-invalid={Boolean(fieldError("provider")) || undefined}
                className={controlClassName}
                value={draft.provider}
                onChange={(event) => change("provider", event.target.value)}
                autoComplete="organization"
              />
            </Field>
            <Field label={t("model.local.family")} error={fieldError("family")}>
              <input
                aria-label={t("model.local.family")}
                aria-invalid={Boolean(fieldError("family")) || undefined}
                className={controlClassName}
                value={draft.family}
                onChange={(event) => change("family", event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field
              label={t("model.local.modelType")}
              error={fieldError("modelType")}
            >
              <select
                aria-label={t("model.local.modelType")}
                className={controlClassName}
                value={draft.modelType}
                onChange={(event) =>
                  change("modelType", event.target.value as "dense" | "moe")
                }
              >
                <option value="dense">{t("model.local.dense")}</option>
                <option value="moe">{t("model.local.moe")}</option>
              </select>
            </Field>
            <Field
              label={t("model.local.totalParameters")}
              hint={t("model.local.billionsHint")}
              error={fieldError("totalParametersB")}
            >
              <input
                aria-label={t("model.local.totalParameters")}
                aria-invalid={
                  Boolean(fieldError("totalParametersB")) || undefined
                }
                className={controlClassName}
                type="number"
                min="0"
                step="0.1"
                value={draft.totalParametersB ?? ""}
                onChange={(event) =>
                  change("totalParametersB", nullableNumber(event))
                }
              />
            </Field>
            <Field
              label={t("model.local.activeParameters")}
              hint={t("model.local.activeParametersHint")}
              error={fieldError("activeParametersB")}
            >
              <input
                aria-label={t("model.local.activeParameters")}
                aria-invalid={
                  Boolean(fieldError("activeParametersB")) || undefined
                }
                className={controlClassName}
                type="number"
                min="0"
                step="0.1"
                value={draft.activeParametersB ?? ""}
                onChange={(event) =>
                  change("activeParametersB", nullableNumber(event))
                }
              />
            </Field>
            <Field
              label={t("model.local.contextWindow")}
              error={fieldError("contextWindowTokens")}
            >
              <input
                aria-label={t("model.local.contextWindow")}
                aria-invalid={
                  Boolean(fieldError("contextWindowTokens")) || undefined
                }
                className={controlClassName}
                type="number"
                min="1"
                step="1"
                value={draft.contextWindowTokens ?? ""}
                onChange={(event) =>
                  change("contextWindowTokens", nullableNumber(event))
                }
              />
            </Field>
            <Field
              label={t("model.local.maxOutput")}
              hint={t("common.optional")}
              error={fieldError("maxOutputTokens")}
            >
              <input
                aria-label={t("model.local.maxOutput")}
                aria-invalid={
                  Boolean(fieldError("maxOutputTokens")) || undefined
                }
                className={controlClassName}
                type="number"
                min="1"
                step="1"
                value={draft.maxOutputTokens ?? ""}
                onChange={(event) =>
                  change("maxOutputTokens", nullableNumber(event))
                }
              />
            </Field>
            <Field
              label={t("model.local.kvCacheBytesPerToken")}
              hint={t("common.optional")}
              error={fieldError("kvCacheBytesPerToken")}
            >
              <input
                aria-label={t("model.local.kvCacheBytesPerToken")}
                aria-invalid={
                  Boolean(fieldError("kvCacheBytesPerToken")) || undefined
                }
                className={controlClassName}
                type="number"
                min="0.1"
                step="0.1"
                value={draft.kvCacheBytesPerToken ?? ""}
                onChange={(event) =>
                  change("kvCacheBytesPerToken", nullableNumber(event))
                }
              />
            </Field>
            <Field
              label={t("model.local.capabilityTier")}
              error={fieldError("capabilityTierId")}
            >
              <select
                aria-label={t("model.local.capabilityTier")}
                className={controlClassName}
                value={draft.capabilityTierId}
                onChange={(event) =>
                  change("capabilityTierId", event.target.value)
                }
              >
                {[...capabilityTiers]
                  .sort((left, right) => left.rank - right.rank)
                  .map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.labels[locale] ?? tier.labels.en}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label={t("model.local.commercialUse")}
              error={fieldError("commercialUse")}
            >
              <select
                aria-label={t("model.local.commercialUse")}
                className={controlClassName}
                value={draft.commercialUse}
                onChange={(event) =>
                  change(
                    "commercialUse",
                    event.target.value as LocalModelDraft["commercialUse"],
                  )
                }
              >
                <option value="allowed">{t("model.local.allowed")}</option>
                <option value="restricted">
                  {t("model.local.restricted")}
                </option>
                <option value="unknown">{t("model.local.unknown")}</option>
              </select>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">
              {t("model.local.modalities")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {(
                [
                  ["text", t("model.local.modality.text")],
                  ["image", t("model.local.modality.image")],
                  ["audio", t("model.local.modality.audio")],
                  ["video", t("model.local.modality.video")],
                ] as const
              ).map(([modality, label]) => (
                <label
                  key={modality}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    checked={draft.modalities.includes(modality)}
                    onChange={(event) =>
                      toggleModality(modality, event.target.checked)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {(
              [
                ["reasoning", t("model.local.reasoningModel")],
                ["openWeight", t("model.local.openWeightModel")],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  checked={draft[key]}
                  onChange={(event) => change(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>

          <Field label={t("model.local.notes")} hint={t("common.optional")}>
            <textarea
              aria-label={t("model.local.notes")}
              className={`${controlClassName} min-h-24 py-2`}
              value={draft.notes}
              onChange={(event) => change("notes", event.target.value)}
            />
          </Field>
        </fieldset>

        <fieldset
          disabled={busy || !onChange}
          className="border-t border-slate-200 pt-5"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <legend className="text-sm font-bold text-slate-950">
                {t("model.local.quantizations")}
              </legend>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("model.local.quantizationDescription")}
              </p>
            </div>
            <Button variant="secondary" onClick={addQuantization}>
              <Plus className="size-4" aria-hidden="true" />
              {t("model.local.addQuantization")}
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {draft.quantizations.map((quantization, index) => (
              <div
                key={`${index}-${quantization.id}`}
                className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(120px,0.7fr)_minmax(140px,1fr)_minmax(130px,0.7fr)_minmax(150px,0.8fr)_auto] xl:items-start"
              >
                <Field
                  label={t("model.local.quantizationId")}
                  error={fieldError(`quantizations.${index}.id`)}
                >
                  <input
                    aria-label={t("model.local.quantizationId")}
                    className={controlClassName}
                    value={quantization.id}
                    onChange={(event) =>
                      updateQuantization(index, { id: event.target.value })
                    }
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label={t("model.local.quantizationLabel")}
                  error={fieldError(`quantizations.${index}.label`)}
                >
                  <input
                    aria-label={t("model.local.quantizationLabel")}
                    className={controlClassName}
                    value={quantization.label}
                    onChange={(event) =>
                      updateQuantization(index, { label: event.target.value })
                    }
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label={t("model.local.bitsPerParameter")}
                  error={fieldError(`quantizations.${index}.bitsPerParameter`)}
                >
                  <input
                    aria-label={t("model.local.bitsPerParameter")}
                    className={controlClassName}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={quantization.bitsPerParameter}
                    onChange={(event) =>
                      updateQuantization(index, {
                        bitsPerParameter: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </Field>
                <Field
                  label={t("model.local.packingOverhead")}
                  hint={t("model.local.percentHint")}
                  error={fieldError(
                    `quantizations.${index}.packingOverheadRatio`,
                  )}
                >
                  <input
                    aria-label={t("model.local.packingOverhead")}
                    className={controlClassName}
                    type="number"
                    min="0"
                    step="0.1"
                    value={quantization.packingOverheadRatio * 100}
                    onChange={(event) =>
                      updateQuantization(index, {
                        packingOverheadRatio:
                          event.currentTarget.valueAsNumber / 100,
                      })
                    }
                  />
                </Field>
                <div className="flex min-h-10 items-center justify-between gap-2 xl:pt-[1.35rem]">
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                    <input
                      type="radio"
                      name={`${quantizationGroupId}-recommended`}
                      checked={
                        draft.recommendedQuantizationId === quantization.id
                      }
                      onChange={() =>
                        change("recommendedQuantizationId", quantization.id)
                      }
                    />
                    {t("model.local.recommendedShort")}
                  </label>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-lg border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("model.local.removeQuantization", {
                      label: quantization.label || quantization.id,
                    })}
                    disabled={draft.quantizations.length <= 1}
                    onClick={() => removeQuantization(index)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset
          disabled={busy || !onChange}
          className="border-t border-slate-200 pt-5"
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              checked={draft.cloudPricing.enabled}
              onChange={(event) =>
                changePricing({ enabled: event.target.checked })
              }
            />
            <span>
              <span className="block text-sm font-bold text-slate-950">
                {t("model.local.cloudPriceTitle")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                {t("model.local.cloudPriceDescription")}
              </span>
            </span>
          </label>

          {draft.cloudPricing.enabled ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field
                label={t("model.local.priceProvider")}
                error={fieldError("cloudPricing.provider")}
              >
                <input
                  aria-label={t("model.local.priceProvider")}
                  className={controlClassName}
                  value={draft.cloudPricing.provider}
                  onChange={(event) =>
                    changePricing({ provider: event.target.value })
                  }
                  autoComplete="organization"
                />
              </Field>
              <Field
                label={t("model.local.priceDate")}
                error={fieldError("cloudPricing.lastUpdated")}
              >
                <input
                  aria-label={t("model.local.priceDate")}
                  className={controlClassName}
                  type="date"
                  value={draft.cloudPricing.lastUpdated}
                  onChange={(event) =>
                    changePricing({ lastUpdated: event.target.value })
                  }
                />
              </Field>
              <Field
                label={t("model.local.sourceUrl")}
                error={fieldError("cloudPricing.sourceUrl")}
                className="sm:col-span-2"
              >
                <input
                  aria-label={t("model.local.sourceUrl")}
                  className={controlClassName}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={draft.cloudPricing.sourceUrl}
                  onChange={(event) =>
                    changePricing({ sourceUrl: event.target.value })
                  }
                  autoComplete="url"
                />
              </Field>
              {(
                [
                  ["inputPricePerMillionTokens", t("model.local.inputPrice")],
                  ["outputPricePerMillionTokens", t("model.local.outputPrice")],
                  [
                    "cachedInputPricePerMillionTokens",
                    t("model.local.cachedInputPrice"),
                  ],
                  [
                    "cacheWritePricePerMillionTokens",
                    t("model.local.cacheWritePrice"),
                  ],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  hint={
                    key.startsWith("cache") || key.startsWith("cached")
                      ? t("common.optional")
                      : undefined
                  }
                  error={fieldError(`cloudPricing.${key}`)}
                >
                  <input
                    aria-label={label}
                    aria-invalid={
                      Boolean(fieldError(`cloudPricing.${key}`)) || undefined
                    }
                    className={controlClassName}
                    type="number"
                    min="0"
                    step="0.001"
                    value={draft.cloudPricing[key] ?? ""}
                    onChange={(event) =>
                      changePricing({ [key]: nullableNumber(event) })
                    }
                  />
                </Field>
              ))}
            </div>
          ) : null}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={busy || !onCancel}
          >
            {t("model.local.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !onSave || !onChange}>
            {status === "saving" ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {editingModelId
              ? t("model.local.saveChanges")
              : t("model.local.saveToBrowser")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function ModelSection({
  analysis,
  capabilityTiers,
  models,
  benchmarks,
  pricing,
  modelLastUpdated,
  modelCatalogSource,
  currency,
  exchangeRates,
  onSelectModel,
  onSelectQuantization,
  onUseRecommendation,
  onViewCalculation,
  localModelIds = [],
  localModelDraft = null,
  editingLocalModelId = null,
  localModelStatus = "idle",
  localModelErrors,
  onLocalModelDraftChange,
  onBeginAddLocalModel,
  onBeginUpdateLocalModel,
  onSaveLocalModel,
  onDeleteLocalModel,
  onCancelLocalModelEdit,
  externalComparisonPanel,
}: ModelSectionProps) {
  const { locale, t } = useI18n();
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const selected = analysis.selectedModel;
  const quantization = analysis.selectedQuantization;
  const benchmark = latestBenchmark(
    selectBenchmarkCohort(benchmarks, selected?.id),
    selected?.id,
  );
  const comparisonModels = buildComparisonModels(
    models,
    benchmarks,
    pricing,
    analysis,
  );
  const localModelIdSet = new Set(localModelIds);
  const dataPackModels = sortModelsForSelector(
    models.filter((model) => !localModelIdSet.has(model.id)),
  );
  const browserModels = sortModelsForSelector(
    models.filter((model) => localModelIdSet.has(model.id)),
  );
  const selectedIsLocal = selected ? localModelIdSet.has(selected.id) : false;
  const localLibraryEnabled = Boolean(
    localModelIds.length ||
    localModelDraft ||
    onBeginAddLocalModel ||
    onBeginUpdateLocalModel ||
    onDeleteLocalModel,
  );
  const isManual = analysis.config.modelSelection.mode === "manual";
  const recommendedTier = capabilityTiers.find(
    (tier) => tier.id === analysis.modelRequirement.recommendedClass,
  );
  const recommendedTierLabel =
    recommendedTier?.labels[locale] ??
    sentenceCase(analysis.modelRequirement.recommendedClass, locale);
  const formatMemoryValue = (value: number | null | undefined) =>
    value == null ? t("common.notAvailable") : formatMemory(value);
  const formatTokenValue = (value: number | null | undefined) =>
    value == null ? t("common.notAvailable") : formatTokens(value);

  return (
    <section id="model" className="advisor-section">
      <SectionHeading
        id="model-heading"
        title={t("model.title")}
        description={t("model.description")}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
        <Panel className="p-5">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <BrainCircuit className="size-5" aria-hidden="true" />
            </span>
            {isManual ? (
              <StatusBadge tone="amber">
                {t("model.manualOverride")}
              </StatusBadge>
            ) : (
              <StatusBadge tone="blue">{t("model.recommended")}</StatusBadge>
            )}
          </div>
          <p className="mt-5 text-xs font-extrabold tracking-[0.08em] text-slate-500 uppercase">
            {t("model.recommendedClass")}
          </p>
          <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-slate-950">
            {t("model.capabilityTier", { label: recommendedTierLabel })}
          </p>

          <ul className="mt-4 grid gap-2.5 text-sm leading-5 text-slate-600">
            {analysis.modelRequirement.reasonCodes.slice(0, 4).map((reason) => (
              <li key={reason} className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                {reasonLabel(reason, locale)}
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5">
            <Field
              label={t("model.specificModel")}
              hint={t("model.local.sourceHint")}
            >
              <select
                aria-label={t("model.specificModel")}
                className={controlClassName}
                value={selected?.id ?? ""}
                onChange={(event) => {
                  setDeleteCandidateId(null);
                  onSelectModel(event.target.value);
                }}
              >
                <option value="" disabled>
                  {t("model.selectModel")}
                </option>
                <optgroup label={t("model.local.dataPackGroup")}>
                  {dataPackModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {modelSelectorOptionLabel(
                        model,
                        `${formatNumber(model.totalParametersB, 2, locale)}B`,
                      )}
                    </option>
                  ))}
                </optgroup>
                {localLibraryEnabled ? (
                  <optgroup label={t("model.local.browserGroup")}>
                    {browserModels.length ? (
                      browserModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {modelSelectorOptionLabel(
                            model,
                            `${formatNumber(model.totalParametersB, 2, locale)}B`,
                          )}
                        </option>
                      ))
                    ) : (
                      <option value="__no-browser-models" disabled>
                        {t("model.local.noBrowserModels")}
                      </option>
                    )}
                  </optgroup>
                ) : null}
              </select>
            </Field>

            {localLibraryEnabled ? (
              <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
                  <p className="flex min-w-0 items-start gap-2 text-xs leading-5 text-slate-600">
                    <Database
                      className="mt-0.5 size-3.5 shrink-0 text-slate-500"
                      aria-hidden="true"
                    />
                    <span>
                      {selectedIsLocal
                        ? t("model.local.browserEditable")
                        : t("model.local.dataPackReadOnly")}
                    </span>
                  </p>
                  {onBeginAddLocalModel ? (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto lg:w-full xl:w-auto"
                      onClick={onBeginAddLocalModel}
                      disabled={localModelStatus === "saving"}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t("model.local.addModel")}
                    </Button>
                  ) : null}
                </div>

                {selectedIsLocal && selected ? (
                  <div className="flex flex-col gap-2 border-t border-slate-200 pt-2 sm:flex-row lg:flex-col xl:flex-row">
                    {onBeginUpdateLocalModel ? (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => onBeginUpdateLocalModel(selected.id)}
                        disabled={localModelStatus === "saving"}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        {t("model.local.edit")}
                      </Button>
                    ) : null}
                    {onDeleteLocalModel ? (
                      <Button
                        variant="danger"
                        className="flex-1"
                        onClick={() => setDeleteCandidateId(selected.id)}
                        disabled={localModelStatus === "deleting"}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        {t("model.local.delete")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {deleteCandidateId && selected?.id === deleteCandidateId ? (
                  <div
                    className="rounded-md border border-red-200 bg-red-50 p-2.5"
                    role="alert"
                  >
                    <p className="text-xs font-bold text-red-900">
                      {t("model.local.deleteConfirmation", {
                        name: selected.name,
                      })}
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="danger"
                        className="flex-1"
                        onClick={() => {
                          onDeleteLocalModel?.(deleteCandidateId);
                          setDeleteCandidateId(null);
                        }}
                        disabled={localModelStatus === "deleting"}
                      >
                        {localModelStatus === "deleting" ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 className="size-4" aria-hidden="true" />
                        )}
                        {t("model.local.confirmDelete")}
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setDeleteCandidateId(null)}
                      >
                        {t("model.local.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected ? (
              <Field label={t("model.quantization")}>
                <select
                  aria-label={t("model.quantization")}
                  className={controlClassName}
                  value={quantization?.id ?? ""}
                  onChange={(event) => onSelectQuantization(event.target.value)}
                >
                  {selected.quantizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {isManual ? (
              <Button variant="secondary" onClick={onUseRecommendation}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {t("model.useRecommendation")}
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  {selected?.name ?? t("model.noEligible")}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selected
                    ? `${selected.provider} · ${sentenceCase(selected.modelType, locale)}`
                    : t("model.reviewConstraints")}
                </p>
              </div>
              {selected ? (
                <div className="flex flex-wrap gap-2">
                  {selected.openWeight ? (
                    <StatusBadge tone="green">
                      {t("model.openWeight")}
                    </StatusBadge>
                  ) : (
                    <StatusBadge>{t("model.proprietary")}</StatusBadge>
                  )}
                  {selected.reasoning ? (
                    <StatusBadge>{t("model.reasoning")}</StatusBadge>
                  ) : null}
                  {selected.id.endsWith("-ai-fusion-2") ? (
                    <StatusBadge tone="green">{t("model.aiFusion2")}</StatusBadge>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3">
            <Metric
              label={t("model.intelligence")}
              value={
                benchmark?.intelligenceScore == null
                  ? t("common.notAvailable")
                  : formatNumber(benchmark.intelligenceScore, 1, locale)
              }
              note={
                benchmark
                  ? `${sentenceCase(benchmark.method, locale)} · ${benchmark.methodologyVersion}`
                  : undefined
              }
              className="bg-white p-4"
            />
            <Metric
              label={t("model.totalActive")}
              value={
                selected
                  ? `${formatNumber(selected.totalParametersB, 1, locale)}B / ${formatNumber(selected.activeParametersB, 1, locale)}B`
                  : t("common.notAvailable")
              }
              note={
                selected?.modelType === "moe"
                  ? t("model.moeWeightNote")
                  : undefined
              }
              className="bg-white p-4"
            />
            <Metric
              label={t("model.estimatedWeight")}
              value={formatMemoryValue(analysis.vram?.modelWeightGB)}
              note={quantization?.label}
              className="bg-white p-4"
            />
            <Metric
              label={t("model.contextWindow")}
              value={formatTokenValue(selected?.contextWindowTokens)}
              className="bg-white p-4"
            />
            <Metric
              label={t("model.outputSpeed")}
              value={
                benchmark?.outputTokensPerSecond == null
                  ? t("common.notAvailable")
                  : `${formatNumber(benchmark.outputTokensPerSecond, 1, locale)} tok/s`
              }
              note={
                benchmark ? sentenceCase(benchmark.method, locale) : undefined
              }
              className="bg-white p-4"
            />
            <Metric
              label={t("model.dataUpdated")}
              value={modelLastUpdated ?? t("common.notAvailable")}
              className="bg-white p-4"
            />
          </div>
          {selected ? (
            <div className="border-t border-amber-200 bg-amber-50/70 px-5 py-4">
              <h4 className="text-sm font-bold text-amber-950">
                {t("model.catalogEvidenceTitle")}
              </h4>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                {t("model.catalogPlanningCaveat")}
              </p>
              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-slate-600">
                    {t("model.local.modalities")}
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {selected.modalities.map((modality) => (
                      <StatusBadge key={modality}>
                        {t(`model.local.modality.${modality}`)}
                      </StatusBadge>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-600">
                    {t("model.local.commercialUse")}
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {t(`model.local.${selected.commercialUse}`)}
                  </dd>
                </div>
              </dl>
              {selected.notes ? (
                <div className="mt-3 border-t border-amber-200 pt-3">
                  <p className="text-xs font-bold text-slate-700">
                    {t("model.local.notes")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">
                    {selected.notes}
                  </p>
                </div>
              ) : null}
              {modelCatalogSource?.url ? (
                <a
                  href={modelCatalogSource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-800 underline decoration-blue-300 underline-offset-2"
                >
                  {t("model.catalogSource")}: {modelCatalogSource.label}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          ) : null}
          {selected?.modelType === "moe" ? (
            <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
              <LockKeyhole
                className="mt-0.5 size-4 shrink-0 text-slate-500"
                aria-hidden="true"
              />
              {t("model.moeExplanation")}
            </div>
          ) : null}
          <div className="border-t border-slate-200 px-5 py-4">
            <Button
              variant="secondary"
              onClick={onViewCalculation}
              disabled={!analysis.vram}
            >
              {t("model.viewWeightCalculation")}
            </Button>
          </div>
        </Panel>
      </div>

      {localModelDraft ? (
        <LocalModelEditor
          draft={localModelDraft}
          capabilityTiers={capabilityTiers}
          editingModelId={editingLocalModelId}
          status={localModelStatus}
          errors={localModelErrors}
          onChange={onLocalModelDraftChange}
          onSave={onSaveLocalModel}
          onCancel={onCancelLocalModelEdit}
        />
      ) : null}

      <Panel className="mt-5 p-4 sm:p-5">
        <ModelComparisonChart
          models={comparisonModels}
          currency={currency}
          exchangeRates={exchangeRates}
          modelCatalogUpdatedAt={modelLastUpdated}
        />
      </Panel>
      {externalComparisonPanel ? (
        <div className="mt-5">{externalComparisonPanel}</div>
      ) : null}
    </section>
  );
}
