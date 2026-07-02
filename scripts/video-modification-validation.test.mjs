import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVideoModificationRequest,
  extractStoryboardRanges,
  normalizeVideoModificationResult,
  validateVideoModificationResult,
} from "../src/lib/video-modification.ts";

const sourceStoryboard = `00:00–00:03
低机位仰拍，女骑士站在岩石上。

00:03–00:06
超广角航拍，怪物军团冲锋。`;

const validResult = {
  changeSummary: [
    {
      type: "character",
      original: "女骑士",
      replacement: "银白短发蓝银重甲女战士",
      shots: ["00:00–00:03"],
      referenceLabel: "参考图1",
    },
    {
      type: "bgm",
      original: "原背景音乐",
      replacement: "《神奇女侠》No Man's Land",
      shots: ["00:00–00:03", "00:03–00:06"],
      referenceLabel: "参考音频1",
    },
  ],
  finalModificationPromptMarkdown: `请基于【参考视频一】进行视频修改，仅替换指定内容，其余全部保留。

【人物替换】
将女骑士替换为银白短发蓝银重甲女战士（参考图1）。

【背景音乐】
将原背景音乐替换为《神奇女侠》No Man's Land（参考音频1）。

00:00–00:03
保留低机位仰拍和人物动作，仅替换女骑士形象（参考图1）。

00:03–00:06
保留超广角航拍、怪物数量和冲锋方向，背景音乐使用（参考音频1）。

禁止新增剧情、人物、字幕、水印、logo或额外画面元素。`,
  referenceImagePrompts: [
    {
      index: 1,
      kind: "character",
      title: "银白短发蓝银重甲女战士",
      prompt:
        "银白短发女性，蓝银重甲与深蓝披风。左侧面部精细特写，右侧正面、侧面、背面全身三视图。",
    },
  ],
  audioReferences: [
    {
      index: 1,
      kind: "bgm",
      title: "史诗战场背景音乐",
      sourceWork: "《神奇女侠》",
      sourceCharacterOrTrack: "No Man's Land",
      usage: "全片战斗推进",
    },
  ],
};

test("extracts and normalizes storyboard time ranges", () => {
  assert.deepEqual(extractStoryboardRanges(sourceStoryboard), [
    "00:00–00:03",
    "00:03–00:06",
  ]);
});

test("accepts a complete modification result", () => {
  assert.deepEqual(
    validateVideoModificationResult(validResult, sourceStoryboard),
    validResult
  );
});

test("rejects a missing source time range", () => {
  const broken = structuredClone(validResult);
  broken.finalModificationPromptMarkdown =
    broken.finalModificationPromptMarkdown.replace("00:03–00:06", "镜头二");
  assert.throws(
    () => validateVideoModificationResult(broken, sourceStoryboard),
    /缺少原分镜时间段/
  );
});

test("rejects an unused replacement reference", () => {
  const broken = structuredClone(validResult);
  broken.finalModificationPromptMarkdown =
    broken.finalModificationPromptMarkdown.replaceAll("参考音频1", "背景音乐");
  assert.throws(
    () => validateVideoModificationResult(broken, sourceStoryboard),
    /参考音频1/
  );
});

test("rejects character sheets on scene prompts", () => {
  const broken = structuredClone(validResult);
  broken.referenceImagePrompts[0].kind = "scene";
  assert.throws(
    () => validateVideoModificationResult(broken, sourceStoryboard),
    /只有人物/
  );
});

test("forces every generation attempt to propose a concrete visual replacement", () => {
  const request = buildVideoModificationRequest(
    "原视频分镜稿",
    2,
    "模型没有返回可执行的改动摘要"
  );
  assert.match(request, /至少.*1.*视觉替换/);
  assert.match(request, /changeSummary.*不得为空/s);
  assert.match(request, /referenceImagePrompts.*不得为空/s);
  assert.match(request, /模型没有返回可执行的改动摘要/);
});

test("normalizes wrapped snake_case responses from compatible providers", () => {
  const normalized = normalizeVideoModificationResult({
    data: {
      change_summary: validResult.changeSummary,
      final_modification_prompt_markdown:
        validResult.finalModificationPromptMarkdown,
      reference_image_prompts: validResult.referenceImagePrompts,
      audio_references: validResult.audioReferences,
    },
  });
  assert.deepEqual(normalized, validResult);
});
