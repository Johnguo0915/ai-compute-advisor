# AI Compute Advisor

[简体中文](README.zh-CN.md) · [Live Calculator](https://johnguo0915.github.io/ai-compute-advisor/)

AI Compute Advisor is a pre-sales deployment advisor for matching open-weight models to available devices. It supports both directions of work:

- **Find Hardware for Model**: choose a model, quantization, context, concurrency, and service target, then review eligible device deployment options.
- **Find Models for Hardware**: start from available devices and derive capacity-fit models, remaining VRAM, deployment constraints, and validation requirements.

The calculator is designed for explainable proposal work. It separates model weights, KV Cache (local Q8 by default, or AI Fusion 2.0 on supported models: ~5GB RAM, ~1GB SSD KV, 5% safety), runtime safety headroom, GPU + AI accelerator post-training (≤14B with 320GB, ≤72B with 1TB; Fusion 2.0 excluded), and device capacity.

## Data-source policy

- **Models**: Hugging Face is the authoritative model-directory source. Model cards, configuration, context limits, license, and revisions should be synchronized from official Hugging Face repositories.
- **Hardware**: GPU and platform specifications are maintained from official vendor sources. VRAM bandwidth, peak AI TOPS, precision label, and TDP are hardware metadata only. AI TOPS must not be converted directly into LLM TPS.
- **Performance**: TPS, TTFT, and maximum concurrency require a matching model-device-runtime profile or measurement. Missing evidence is shown as pending rather than inferred.

## Using the calculator

1. Open the [Live Calculator](https://johnguo0915.github.io/ai-compute-advisor/).
2. Select **Find Hardware for Model** to evaluate deployment options for a target model.
3. Select **Find Models for Hardware** to assess existing devices.
4. Enter context length and peak concurrency before treating a capacity result as a proposal basis.
5. Use the optional AI accelerator tier only when the selected runtime supports the required tiering path. The result distinguishes standard inference from AI-accelerated quantization and labels unverified runtime behavior.
6. Treat throughput and latency as proposal-ready only when a matching performance profile is recorded as measured.

## Local data and maintenance

The intended maintenance model is **official base data plus a local user overlay**:

- Engineering maintains the official model directory, standard device library, calculation rules, and verified performance records once.
- A user can keep customer-specific devices, prices, test results, and custom configurations locally without changing official recommendations.
- Every resulting option should identify whether it uses official data, a local custom configuration, or an unverified profile.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Production verification:

```bash
npm run check
```

## Important limitation

The current static interface ships a maintained starter directory. A real Hugging Face directory refresh requires a server-side synchronization task that fetches repository metadata and parses architecture-specific KV Cache parameters. A model with incomplete KV data may appear in the directory, but must not produce a capacity recommendation.

---

## 简体中文

AI Compute Advisor 是面向售前的模型与设备部署顾问。它支持从模型反推设备，也支持从已有设备反推可部署模型，并把模型权重、KV Cache（默认本地 Q8；Qwen3.6 35B、Gemma 4 26B、Ornith 1.5 35B 另提供 AI Fusion 2.0：约 5GB 到内存、约 1GB KV 到 SSD、安全余量 5%）、运行时安全余量与设备余量分开呈现。

### 使用方式

1. 打开 [Live Calculator](https://johnguo0915.github.io/ai-compute-advisor/)。
2. 在“模型找硬件”中选择模型、量化、上下文、峰值并发和服务目标，查看可行设备部署方案。
3. 在“硬件找模型”中选择已有设备与台数，查看可部署模型、显存余量、Post training 能力与待验证项。
4. 没有同模型、同量化、同上下文、同运行时的性能资料时，TPS、TTFT 和最大并发必须显示为待测，不能做对外承诺。

### 数据规则

- 模型目录以 Hugging Face 官方仓库为唯一模型数据源。
- 显卡规格以 NVIDIA、AMD、Lenovo 等厂商官方来源为准。
- AI TOPS 仅作为硬件规格，不直接换算为 LLM TPS。
- 官方模型与设备库统一维护；用户可在本地保存客户设备、报价和实测数据，默认不回传或改写官方结论。
