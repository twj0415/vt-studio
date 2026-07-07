/**
 * Toonflow AI供应商模板 - AtlasCloud MASS
 * @version 0.8
 *
 * 说明：
 * 1) 文本接口使用 OpenAI 兼容基地址：https://api.atlascloud.ai/v1
 * 2) 图片/视频使用 Atlas Cloud 媒体接口：https://api.atlascloud.ai/api/v1
 * 3) 图片/视频为异步任务：提交后轮询 /api/v1/model/prediction/{id}
 */

// ============================================================
// 类型定义
// ============================================================

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
  associationSkills?: string;
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}

interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
}

interface VendorConfig {
  id: string;
  version: string;
  name: string;
  author: string;
  description?: string;
  icon?: string;
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string; disabled?: boolean }[];
  inputValues: Record<string, string>;
  models: (TextModel | ImageModel | VideoModel | TTSModel)[];
}

type ReferenceList =
  | { type: "image"; sourceType: "base64"; base64: string }
  | { type: "audio"; sourceType: "base64"; base64: string }
  | { type: "video"; sourceType: "base64"; base64: string };

interface ImageConfig {
  prompt: string;
  referenceList?: Extract<ReferenceList, { type: "image" }>[];
  size: "1K" | "2K" | "4K";
  aspectRatio: `${number}:${number}`;
}

interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: "16:9" | "9:16";
  prompt: string;
  referenceList?: ReferenceList[];
  audio?: boolean;
  mode: VideoMode[];
}

interface TTSConfig {
  text: string;
  voice: string;
  speechRate: number;
  pitchRate: number;
  volume: number;
  referenceList?: Extract<ReferenceList, { type: "audio" }>[];
}

interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

type AtlasVideoModelKind =
  | "seedanceTextToVideo"
  | "seedanceReferenceToVideo"
  | "seedanceImageToVideo"
  | "wanReferenceToVideo"
  | "generic";

// ============================================================
// 全局声明
// ============================================================

declare const axios: any;
declare const FormData: any;
declare const Buffer: any;
declare const logger: (msg: string) => void;
declare const urlToBase64: (url: string) => Promise<string>;
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>;
declare const createOpenAICompatible: any;
declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;
  imageRequest: (c: ImageConfig, m: ImageModel) => Promise<string>;
  videoRequest: (c: VideoConfig, m: VideoModel) => Promise<string>;
  ttsRequest: (c: TTSConfig, m: TTSModel) => Promise<string>;
  checkForUpdates?: () => Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }>;
  updateVendor?: () => Promise<string>;
};

// ============================================================
// 供应商配置
// ============================================================

const vendor: VendorConfig = {
  id: "atlascloud",
  version: "1.0",
  author: "AtlasCloud",
  name: "AtlasCloud MASS",
  description: "AtlasCloud 全模态平台接入 Toonflow。默认按官方文档填写文本、图片、视频与任务轮询路径。",
  inputs: [
    { key: "apiKey", label: "API密钥", type: "password", required: true, placeholder: "AtlasCloud API Key" },
    { key: "chatBaseUrl", label: "文本基地址", type: "url", required: true, placeholder: "https://api.atlascloud.ai/v1", disabled: true },
    { key: "mediaBaseUrl", label: "媒体基地址", type: "url", required: true, placeholder: "https://api.atlascloud.ai/api/v1", disabled: true },
  ],
  inputValues: {
    apiKey: "",
    chatBaseUrl: "https://api.atlascloud.ai/v1",
    mediaBaseUrl: "https://api.atlascloud.ai/api/v1",
  },
  models: [
    { name: "DeepSeek V4 Pro", modelName: "deepseek-ai/deepseek-v4-pro", type: "text", think: false },
    { name: "DeepSeek V4 Flash", modelName: "deepseek-ai/deepseek-v4-flash", type: "text", think: false },
    { name: "Kimi K2.6", modelName: "moonshotai/kimi-k2.6", type: "text", think: false },
    { name: "GLM 5.1", modelName: "zai-org/glm-5.1", type: "text", think: false },
    { name: "MiniMax M2.7", modelName: "minimaxai/minimax-m2.7", type: "text", think: false },
    { name: "GPT Image 2", modelName: "openai/gpt-image-2/text-to-image", type: "image", mode: ["text", "singleImage"] },
    { name: "Nano Banana Pro", modelName: "google/nano-banana-pro/text-to-image", type: "image", mode: ["text", "singleImage", "multiReference"] },
    { name: "Nano Banana 2", modelName: "google/nano-banana-2/text-to-image", type: "image", mode: ["text", "singleImage", "multiReference"] },
    { name: "Seedream v5", modelName: "bytedance/seedream-v5.0-lite/sequential", type: "image", mode: ["text"] },
    { name: "Qwen Image 2 Pro", modelName: "qwen/qwen-image-2.0-pro/text-to-image", type: "image", mode: ["text"] },
    {
      name: "Seedance 2.0 Audio-Visual",
      modelName: "bytedance/seedance-2.0/text-to-video",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],
    },
    {
      name: "Seedance 2.0 Reference-to-Video",
      modelName: "bytedance/seedance-2.0/reference-to-video",
      type: "video",
      mode: ["singleImage"],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],
    },
    {
      name: "Seedance 2.0 Multi-Image-to-Video",
      modelName: "bytedance/seedance-2.0/image-to-video",
      type: "video",
      mode: ["startFrameOptional", ["imageReference:4"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],
    },
    {
      name: "Seedance 2.0 Fast Audio-Visual",
      modelName: "bytedance/seedance-2.0-fast/text-to-video",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],
    },
    {
      name: "Seedance 2.0 Fast Reference-to-Video",
      modelName: "bytedance/seedance-2.0-fast/reference-to-video",
      type: "video",
      mode: ["singleImage"],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],
    },
    {
      name: "Wan-2.7 Reference-to-video",
      modelName: "alibaba/wan-2.7/reference-to-video",
      type: "video",
      mode: ["singleImage"],
      audio: "optional",
      durationResolutionMap: [{ duration: [2, 3, 4, 5, 6, 7, 8, 9, 10], resolution: ["720p", "1080p"] }],
    },
  ],
};

// ============================================================
// 辅助工具
// ============================================================

const getChatBaseUrl = () => vendor.inputValues.chatBaseUrl.replace(/\/+$/, "");

const getMediaBaseUrl = () => vendor.inputValues.mediaBaseUrl.replace(/\/+$/, "");

const joinUrl = (base: string, path: string) => `${base}${path.startsWith("/") ? "" : "/"}${path}`;

const getAuthHeaders = () => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少 API Key");
  return {
    Authorization: `Bearer ${vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "")}`,
  };
};

const getHeaders = () => ({
  "Content-Type": "application/json",
  ...getAuthHeaders(),
});

const readByPath = (obj: any, path: string): any => {
  if (!obj || !path) return undefined;
  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  return normalizedPath.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
};

const pickFirstPath = (obj: any, paths: string[]): any => {
  for (const path of paths) {
    const value = readByPath(obj, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const extractTaskId = (data: any): string | undefined => {
  return pickFirstPath(data, ["id", "taskId", "task_id", "data.id", "data.taskId", "data.task_id"]);
};

const extractUrl = (data: any): string | undefined => {
  return (
    (Array.isArray(readByPath(data, "data.outputs")) ? readByPath(data, "data.outputs")[0] : undefined) ||
    (Array.isArray(readByPath(data, "outputs")) ? readByPath(data, "outputs")[0] : undefined) ||
    (Array.isArray(readByPath(data, "data")) ? readByPath(data, "data")[0]?.url : undefined) ||
    readByPath(data, "url") ||
    readByPath(data, "video_url") ||
    readByPath(data, "image_url") ||
    readByPath(data, "data.url") ||
    readByPath(data, "data.video_url") ||
    readByPath(data, "data.image_url") ||
    readByPath(data, "data.output.url") ||
    readByPath(data, "data.output.video_url") ||
    readByPath(data, "output.url")
  );
};

const extractB64 = (data: any): string | undefined => {
  return pickFirstPath(data, ["b64_json", "data.b64_json", "data.0.b64_json", "data[0].b64_json"]);
};

const extractStatus = (data: any): string => {
  const statusRaw = pickFirstPath(data, ["status", "data.status", "data.state", "state"]);
  return String(statusRaw || "").toLowerCase();
};

const extractError = (data: any): string | undefined => {
  return pickFirstPath(data, ["error.message", "message", "msg", "data.error.message", "data.message"]);
};

const isDnsOrNetworkError = (err: any): boolean => {
  const msg = String(err?.message || err || "");
  return /ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|timeout/i.test(msg);
};

const withNetworkRetry = async <T>(fn: () => Promise<T>, maxRetry = 3, waitMs = 1500): Promise<T> => {
  let lastErr: any;
  for (let i = 0; i < maxRetry; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isDnsOrNetworkError(err) || i === maxRetry - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, waitMs * (i + 1)));
    }
  }
  throw lastErr;
};

const ATLAS_IMAGE_MODEL_ALIASES: Record<string, string> = {
  "gpt-image-2": "openai/gpt-image-2/text-to-image",
  "gptimage2": "openai/gpt-image-2/text-to-image",
  "gpt-image2": "openai/gpt-image-2/text-to-image",
  "gpt_image_2": "openai/gpt-image-2/text-to-image",
};

const isAtlasCloudMediaBaseUrl = (): boolean => {
  try {
    return new URL(getMediaBaseUrl()).hostname.includes("atlascloud.ai");
  } catch {
    return false;
  }
};

const isAtlasCloudImageModelName = (modelName: string): boolean => modelName.includes("/");

const shouldUseAtlasCloudImageApi = (modelName: string): boolean => isAtlasCloudImageModelName(modelName) || isAtlasCloudMediaBaseUrl();

const normalizeAtlasImageModelName = (modelName: string): string => {
  const normalized = modelName.trim();
  return ATLAS_IMAGE_MODEL_ALIASES[normalized] || normalized;
};

const resolveAtlasImageModelName = (modelName: string, hasImageRefs: boolean): string => {
  const normalizedModelName = normalizeAtlasImageModelName(modelName);
  if (!hasImageRefs) return normalizedModelName;

  switch (normalizedModelName) {
    case "google/nano-banana-pro/text-to-image":
      return "google/nano-banana-pro/edit";
    case "google/nano-banana-2/text-to-image":
      return "google/nano-banana-2/edit";
    default:
      return normalizedModelName;
  }
};

const resolveAtlasVideoModelKind = (modelName: string): AtlasVideoModelKind => {
  if (modelName === "alibaba/wan-2.7/reference-to-video") return "wanReferenceToVideo";
  if (/^bytedance\/seedance-2\.0(?:-fast)?\/reference-to-video$/.test(modelName)) return "seedanceReferenceToVideo";
  if (/^bytedance\/seedance-2\.0(?:-fast)?\/image-to-video$/.test(modelName)) return "seedanceImageToVideo";
  if (/^bytedance\/seedance-2\.0(?:-fast)?\/text-to-video$/.test(modelName)) return "seedanceTextToVideo";
  return "generic";
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
};

const normalizeResolution = (value: unknown, allowed: string[], fallback: string): string => {
  const lower = String(value || "").toLowerCase();
  const matched = allowed.find((item) => item.toLowerCase() === lower);
  if (matched) return matched;
  if (/1080/.test(lower)) return allowed.find((item) => /1080/i.test(item)) || fallback;
  if (/720/.test(lower)) return allowed.find((item) => /720/i.test(item)) || fallback;
  if (/480/.test(lower)) return allowed.find((item) => /480/i.test(item)) || fallback;
  return fallback;
};

const getOpenAiCompatibleImageSize = (aspectRatio: string): string => {
  if (aspectRatio === "16:9" || aspectRatio === "3:2") return "1536x1024";
  if (aspectRatio === "9:16" || aspectRatio === "2:3") return "1024x1536";
  return "1024x1024";
};

const splitBase64Media = (value: string, fallbackMime = "image/png"): { mime: string; data: string } => {
  const normalized = value.trim();
  const dataUrlMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(normalized);
  return {
    mime: (dataUrlMatch?.[1] || fallbackMime).toLowerCase(),
    data: (dataUrlMatch?.[2] ?? normalized).replace(/\s/g, ""),
  };
};

const getImageExtension = (mime: string): string => {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
};

const requestOpenAiCompatibleImage = async (config: ImageConfig, model: ImageModel, imageRefs: string[]): Promise<string> => {
  if (imageRefs.length === 0) {
    const url = joinUrl(getChatBaseUrl(), "/images/generations");
    const body = {
      model: model.modelName,
      prompt: config.prompt || "",
      n: 1,
      size: getOpenAiCompatibleImageSize(config.aspectRatio || "1:1"),
    };

    logger(`[OpenAI Compatible 图片] 提交文生图: ${model.modelName}`);
    try {
      const response = await axios.post(url, body, { headers: getHeaders() });
      const data = response.data;
      const b64 = extractB64(data);
      if (b64) return b64;
      const imageUrl = extractUrl(data);
      if (imageUrl) return await urlToBase64(imageUrl);
      throw new Error(`图片生成失败：未获取到图片结果。原始响应：${JSON.stringify(data).slice(0, 500)}`);
    } catch (error) {
      throw formatHttpError(error, `OpenAI Compatible 图片接口调用失败 ${url}`);
    }
  }

  const url = joinUrl(getChatBaseUrl(), "/images/edits");
  const form = new FormData();
  form.append("model", model.modelName);
  form.append("prompt", config.prompt || "");
  form.append("n", "1");
  form.append("size", getOpenAiCompatibleImageSize(config.aspectRatio || "1:1"));

  imageRefs.forEach((imageRef, index) => {
    const media = splitBase64Media(imageRef);
    form.append("image[]", Buffer.from(media.data, "base64"), {
      filename: `reference-${index + 1}.${getImageExtension(media.mime)}`,
      contentType: media.mime,
    });
  });

  logger(`[OpenAI Compatible 图片] 提交图生图: ${model.modelName}, refs=${imageRefs.length}`);
  try {
    const response = await axios.post(url, form, {
      headers: {
        ...getAuthHeaders(),
        ...form.getHeaders(),
      },
    });
    const data = response.data;
    const b64 = extractB64(data);
    if (b64) return b64;
    const imageUrl = extractUrl(data);
    if (imageUrl) return await urlToBase64(imageUrl);
    throw new Error(`图片生成失败：未获取到图片结果。原始响应：${JSON.stringify(data).slice(0, 500)}`);
  } catch (error) {
    throw formatHttpError(error, `OpenAI Compatible 图片编辑接口调用失败 ${url}`);
  }
};

const getHttpErrorHint = (status: unknown, detail: string | undefined, summary: string): string => {
  const text = `${summary} ${detail || ""}`;
  if (
    status === 403 &&
    /Image generation is not enabled for this group|permission_error/i.test(text) &&
    /(图片|images\/generations|images\/edits|generateImage)/i.test(text)
  ) {
    return "当前 API Key/Group 未开通图片生成权限；请在中转服务后台启用图片生成，或换用已开通图片能力的 Key、模型或供应商";
  }

  return "";
};

const formatHttpError = (error: any, summary: string): Error => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const detail = typeof data === "string" ? data : data ? JSON.stringify(data) : error?.message;
  const truncatedDetail = detail ? String(detail).slice(0, 300) : "";
  const hint = getHttpErrorHint(status, truncatedDetail, summary);
  return new Error(`${summary}${status ? `：HTTP ${status}` : ""}${truncatedDetail ? `，${truncatedDetail}` : ""}${hint ? `。${hint}` : ""}`);
};

const getReferenceLimit = (
  modes: VideoMode[],
  prefix: "imageReference" | "videoReference" | "audioReference",
): number | undefined => {
  for (const mode of modes) {
    if (!Array.isArray(mode)) continue;
    for (const entry of mode) {
      if (!entry.startsWith(`${prefix}:`)) continue;
      const limit = Number(entry.split(":")[1]);
      if (Number.isFinite(limit) && limit > 0) return limit;
    }
  }
  return undefined;
};

const limitReferences = (refs: string[], maxCount?: number): string[] => {
  if (!maxCount || maxCount < 1) return refs;
  return refs.slice(0, maxCount);
};

const summarizeRefCount = (usedCount: number, rawCount: number): string => {
  return usedCount === rawCount ? String(usedCount) : `${usedCount}/${rawCount}`;
};

const buildAtlasVideoPayload = (config: VideoConfig, model: VideoModel) => {
  const rawImageRefs = (config.referenceList || []).filter((r) => r.type === "image").map((r) => r.base64).filter(Boolean);
  const rawVideoRefs = (config.referenceList || []).filter((r) => r.type === "video").map((r) => r.base64).filter(Boolean);
  const rawAudioRefs = (config.referenceList || []).filter((r) => r.type === "audio").map((r) => r.base64).filter(Boolean);

  const imageRefs = limitReferences(rawImageRefs, getReferenceLimit(model.mode, "imageReference"));
  const videoRefs = limitReferences(rawVideoRefs, getReferenceLimit(model.mode, "videoReference"));
  const audioRefs = limitReferences(rawAudioRefs, getReferenceLimit(model.mode, "audioReference"));
  const kind = resolveAtlasVideoModelKind(model.modelName);
  const ratio = config.aspectRatio || "16:9";
  const shouldGenerateAudio = model.audio === true || (model.audio === "optional" && config.audio !== false);
  const body: any = {
    model: model.modelName,
    prompt: config.prompt || "",
  };

  if (kind === "wanReferenceToVideo") {
    if (imageRefs.length < 1) {
      throw new Error(`${model.name} 需要至少 1 张参考图`);
    }
    body.images = [imageRefs[0]];
    body.ratio = ratio;
    body.duration = clampNumber(config.duration, 2, 10, 5);
    body.resolution = normalizeResolution(config.resolution, ["720P", "1080P"], "720P");
    body.prompt_extend = false;
    body.seed = -1;
  } else if (kind === "seedanceReferenceToVideo") {
    if (imageRefs.length < 1) {
      throw new Error(`${model.name} 需要至少 1 张参考图`);
    }
    if (shouldGenerateAudio) body.generate_audio = true;
    body.images = [imageRefs[0]];
    body.ratio = ratio;
    body.duration = clampNumber(config.duration, 4, 15, 5);
    body.resolution = normalizeResolution(config.resolution, ["480p", "720p", "1080p"], "720p");
    body.watermark = false;
  } else if (kind === "seedanceImageToVideo") {
    if (imageRefs.length < 1) {
      throw new Error(`${model.name} 需要至少 1 张参考图`);
    }
    if (shouldGenerateAudio) body.generate_audio = true;
    body.images = imageRefs;
    body.ratio = ratio;
    body.duration = clampNumber(config.duration, 4, 15, 5);
    body.resolution = normalizeResolution(config.resolution, ["480p", "720p", "1080p"], "720p");
    body.watermark = false;
  } else {
    if (shouldGenerateAudio) body.generate_audio = true;
    if (imageRefs.length > 0) body.reference_images = imageRefs;
    if (videoRefs.length > 0) body.reference_videos = videoRefs;
    if (audioRefs.length > 0) body.reference_audios = audioRefs;
    body.ratio = ratio;
    body.duration = clampNumber(config.duration, 4, 15, 5);
    body.resolution = normalizeResolution(config.resolution, ["480p", "720p"], "720p");
    body.watermark = false;
  }

  return {
    body,
    summary: `kind=${kind} imageRefs=${summarizeRefCount(imageRefs.length, rawImageRefs.length)} videoRefs=${summarizeRefCount(videoRefs.length, rawVideoRefs.length)} audioRefs=${summarizeRefCount(audioRefs.length, rawAudioRefs.length)} resolution=${body.resolution} duration=${body.duration}${shouldGenerateAudio ? " audio=on" : " audio=off"}`,
  };
};

// ============================================================
// 适配器函数
// ============================================================

const normalizeReasoningEffort = (value: ReasoningEffort | undefined, fallback: ReasoningEffort): ReasoningEffort => {
  return value === "none" || value === "low" || value === "medium" || value === "high" || value === "xhigh" ? value : fallback;
};

const legacyReasoningEffort = (thinkLevel: 0 | 1 | 2 | 3): ReasoningEffort => {
  if (thinkLevel === 1) return "low";
  if (thinkLevel === 2) return "medium";
  if (thinkLevel === 3) return "high";
  return "low";
};

const textRequest = (model: TextModel, think: boolean, thinkLevel: 0 | 1 | 2 | 3, reasoningEffort?: ReasoningEffort) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少 API Key");
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  const effort = normalizeReasoningEffort(reasoningEffort, think ? legacyReasoningEffort(thinkLevel) : "none");
  const enableThinking = model.think && think && effort !== "none";

  return createOpenAICompatible({
    name: "atlascloud",
    baseURL: getChatBaseUrl(),
    apiKey,
    fetch: async (url: string, options?: RequestInit) => {
      const rawBody = JSON.parse((options?.body as string) ?? "{}");
      const body = enableThinking
        ? {
          ...rawBody,
          thinking: { type: "enabled" },
          reasoning_effort: effort,
        }
        : rawBody;
      return await fetch(url, { ...options, body: JSON.stringify(body) });
    },
  }).chatModel(model.modelName);
};

const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  const headers = getHeaders();
  const imageRefs = (config.referenceList || []).map((ref) => ref.base64).filter(Boolean);
  if (!shouldUseAtlasCloudImageApi(model.modelName)) {
    return await requestOpenAiCompatibleImage(config, model, imageRefs);
  }

  const url = joinUrl(getMediaBaseUrl(), "/model/generateImage");
  const sizeToResolution: Record<ImageConfig["size"], string> = {
    "1K": "1k",
    "2K": "2k",
    "4K": "4k",
  };
  const resolvedModelName = resolveAtlasImageModelName(model.modelName, imageRefs.length > 0);
  const isNanoModel = /^google\/nano-banana-(pro|2)\//.test(resolvedModelName);
  const supportsImageConditioning = /^(openai\/gpt-image-2\/text-to-image|google\/nano-banana-(pro|2)\/edit)$/.test(resolvedModelName);

  const body: any = {
    model: resolvedModelName,
    prompt: config.prompt || "",
  };
  if (supportsImageConditioning && imageRefs.length > 0) {
    body.images = imageRefs;
  }
  if (isNanoModel) {
    body.aspect_ratio = config.aspectRatio || "16:9";
    body.resolution = sizeToResolution[config.size || "1K"] || "1k";
  }

  logger(`[AtlasCloud 图片] 提交任务: ${model.modelName} -> ${resolvedModelName}, refs=${imageRefs.length}`);
  let submitResp: any;
  try {
    submitResp = await axios.post(url, body, { headers });
  } catch (error) {
    throw formatHttpError(error, `AtlasCloud 图片接口调用失败 ${url}`);
  }
  const submitData = submitResp.data;

  // 同步返回（直接拿图）
  const syncB64 = extractB64(submitData);
  if (syncB64) return syncB64;
  const syncUrl = extractUrl(submitData);
  if (syncUrl) return await urlToBase64(syncUrl);

  // 异步返回（拿 taskId 再轮询）
  const taskId = extractTaskId(submitData);
  if (!taskId) {
    throw new Error(`图片任务提交失败：未获取到任务ID。原始响应：${JSON.stringify(submitData).slice(0, 500)}`);
  }

  const pollResult = await pollTask(
    async (): Promise<PollResult> => {
      const resultUrl = joinUrl(getMediaBaseUrl(), `/model/prediction/${taskId}`);
      const resultResp = await axios.get(resultUrl, { headers });
      const data = resultResp.data;
      const status = extractStatus(data);

      if (["succeeded", "success", "done", "completed"].includes(status)) {
        const b64 = extractB64(data);
        if (b64) return { completed: true, data: b64 };
        const mediaUrl = extractUrl(data);
        if (mediaUrl) return { completed: true, data: mediaUrl };
        return { completed: true, error: "任务成功但未返回结果地址" };
      }
      if (["failed", "error", "cancelled", "canceled", "expired"].includes(status)) {
        return { completed: true, error: extractError(data) || "图片生成失败" };
      }
      return { completed: false };
    },
    3000,
    600000,
  );

  if (pollResult.error) throw new Error(pollResult.error);
  if (!pollResult.data) throw new Error("图片生成失败：轮询未返回数据");
  if (pollResult.data.startsWith("data:")) return pollResult.data;
  if (pollResult.data.startsWith("http")) return await urlToBase64(pollResult.data);
  return pollResult.data;
};

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  const headers = getHeaders();
  const url = joinUrl(getMediaBaseUrl(), "/model/generateVideo");
  const { body, summary } = buildAtlasVideoPayload(config, model);

  logger(`[AtlasCloud 视频] 提交任务: ${model.modelName}, ${summary}`);
  const submitResp: any = await withNetworkRetry<any>(() => axios.post(url, body, { headers }), 3, 1500);
  const submitData = submitResp.data;

  const taskId = extractTaskId(submitData);
  if (!taskId) {
    const syncUrl = extractUrl(submitData);
    if (syncUrl) return await urlToBase64(syncUrl);
    throw new Error(`视频任务提交失败：未获取到任务ID。原始响应：${JSON.stringify(submitData).slice(0, 500)}`);
  }

  const pollResult = await pollTask(
    async (): Promise<PollResult> => {
      const resultUrl = joinUrl(getMediaBaseUrl(), `/model/prediction/${taskId}`);
      const resultResp: any = await withNetworkRetry<any>(() => axios.get(resultUrl, { headers }), 3, 1200);
      const data = resultResp.data;
      const status = extractStatus(data);

      if (["succeeded", "success", "done", "completed"].includes(status)) {
        const mediaUrl = extractUrl(data);
        if (mediaUrl) return { completed: true, data: mediaUrl };
        return { completed: true, error: "任务成功但未返回视频地址" };
      }
      if (["failed", "error", "cancelled", "canceled", "expired"].includes(status)) {
        return { completed: true, error: extractError(data) || "视频生成失败" };
      }
      return { completed: false };
    },
    5000,
    1800000,
  );

  if (pollResult.error) throw new Error(pollResult.error);
  if (!pollResult.data) throw new Error("视频生成失败：轮询未返回数据");
  return await urlToBase64(pollResult.data);
};

const ttsRequest = async (_config: TTSConfig, _model: TTSModel): Promise<string> => {
  throw new Error("AtlasCloud adapter 暂未实现 ttsRequest，请接入真实语音生成接口后再启用 TTS 模型");
};

const checkForUpdates = async (): Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }> => {
  return {
    hasUpdate: false,
    latestVersion: vendor.version,
    notice: "AtlasCloud MASS 初稿。",
  };
};

const updateVendor = async (): Promise<string> => {
  throw new Error("AtlasCloud adapter 暂未提供自动更新");
};

// ============================================================
// 导出
// ============================================================

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.checkForUpdates = checkForUpdates;
exports.updateVendor = updateVendor;

export { };
