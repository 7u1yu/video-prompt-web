interface ReferenceImageLike {
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

  return images;
}
