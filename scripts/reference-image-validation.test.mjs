import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertAllReferenceMaterialsUsed,
  validateReferenceImages,
} from "../src/lib/reference-image-validation.ts";

const concreteImages = [
  {
    index: 1,
    kind: "character",
    title: "调查员林澈",
    prompt: "三十岁清瘦男性，短黑发，深灰风衣，左脸细小旧疤，冷白顶光下的角色设定集。",
  },
  {
    index: 2,
    kind: "prop",
    title: "裂屏银色录音笔",
    prompt: "掌心大小的银色录音笔，右上角屏幕碎裂，金属边缘有擦痕，暗色桌面浅景深特写。",
  },
];

test("rejects missing reference images instead of adding generic fallbacks", () => {
  assert.throws(
    () => validateReferenceImages(concreteImages.slice(0, 1), 2),
    /只返回 1 张，要求 2 张/
  );
});

test("rejects generic placeholder reference images", () => {
  assert.throws(
    () =>
      validateReferenceImages(
        [
          concreteImages[0],
          {
            index: 2,
            kind: "scene",
            title: "补充场景设定图",
            prompt: "场景设定图，空间层次清晰，主体位置明确，前中后景分明。",
          },
        ],
        2
      ),
    /内容空泛/
  );
});

test("keeps concrete story-specific reference images", () => {
  assert.deepEqual(validateReferenceImages(concreteImages, 2), concreteImages);
});

test("rejects character reference-sheet layouts on scenes and props", () => {
  assert.throws(
    () =>
      validateReferenceImages(
        [
          concreteImages[0],
          {
            index: 2,
            kind: "scene",
            title: "废弃天文台控制室",
            prompt:
              "废弃天文台控制室，左侧为面部精细特写，右侧依次排布正面全身、侧面全身、背面全身标准三视图。",
          },
        ],
        2
      ),
    /只有人物参考图/
  );
});

test("rejects an unused reference image", () => {
  assert.throws(
    () =>
      assertAllReferenceMaterialsUsed(
        "内容：林澈（参考图1）走进控制室。",
        { imageCount: 2, videoCount: 0, audioCount: 0 }
      ),
    /参考图2/
  );
});

test("rejects an unused reference video", () => {
  assert.throws(
    () =>
      assertAllReferenceMaterialsUsed(
        "运镜：缓慢前推。内容：林澈（参考图1）抬头。",
        { imageCount: 1, videoCount: 1, audioCount: 0 }
      ),
    /参考视频1/
  );
});

test("rejects an unused reference audio", () => {
  assert.throws(
    () =>
      assertAllReferenceMaterialsUsed(
        "内容：林澈（参考图1，参考音频1）：“停下。”",
        { imageCount: 1, videoCount: 0, audioCount: 2 }
      ),
    /参考音频2/
  );
});
