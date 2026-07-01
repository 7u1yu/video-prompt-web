interface ReferenceImageLike {
  kind: string;
  title: string;
  prompt: string;
}

const GENERIC_TITLES = new Set([
  "主角三视图",
  "重要配角三视图",
  "主场景设定图",
  "关键道具设定图",
  "补充场景设定图",
  "场景变化图",
  "补充道具特写图",
  "结尾场景参考图",
  "细节线索特写图",
  "关键冲突场景图",
  "结尾线索道具图",
  "补充空间关系图",
]);

export function validateReferenceImages<T extends ReferenceImageLike>(images: T[], targetCount: number) {
  if (images.length !== targetCount) {
    throw new Error(`模型没有返回足够的参考图：只返回 ${images.length} 张，要求 ${targetCount} 张`);
  }

  const invalidImage = images.find((image) => !image.title.trim() || !image.prompt.trim());
  if (invalidImage) {
    throw new Error("模型返回的参考图标题或 Prompt 不完整");
  }

  const genericImage = images.find((image) => GENERIC_TITLES.has(image.title.trim()));
  if (genericImage) {
    throw new Error(`模型返回的参考图内容空泛：${genericImage.title}`);
  }

  const misplacedCharacterSheet = images.find(
    (image) =>
      image.kind !== "character" &&
      (/三视图/.test(image.prompt) ||
        (/面部.*特写/.test(image.prompt) &&
          /正面.*侧面.*背面/.test(image.prompt)))
  );
  if (misplacedCharacterSheet) {
    throw new Error(`只有人物参考图可以包含面部特写和三视图：${misplacedCharacterSheet.title}`);
  }

  return images;
}

export function assertAllReferenceMaterialsUsed(
  markdown: string,
  counts: { imageCount: number; videoCount: number; audioCount: number }
) {
  const missing: string[] = [];
  const groups = [
    { label: "参考图", count: counts.imageCount },
    { label: "参考视频", count: counts.videoCount },
    { label: "参考音频", count: counts.audioCount },
  ];

  for (const group of groups) {
    for (let index = 1; index <= group.count; index += 1) {
      if (!markdown.includes(`${group.label}${index}`)) {
        missing.push(`${group.label}${index}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`以下参考素材没有在剧情分镜中使用：${missing.join("、")}`);
  }
}
