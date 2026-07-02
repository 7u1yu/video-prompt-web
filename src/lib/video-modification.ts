export type ModificationChangeType =
  | "character"
  | "prop"
  | "scene"
  | "voice"
  | "bgm";

export interface ModificationChange {
  type: ModificationChangeType;
  original: string;
  replacement: string;
  shots: string[];
  referenceLabel: string;
}

export interface ModificationImagePrompt {
  index: number;
  kind: "character" | "scene" | "prop";
  title: string;
  prompt: string;
}

export interface ModificationAudioReference {
  index: number;
  kind: "voice" | "bgm";
  title: string;
  sourceWork: string;
  sourceCharacterOrTrack: string;
  usage: string;
}

export interface VideoModificationResult {
  changeSummary: ModificationChange[];
  finalModificationPromptMarkdown: string;
  referenceImagePrompts: ModificationImagePrompt[];
  audioReferences: ModificationAudioReference[];
}

export function buildVideoModificationRequest(
  basePrompt: string,
  attempt: number,
  previousError?: string
) {
  const recovery =
    attempt >= 3
      ? "如果无法确定人物或道具的替换方向，必须选择原稿中出现频率最高的具体场景，设计一个不改变空间关系和人物动作的全新场景外观，并为它生成参考图。"
      : "优先替换原稿中最主要的人物；没有明确人物时，替换最关键的道具；仍没有时，替换承载主要动作的核心场景。";

  return `${basePrompt}

【本轮最低输出要求】
- 必须主动提出至少 1 项具体视觉替换，类型只能是人物、道具或场景，不能回答“无需修改”。
- changeSummary 不得为空，且至少包含上述视觉替换。
- referenceImagePrompts 不得为空，必须为每项视觉替换提供对应的具体生图 Prompt。
- finalModificationPromptMarkdown 必须引用对应参考图编号，并保留原稿全部时间段。
- 音色和 BGM 可按原稿实际内容选择性修改，不能用音频替换代替最低视觉替换要求。
- ${recovery}
${previousError ? `- 上一版失败原因：${previousError}。本轮必须针对该错误完整重做，不要解释。` : ""}`.trim();
}

const TIME_RANGE_PATTERN = /\b\d{2}:\d{2}\s*[–—-]\s*\d{2}:\d{2}\b/g;
const GENERIC_IMAGE_TITLES = /^(主角|配角|人物|关键道具|补充道具|主场景|补充场景|场景变化)(三视图|设定图|特写图|参考图)?$/;

function normalizeRange(value: string) {
  return value.replace(/\s*[–—-]\s*/, "–");
}

export function extractStoryboardRanges(text: string): string[] {
  const ranges = text.match(TIME_RANGE_PATTERN) || [];
  return Array.from(new Set(ranges.map(normalizeRange)));
}

function assertReferenceUsed(markdown: string, label: string) {
  if (!markdown.includes(label)) {
    throw new Error(`替换素材 ${label} 没有在最终视频修改 Prompt 中使用`);
  }
}

export function validateVideoModificationResult<T extends VideoModificationResult>(
  result: T,
  sourceStoryboard: string
): T {
  if (!result.finalModificationPromptMarkdown?.trim()) {
    throw new Error("模型没有返回完整视频修改 Prompt");
  }
  if (!Array.isArray(result.changeSummary) || result.changeSummary.length === 0) {
    throw new Error("模型没有返回可执行的改动摘要");
  }

  const sourceRanges = extractStoryboardRanges(sourceStoryboard);
  if (sourceRanges.length === 0) {
    throw new Error("分镜稿中没有识别到时间段，请使用 00:00–00:03 格式");
  }
  const outputRanges = new Set(
    extractStoryboardRanges(result.finalModificationPromptMarkdown)
  );
  const missingRanges = sourceRanges.filter((range) => !outputRanges.has(range));
  if (missingRanges.length > 0) {
    throw new Error(`最终 Prompt 缺少原分镜时间段：${missingRanges.join("、")}`);
  }

  for (const change of result.changeSummary) {
    if (
      !change.original?.trim() ||
      !change.replacement?.trim() ||
      !change.referenceLabel?.trim()
    ) {
      throw new Error("改动摘要存在空泛或不完整项目");
    }
    assertReferenceUsed(
      result.finalModificationPromptMarkdown,
      change.referenceLabel
    );
  }

  for (const image of result.referenceImagePrompts || []) {
    const label = `参考图${image.index}`;
    if (!image.title?.trim() || !image.prompt?.trim()) {
      throw new Error(`${label} 标题或生图 Prompt 不完整`);
    }
    if (GENERIC_IMAGE_TITLES.test(image.title.trim())) {
      throw new Error(`${label} 使用了空泛占位标题：${image.title}`);
    }
    const hasCharacterSheet =
      /三视图/.test(image.prompt) ||
      (/面部.*特写/.test(image.prompt) &&
        /正面.*侧面.*背面/.test(image.prompt));
    if (image.kind === "character" && !hasCharacterSheet) {
      throw new Error(`${label} 人物生图 Prompt 缺少面部特写和三视图`);
    }
    if (image.kind !== "character" && hasCharacterSheet) {
      throw new Error(`只有人物生图 Prompt 可以包含面部特写和三视图：${label}`);
    }
    assertReferenceUsed(result.finalModificationPromptMarkdown, label);
  }

  for (const audio of result.audioReferences || []) {
    const label = `参考音频${audio.index}`;
    if (
      !audio.title?.trim() ||
      !audio.sourceWork?.trim() ||
      !audio.sourceCharacterOrTrack?.trim() ||
      !audio.usage?.trim()
    ) {
      throw new Error(`${label} 缺少具体作品、角色或曲目信息`);
    }
    assertReferenceUsed(result.finalModificationPromptMarkdown, label);
  }

  return result;
}
