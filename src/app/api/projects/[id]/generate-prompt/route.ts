import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { formatProviderError } from "@/lib/provider-errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  assertAllReferenceMaterialsUsed,
  validateReferenceImages,
} from "@/lib/reference-image-validation";
import { formatScriptRagResults, searchScriptNarrativeRag } from "@/lib/script-rag";
import { getSession } from "@/lib/session";

type ReferenceImageKind = "character" | "scene" | "prop";

interface GeneratedReferenceImage {
  index: number;
  kind: ReferenceImageKind;
  title: string;
  prompt: string;
}

interface GeneratedReferenceAudio {
  index: number;
  title: string;
  sourceWork: string;
  sourceCharacter: string;
  usage: string;
  description: string;
}

interface GeneratedPrompt {
  generatedStoryBrief: string;
  finalPromptMarkdown: string;
  referenceImages: GeneratedReferenceImage[];
  referenceAudios: GeneratedReferenceAudio[];
}

interface PromptContext {
  primaryScene: string;
  secondaryScene: string;
  stylePreset: string | null;
  cameraMotionStyle: string | null;
  referenceImageCount: number;
  referenceVideoCount: number;
  referenceAudioCount: number;
  referenceBgmCount: number;
  generationSeed: number;
  previousAudioMarkdown: string;
  previousStoryBrief: string;
  recentStoryBriefs: string[];
}

interface ApiSettings {
  textProvider?: string;
  textApiKey?: string;
  textBaseUrl?: string;
  textModel?: string;
}

const IMAGE_KINDS: ReferenceImageKind[] = ["character", "scene", "prop"];
const PRIMARY_SCENES = ["漫剧", "真人剧", "电影"] as const;
const SECONDARY_SCENES = [
  "恋爱校园",
  "奇幻冒险",
  "悬疑推理",
  "古风武侠",
  "历史武侠",
  "爽文剧",
  "都市情感",
  "科幻",
  "剧情",
  "动作",
  "其他",
] as const;

const INTENT_MODE_LABELS: Record<string, string> = {
  auto: "模型根据故事需要决定",
  yes: "必须有",
  no: "必须无",
};

const DETAIL_FOCUS_OPTIONS = [
  "多人物一致性",
  "人物站位关系",
  "场景一致性",
  "道具一致性",
  "镜头顺序",
  "人物动作",
  "转场",
  "运镜",
  "台词或旁白",
  "台词与说话人匹配",
  "字幕",
  "音频",
  "音色参考",
  "特效",
  "负向指令",
  "视频风格",
  "分辨率",
] as const;

const CAMERA_MOTION_PROMPTS = [
  {
    id: "low-push-reveal",
    label: "低机位前推 + 抬镜揭示",
    prompt: "3-5 秒单镜头。夜晚旧走廊，地面有细碎水渍和一枚掉落的银色钥匙，前景是钥匙边缘的冷光反射。镜头从贴近地面的低机位起幅，先只看到钥匙、鞋尖和地面纹理，随后镜头缓慢向前推进，越过钥匙，人物从画面远处逐渐进入焦点。人物是一名神情紧张的年轻女性，穿深色外套，右手握着一部亮屏手机，手机屏幕光照在她的手指和下颌。镜头推进到人物脚边后轻微上抬，最终落到她站在走廊尽头门前的半身画面。运动稳定、速度克制，重点是从关键道具到人物处境的逐步揭示。不要大幅晃动，不要快速剪辑，不要字幕，不要水印。",
  },
  {
    id: "lateral-foreground-wipe",
    label: "横向跟拍 + 前景遮挡转场",
    prompt: "3-5 秒单镜头。傍晚城市街边，人物是一名穿浅色衬衫的年轻男性，左手抱着文件夹，右手攥着一张折皱的车票，沿着玻璃橱窗外快速行走。镜头与人物保持平行横向跟拍，人物始终位于画面中间偏右，背景是路灯、广告牌、橱窗反光和匆忙经过的人群。前景不断经过树干、路牌、停靠车辆边缘和玻璃反光，形成自然遮挡。镜头在一个深色路牌完全遮住画面的瞬间完成转场感，遮挡后画面落到相同方向移动的另一段街景。重点是横向运动连贯、前景遮挡自然、人物和道具位置稳定。不要突然变焦，不要跳切，不要字幕，不要水印。",
  },
  {
    id: "half-orbit-pressure",
    label: "环绕半圈 + 情绪压迫推进",
    prompt: "3-5 秒单镜头。室内审讯室或空旷会议室，桌面上放着一只黑色录音笔、一杯未喝完的水和一张被折过的照片。人物是一名中年男性，穿深色夹克，坐在桌边，双手交握，目光压低，情绪克制但紧绷。镜头从人物侧后方起幅，先看到他的肩背和桌上的录音笔，然后围绕人物缓慢移动半圈，同时轻微向内推进。运动过程中，照片从画面边缘逐渐进入前景，人物侧脸过渡到正脸，最后镜头停在人物正面近景，录音笔仍在下方前景。重点是环绕带来的心理压迫感，背景空间缓慢旋转，人物表情逐渐暴露。不要快速旋转，不要夸张表演，不要字幕，不要水印。",
  },
  {
    id: "telephoto-compression-follow",
    label: "长焦压缩跟拍 + 背景逼近感",
    prompt: "3-5 秒单镜头。雨后城市天桥或狭长街道，人物是一名穿黑色风衣的年轻女性，背着小包，手里紧握一把透明雨伞，伞面有雨滴。镜头使用长焦感从人物正前方倒退跟拍，人物向镜头方向走来，脸部紧张，偶尔回头。远处背景的车灯、行人、广告牌和楼体被压缩到她身后，空间显得越来越拥挤。镜头保持轻微手持浮动，但人物始终清晰，雨伞边缘和车灯形成层叠前后景。重点是背景逼近、被追赶或被监视的压迫感。不要广角变形，不要剧烈抖动，不要动作打斗，不要字幕，不要水印。",
  },
  {
    id: "top-down-descend-rotate",
    label: "俯拍下降 + 旋转落位",
    prompt: "3-5 秒单镜头。古风庭院或现代大型大厅，场景中央有一张圆桌，桌上放着一枚玉佩、金属徽章或密封信件作为关键道具。三名人物围绕桌子站位：主角站在桌前，配角在左侧，另一人背对镜头站在远处。镜头从高处俯拍起幅，先展示人物站位和空间关系，然后缓慢下降，同时带轻微顺时针旋转。随着镜头下降，桌上的关键道具越来越突出，人物之间的距离和对峙关系逐渐清晰。最后镜头落到主角肩后方，前景是主角肩线，中景是桌上的道具，远景是对面人物。重点是从全局关系落到关键冲突。不要高速旋转，不要飞行感太强，不要字幕，不要水印。",
  },
  {
    id: "handheld-refocus",
    label: "手持贴近 + 失焦再对焦",
    prompt: "3-5 秒单镜头。昏暗房间，桌上有一部裂屏手机、一支快没电的录音笔和一张写着模糊字迹的便签。人物是一名年轻男性，坐在桌边，呼吸急促，手指悬在手机上方迟迟不敢触碰。镜头以轻微手持感从桌面边缘贴近，开始时焦点落在背景，手机和手指略微失焦；镜头缓慢靠近后，焦点从模糊逐渐拉到人物颤抖的手指和裂屏手机上。最后手机屏幕亮起，焦点稳定落在屏幕冷光和手指细节。重点是失焦到对焦的心理紧张，不要剧烈摇晃，不要快速推镜，不要出现清晰可读文字，不要字幕，不要水印。",
  },
  {
    id: "dolly-zoom-unease",
    label: "推拉变焦 + 空间异样感",
    prompt: "3-5 秒单镜头。空旷教室、医院走廊或地下通道，人物是一名穿校服或白衬衫的年轻人，站在画面中央，手里拿着一张旧照片或一枚小型吊坠，表情从疑惑变成震惊。镜头以人物正面中景起幅，人物大小在画面中基本保持稳定，同时镜头缓慢向前推进并进行反向变焦，让人物背后的走廊、窗户、灯管或墙面产生轻微拉伸感。关键道具始终在人物胸前或手中可见。重点是空间变得不真实、心理被击穿的感觉。效果要克制，不要过度眩晕，不要夸张扭曲人物脸部，不要字幕，不要水印。",
  },
  {
    id: "reflection-to-reality",
    label: "从反射入画 + 实景接管",
    prompt: "3-5 秒单镜头。雨夜街边或室内洗手间，画面从反射中起幅：水洼、镜子、玻璃窗或手机黑屏里映出人物的脸。人物是一名神情疲惫的年轻女性，手里拿着一枚耳环、项链或旧照片，反射画面先占据主体。镜头缓慢横移或轻微前推，反射中的人物与真实空间逐渐错位，随后真实人物从画面边缘进入，接管主体位置。关键道具在反射和真实画面中都短暂出现，形成身份或记忆错位感。最后镜头停在真实人物的侧脸近景，道具位于前景虚化处。重点是反射到现实的自然过渡。不要镜像混乱，不要快速切换，不要字幕，不要水印。",
  },
  {
    id: "match-action-transition",
    label: "动作匹配剪辑 + 方向连续转场",
    prompt: "3-5 秒单镜头参考，重点表现可用于剪辑衔接的动作。第一段画面：人物在室内伸手推开一扇门，手里拿着一只红色文件袋，镜头从人物侧后方跟随，动作方向从左向右。门被推开的瞬间，画面利用门板遮挡形成转场感。第二段画面延续相同运动方向，人物已经进入另一处走廊或街道，仍然保持左向右移动，红色文件袋出现在相近画面位置。镜头保持跟拍，动作、主体位置和运动方向连续。重点是用推门、抬手、转身、奔跑等动作完成地点或时间切换。不要突然改变方向，不要让道具位置跳动，不要字幕，不要水印。",
  },
  {
    id: "static-frame-micro-motion",
    label: "静止构图 + 局部运动打破",
    prompt: "3-5 秒单镜头。安静房间或夜晚办公室，镜头固定在一个稳定构图上：桌面、椅子、半开的门和一件关键道具，例如黑色笔记本、旧怀表、录音笔或白色信封。画面开始几乎完全静止，环境普通但略带压迫感。人物不完整出现，只能看到门缝后的半个身影或桌边垂下的一只手。前两秒保持静止，随后局部元素开始运动：门缝缓慢变大、录音笔红灯亮起、信封被风吹动、人物手指轻轻抽动。镜头在局部变化发生后极慢速推近关键道具。重点是静止中的微小异常带来悬疑感。不要大动作，不要突然惊吓，不要字幕，不要水印。",
  },
] as const;

function getCameraMotionSelection(style: string | null) {
  const ids = String(style || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selected = ids
    .map((id) => CAMERA_MOTION_PROMPTS.find((option) => option.id === id || option.label === id))
    .filter((option): option is (typeof CAMERA_MOTION_PROMPTS)[number] => Boolean(option));
  return selected.length > 0 ? selected : CAMERA_MOTION_PROMPTS;
}

function clampCount(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numberValue)));
}

const SYSTEM_PROMPT = `你是“video-prompt-gen 视频 Prompt 导演”，把一级场景、二级场景和视频时长转成可直接复制给视频模型使用的完整分镜 Prompt。

核心目标：
- finalPromptMarkdown 必须像导演手记，不像表格化工程文档。
- 故事梗概必须严格由用户本次选择的一级场景和二级场景生成，不使用旧梗概。
- 一级场景和二级场景是硬约束，不是灵感建议：漫剧不能写成真人剧/电影质感，真人剧不能写成动画漫剧，电影不能写成短剧/条漫；二级场景也不能跨类型，例如用户选择恋爱校园就不能生成悬疑推理、奇幻冒险或都市复仇。
- 每次生成必须重新设计人物、地点、核心冲突、关键道具和结尾反转；禁止复用上一轮或近期生成中的角色名、场景名、道具、核心设定、关键桥段和结尾。
- 参考素材必须根据故事动态命名和分配，不能固定套用示例素材。
- 参考素材必须与 finalPromptMarkdown 中的具体画面描述高度匹配：参考图只能对应实际出现的人物、道具、场景；参考音频必须对应实际说话人物、旁白或 BGM；参考视频只对应实际使用的运镜/转场。
- 禁止生成“好看但剧情里没出现”的参考素材；禁止让素材清单和正文描述脱节。
- referenceImages 数组用于生图，数量必须严格等于用户指定参考图数量。
- referenceImages 的 kind 只能是 character、scene、prop，分别对应人物、场景、道具；不要生成气氛图、关键动作图、光影图、风格图或其他类型参考图。
- 只有 kind=character 的人物参考图可以使用“面部特写 + 正面/侧面/背面三视图”布局；kind=scene 和 kind=prop 禁止出现面部特写、人物设定集、正侧背三视图或四视图布局。
- referenceAudios 数组用于“参考音频出处”栏，数量必须严格等于“音色参考数量 + BGM参考数量”；音色参考和 BGM 要分开满足，不要互相占用名额。
- referenceAudios 的编号顺序必须先列全部人物/旁白音色参考，再列全部 BGM 参考。例如音色参考数量为 2、BGM 数量为 1 时，参考音频1/2 必须是音色，参考音频3 必须是 BGM。
- 剧情里的所有具名角色都必须有 character 类型参考图，角色第一次出现和每次说话时都必须贴近写（参考图X）。旁白可以只有参考音频，背景 BGM 不能当作人物音色。

finalPromptMarkdown 必须把参考素材清单列在最终视频 Prompt 正文前面，严格使用以下顺序，不允许添加其它章节：
1. 参考素材清单，格式为“参考图1：素材名”“参考视频1用于运镜/转场用途”“参考音频1为音色用途”
2. 【整体风格】
3. 【全局约束】
4. 镜头一、镜头二、镜头三……连续镜头段落

禁止内容：
- 不要输出 > **元信息**。
- 不要输出【画幅】、画幅比例、分辨率或时间戳。
- 不要输出“参考图 Prompt”“参考视频描述”“参考音频描述”“自动补足参考图 Prompt”等章节。
- 不要在每个镜头后面追加“引用素材”清单。
- 不要写参考视频素材查找清单，也不要写参考视频生成 Prompt。
- 不要输出与用户选择的一级/二级场景不一致的剧情类型、画风类型或世界观。

分镜数量规则：
- 10 秒以内：2-3 个镜头。
- 10-20 秒：3-5 个镜头。
- 20-40 秒：5-7 个镜头。
- 40-60 秒：7-10 个镜头。
- 60-90 秒：10-14 个镜头。
- 90 秒以上：14 个以上镜头。
- 镜头个数必须根据视频时长和剧情复杂度动态决定，不能固定三段。
- 字数必须根据视频时长控制：1-15 秒视频 finalPromptMarkdown 约 900 个中文字符；16-30 秒视频约 1400 个中文字符。允许上下浮动约 15%，但不能明显过短或过长。
- 每一个镜头段落必须使用固定字段格式：
  景别：
  运镜：（参考视频X）
  内容：
  背景音乐：（参考音频X）（仅当本镜头有 BGM 时输出）
  转场：（仅当本镜头有转场时输出）
- 景别要具体，例如远景、全景、中景、近景、特写、过肩中近景、低机位全景、俯拍全景。
- 运镜要具体，例如缓慢前推、侧向跟拍、手持贴近、环绕半圈、俯拍下降、遮挡转场、动作匹配转场；如果参考视频数量大于 0，运镜字段必须贴近写（参考视频X）。
- 内容字段负责写人物、场景、道具、动作、台词、旁白和非 BGM 声音，参考图和参考音频仍必须贴近对象。

贴近引用规则，这是最重要的格式规则：
- 人物、动物、场景、道具、特效、关键状态第一次或重点出现时，必须立即跟（参考图X）。
- 运镜或转场句子必须立即跟（参考视频X）。
- 台词、旁白、人声、BGM 必须立即跟（参考音频X）。
- 例如：艾拉（参考图1）握住蓝色宝石吊坠（参考图5），镜头低机位缓慢前推到她的眼神（参考视频1）。旁白（参考音频2）：“有些门，一旦打开，就再也关不上了。”
- 参考素材清单只列素材编号和名称/用途，不要把参考图生成 Prompt、参考音频详细出处、参考视频生成 Prompt 放进 finalPromptMarkdown。
- 每个参考图编号在正文中出现时，前面的对象名和动作必须与 referenceImages 中对应的 title/prompt 一致。例如“裂屏旧手机（参考图4）”对应的 referenceImages[4] 必须是裂屏旧手机或同一关键道具，不能是其他道具。
- 素材清单中的每一张参考图、每一段参考视频、每一条参考音频都必须在后续剧情分镜正文中至少贴近引用一次，不能只列在开头清单里却没有实际使用。
- 每个 referenceImages.prompt 必须是直接可复制到生图模型里的具体画面提示词，只写画面主体、外观、构图、光线、材质、风格和负面约束；不要写“根据剧情”“用于短视频”“故事梗概”“服务剧情位置”“请生成”等任务说明。
- 任何具名角色说台词时，格式必须包含角色参考图和音频，例如：林澈（参考图1，参考音频1）：“...” 或 林澈（压低声音）（参考图1，参考音频1）：“...”。不能只写（参考音频X）。
- 背景音乐字段只能引用 BGM 类型参考音频；角色台词、旁白、人声只能引用音色类型参考音频，不能引用 BGM。

参考视频规则：
- 参考视频只用于运镜和转场，不用于剧情、表演、空间设定、服化道或角色造型。
- 用户已经有十项运镜方式视频，不需要你生成参考视频 Prompt。
- 正文中只在运镜或转场句子后贴近写（参考视频X）。
- 运镜必须服务剧情和人物状态，不能为了炫技硬切；每个镜头的运镜方向、速度、机位变化要和上一个镜头有空间或情绪承接。
- 转场必须有明确逻辑：动作匹配、前景遮挡、光色变化、视线方向、道具特写、人物运动方向、声音节奏或情绪推进中的至少一种承接方式。不要写无理由的闪白、旋转、空间翻转或突兀跳切。

参考音频规则：
- 正文中只在台词、旁白、人声或 BGM 句子后贴近写（参考音频X）。
- 不要在 finalPromptMarkdown 中输出参考音频出处；系统会单独展示参考音频出处栏。
- referenceAudios 中必须给出具体用途、作品出处和角色出处。音色参考必须是“具体影视剧/动漫作品 + 具体角色名”，不能只写男声/女声/低沉嗓音；BGM 参考必须写 sourceCharacter 为“背景BGM”，title 或 usage 中明确包含 BGM。
- referenceAudios 编号顺序必须和正文引用一致：人物对白/旁白只能引用前面的音色参考编号；背景音乐只能引用后面的 BGM 参考编号。
- 音色参考必须匹配人物说话语言：人物说中文就找中文影视剧/国产动画角色音色；说日语就找日本影视/动画角色音色；说英语就找英语影视剧/动画角色音色；其他语言同理，不能跨语言借用音色。
- BGM 参考必须给出现有影视剧/电影/动画配乐或现有音乐曲目，sourceWork 不能写“当前项目”“自选BGM”“项目统一配乐”这类占位词。

角色三视图后缀规则：
- 漫剧/动画：16:9 宽屏构图，整图合并为一张完整画面；左侧为角色面部精细特写，突出发型、眼神、表情和线条风格；右侧依次规整排布人物正面全身、侧面全身、背面全身标准三视图；四视图布局整齐统一，人物比例一致、服装造型完全同步，干净角色设定集质感，线稿清晰，色块稳定，无多余水印无杂物。
- 真人剧/电影：16:9 宽屏构图，整图合并为一张完整画面；左侧为人物面部超精细特写，保留真实皮肤肌理、面部光影细节，高清写实无磨皮；右侧依次规整排布人物正面全身、侧面全身、背面全身标准三视图；四视图布局整齐统一，人物比例一致、穿搭造型完全同步，写实质感、光影色调统一，高清细节，无多余水印无杂物。`;

const promptResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["generatedStoryBrief", "finalPromptMarkdown", "referenceImages", "referenceAudios"],
  properties: {
    generatedStoryBrief: {
      type: "string",
      description: "模型根据一级场景和二级场景随机创作的故事梗概。",
    },
    finalPromptMarkdown: {
      type: "string",
      description: "完整的视频 Prompt Markdown 文本。",
    },
    referenceImages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "kind", "title", "prompt"],
        properties: {
          index: {
            type: "integer",
          },
          kind: {
            type: "string",
            enum: IMAGE_KINDS,
          },
          title: {
            type: "string",
          },
          prompt: {
            type: "string",
          },
        },
      },
    },
    referenceAudios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "title", "sourceWork", "sourceCharacter", "usage", "description"],
        properties: {
          index: {
            type: "integer",
          },
          title: {
            type: "string",
            description: "例如：主角音色、旁白音色、反派音色、背景BGM。",
          },
          sourceWork: {
            type: "string",
            description: "具体影视剧、电影或动漫作品名。",
          },
          sourceCharacter: {
            type: "string",
            description: "具体角色名；BGM 可填背景BGM。",
          },
          usage: {
            type: "string",
            description: "本条音频在本片里的用途。",
          },
          description: {
            type: "string",
            description: "音色、语速、气息、情绪基线或 BGM 情绪说明。",
          },
        },
      },
    },
  },
} as const;

function normalizeReferenceImage(img: GeneratedReferenceImage, fallbackIndex: number) {
  const index = fallbackIndex + 1;
  const kind = IMAGE_KINDS.includes(img.kind) ? img.kind : "scene";
  return {
    index,
    kind,
    title: String(img.title || `参考图${index}`).trim(),
    prompt: String(img.prompt || "").trim(),
  };
}

function getCharacterReferenceSuffix(primaryScene: string) {
  if (primaryScene === "漫剧") {
    return "16:9 宽屏构图，整图合并为一张完整画面；左侧为角色面部精细特写，突出发型、眼神、表情和线条风格；右侧依次规整排布人物正面全身、侧面全身、背面全身标准三视图；四视图布局整齐统一，人物比例一致、服装造型完全同步，干净角色设定集质感，线稿清晰，色块稳定，无多余水印无杂物。";
  }
  return "16:9 宽屏构图，整图合并为一张完整画面；左侧为人物面部超精细特写，保留真实皮肤肌理、面部光影细节，高清写实无磨皮；右侧依次规整排布人物正面全身、侧面全身、背面全身标准三视图；四视图布局整齐统一，人物比例一致、穿搭造型完全同步，写实质感、光影色调统一，高清细节，无多余水印无杂物。";
}

function ensureCharacterReferenceSheetPrompt(prompt: string, primaryScene: string) {
  const cleaned = prompt
    .replace(/剧情匹配要求：[\s\S]*$/g, "")
    .replace(/细分考点：[^。\n]*。?/g, "")
    .trim();
  const requiresSheet =
    /左侧为.*(面部|脸部).*特写/.test(cleaned) &&
    /右侧.*正面.*侧面.*背面.*三视图/.test(cleaned);

  if (requiresSheet) return cleaned;
  return `${cleaned}。${getCharacterReferenceSuffix(primaryScene)}`.trim();
}

function sanitizeReferenceImagePrompt(prompt: string) {
  return prompt
    .replace(/剧情匹配要求：[\s\S]*$/g, "")
    .replace(/细分考点：[^。\n]*。?/g, "")
    .replace(/参考图\d+《[^》]+》，?/g, "")
    .replace(/用于[^。；\n]*(短视频|分镜|剧情|镜头)[。；]?/g, "")
    .replace(/故事梗概[:：][^。；\n]*[。；]?/g, "")
    .replace(/根据(剧情|故事|上述内容)[^。；\n]*[。；]?/g, "")
    .replace(/请生成/g, "")
    .replace(/可直接用于分镜参考的/g, "")
    .replace(/服务的剧情位置[^。；\n]*[。；]?/g, "")
    .replace(/\s+/g, " ")
    .replace(/。{2,}/g, "。")
    .trim();
}

function ensureReferenceImagesCount(
  images: GeneratedReferenceImage[],
  _storyBrief: string,
  context: PromptContext
) {
  const targetCount = context.referenceImageCount;
  const normalized = images.map(normalizeReferenceImage).slice(0, targetCount);
  const cleaned = normalized.map((img, index) => ({
    ...img,
    index: index + 1,
    prompt: sanitizeReferenceImagePrompt(img.prompt),
  }));

  validateReferenceImages(cleaned, targetCount);

  return cleaned.map((img) => {
    return {
      ...img,
      prompt: img.kind === "character" ? ensureCharacterReferenceSheetPrompt(img.prompt, context.primaryScene) : img.prompt,
    };
  });
}

function stripRepeatedDetailFocus(markdown: string) {
  return markdown
    .replace(/\n*### 细分考点分配[\s\S]*?(?=\n### |\n---|\s*$)/g, "")
    .replace(/^> - 细分考点：.*\n?/gm, "")
    .replace(/细分考点：[^。\n]*。?/g, "")
    .trim();
}

function audioKey(audio: Pick<GeneratedReferenceAudio, "sourceWork" | "sourceCharacter">) {
  return `${audio.sourceWork}${audio.sourceCharacter}`.replace(/\s/g, "");
}

function getPreviousAudioKeys(markdown: string) {
  const keys = new Set<string>();
  const regex = /^出处：(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    keys.add(match[1].replace(/[\/\s]/g, ""));
  }
  return keys;
}

function isBgmAudio(audio: Pick<GeneratedReferenceAudio, "title" | "sourceCharacter" | "usage">) {
  return /bgm|配乐|音乐|BGM/i.test(`${audio.title}${audio.sourceCharacter}${audio.usage}`) || audio.sourceCharacter === "背景BGM";
}

function hasInvalidBgmSource(audio: Pick<GeneratedReferenceAudio, "sourceWork">) {
  return /当前项目|自选|项目统一|原创|待定|无|none/i.test(audio.sourceWork);
}

function getFallbackAudioReference(
  context: PromptContext,
  index: number,
  avoidKeys = new Set<string>(),
  kind: "voice" | "bgm" = "voice"
): GeneratedReferenceAudio {
  const byScene: Record<string, Array<Omit<GeneratedReferenceAudio, "index">>> = {
    恋爱校园: [
      { title: "主角音色", sourceWork: "《最好的我们》", sourceCharacter: "耿耿", usage: "主角对白", description: "自然清亮、语速中等，带青春感和轻微犹豫。" },
      { title: "男主音色", sourceWork: "《那些年，我们一起追的女孩》", sourceCharacter: "柯景腾", usage: "男主对白", description: "少年感强，语速略快，情绪外放但不夸张。" },
      { title: "旁白音色", sourceWork: "《请回答1988》", sourceCharacter: "成德善", usage: "回忆式旁白", description: "温暖、生活化，带一点怀旧气息。" },
      { title: "背景BGM", sourceWork: "《请回答1988》配乐《Hyehwadong》", sourceCharacter: "背景BGM", usage: "情绪铺底", description: "清透吉他与温暖旋律，青春、遗憾、温柔推进。" },
    ],
    奇幻冒险: [
      { title: "主角音色", sourceWork: "《哈利·波特与魔法石》", sourceCharacter: "赫敏", usage: "主角对白", description: "清晰坚定，语速偏快，带好奇心和行动力。" },
      { title: "伙伴音色", sourceWork: "《千与千寻》", sourceCharacter: "白龙", usage: "引导者对白", description: "冷静、轻柔、神秘，情绪克制。" },
      { title: "旁白音色", sourceWork: "《指环王》", sourceCharacter: "甘道夫", usage: "史诗感旁白", description: "沉稳厚重，语速慢，带预言和冒险感。" },
      { title: "背景BGM", sourceWork: "《哈尔的移动城堡》配乐《人生的旋转木马》", sourceCharacter: "背景BGM", usage: "奇幻气氛", description: "圆舞曲式旋律、弦乐与钢琴推进，营造奇幻和命运感。" },
    ],
    悬疑推理: [
      { title: "主角音色", sourceWork: "《隐秘的角落》", sourceCharacter: "朱朝阳", usage: "主角对白", description: "压低、克制、略带紧张，语速偏慢。" },
      { title: "对手音色", sourceWork: "《白夜追凶》", sourceCharacter: "关宏峰", usage: "关键对峙对白", description: "冷静低沉，逻辑感强，气息稳定。" },
      { title: "旁白音色", sourceWork: "《漫长的季节》", sourceCharacter: "王响", usage: "悬疑旁白", description: "沧桑、低缓，带旧事回望和压抑感。" },
      { title: "背景BGM", sourceWork: "《隐秘的角落》配乐《小白船》氛围版", sourceCharacter: "背景BGM", usage: "悬疑铺底", description: "童谣质感与冷色悬疑氛围结合，保持压抑和不安。" },
    ],
    动作: [
      { title: "主角音色", sourceWork: "《无间道》", sourceCharacter: "陈永仁", usage: "主角对白", description: "低沉、短促、紧绷，带压抑爆发感。" },
      { title: "反派音色", sourceWork: "《黑暗骑士》", sourceCharacter: "小丑", usage: "对抗对白", description: "节奏不稳定，带危险感和戏谑感。" },
      { title: "旁白音色", sourceWork: "《疾速追杀》", sourceCharacter: "Winston", usage: "规则说明旁白", description: "优雅低沉，语速慢，压迫感强。" },
      { title: "背景BGM", sourceWork: "《疾速追杀》配乐《LED Spirals》", sourceCharacter: "背景BGM", usage: "动作节奏", description: "电子低频、强节拍和持续推进感，跟随动作升级。" },
    ],
  };
  const globalPool: Array<Omit<GeneratedReferenceAudio, "index">> = [
    { title: "主角音色", sourceWork: "《甄嬛传》", sourceCharacter: "甄嬛", usage: "主角对白", description: "沉稳克制，情绪层次细，语速中等偏慢。" },
    { title: "主角音色", sourceWork: "《琅琊榜》", sourceCharacter: "梅长苏", usage: "主角对白", description: "气息轻、语速稳，带谋略感和病弱压抑感。" },
    { title: "主角音色", sourceWork: "《狂飙》", sourceCharacter: "安欣", usage: "主角对白", description: "真诚、压抑、带疲惫感，情绪逐步加重。" },
    { title: "对手音色", sourceWork: "《狂飙》", sourceCharacter: "高启强", usage: "对手对白", description: "前期温和克制，后期沉稳有压迫感。" },
    { title: "旁白音色", sourceWork: "《繁花》", sourceCharacter: "阿宝", usage: "旁白", description: "都市感、低缓、带回忆质感和克制情绪。" },
    { title: "主角音色", sourceWork: "《铃芽之旅》", sourceCharacter: "岩户铃芽", usage: "主角对白", description: "清亮、急切、情绪外放但保持真实。" },
    { title: "伙伴音色", sourceWork: "《哈尔的移动城堡》", sourceCharacter: "哈尔", usage: "伙伴对白", description: "轻柔、优雅，带一点神秘和疏离。" },
    { title: "旁白音色", sourceWork: "《千与千寻》", sourceCharacter: "千寻", usage: "旁白", description: "纯净、紧张中带成长感，语速自然。" },
    { title: "背景BGM", sourceWork: "坂本龙一《Merry Christmas Mr. Lawrence》", sourceCharacter: "背景BGM", usage: "情绪铺底", description: "钢琴主题清晰，带克制、宿命和情绪回望感。" },
  ];
  const defaultPool = context.primaryScene === "漫剧"
    ? [
        { title: "主角音色", sourceWork: "《天气之子》", sourceCharacter: "天野阳菜", usage: "主角对白", description: "清亮、柔软，带坚定和温柔。" },
        { title: "伙伴音色", sourceWork: "《你的名字。》", sourceCharacter: "立花泷", usage: "伙伴对白", description: "少年感、自然，语速中等，情绪真诚。" },
        { title: "旁白音色", sourceWork: "《紫罗兰永恒花园》", sourceCharacter: "薇尔莉特", usage: "旁白", description: "干净克制，带细腻情绪。" },
        { title: "背景BGM", sourceWork: "《天气之子》配乐《Grand Escape》", sourceCharacter: "背景BGM", usage: "情绪铺底", description: "明亮、上扬、带奔跑感和奇迹感，适合情绪推进。" },
      ]
    : [
        { title: "主角音色", sourceWork: "《花样年华》", sourceCharacter: "苏丽珍", usage: "主角对白", description: "克制、温柔，情绪含蓄。" },
        { title: "配角音色", sourceWork: "《这个杀手不太冷》", sourceCharacter: "Mathilda", usage: "配角对白", description: "敏感、倔强，语速自然。" },
        { title: "旁白音色", sourceWork: "《无间道》", sourceCharacter: "陈永仁", usage: "旁白", description: "低沉克制，带内心压力。" },
        { title: "背景BGM", sourceWork: "《银翼杀手2049》配乐《Mesa》", sourceCharacter: "背景BGM", usage: "情绪铺底", description: "低频厚重、空间感强，适合电影级压迫和孤独感。" },
      ];
  const rawPool = [...(byScene[context.secondaryScene] || defaultPool), ...globalPool];
  const pool = rawPool.filter((audio) =>
    kind === "bgm" ? audio.sourceCharacter === "背景BGM" : audio.sourceCharacter !== "背景BGM"
  );
  const offset = Math.abs(context.generationSeed) % pool.length;
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    const candidate = pool[(index - 1 + offset + attempt) % pool.length];
    if (!avoidKeys.has(audioKey(candidate))) {
      return { index, ...candidate };
    }
  }
  return { index, ...pool[(index - 1 + offset) % pool.length] };
}

function stripAspectAndTimestampsMarkdown(markdown: string) {
  let nextMarkdown = markdown.trim();

  nextMarkdown = nextMarkdown
    .replace(/^> - 画幅比例：.*\n?/gm, "")
    .replace(/\n*【画幅】[^\n]*\n?/g, "\n")
    .replace(/^\s*\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}\s*$/gm, "")
    .replace(/（?\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}）?/g, "")
    .replace(/，?画幅与本片一致/g, "")
    .replace(/，?画幅比例[^。；\n]*[。；]?/g, "")
    .replace(/\n{3,}/g, "\n\n");

  return nextMarkdown.trim();
}

function stripLegacySections(markdown: string) {
  return markdown
    .replace(/\n*> \*\*元信息\*\*[\s\S]*?(?=\n参考图\d+：|\n【整体风格】|\n【画风】|\n镜头[一二三四五六七八九十百\d]+|\s*$)/g, "\n")
    .replace(/\n*---\n*### (参考图 Prompt|自动补足参考图 Prompt|参考视频描述|参考音频描述)[\s\S]*?(?=\n### |\s*$)/g, "")
    .replace(/\n*### (参考图 Prompt|自动补足参考图 Prompt|参考视频描述|参考音频描述)[\s\S]*?(?=\n### |\s*$)/g, "")
    .replace(/^参考(图|视频|音频)\d+.*$/gm, "")
    .replace(/^#+\s*(镜头[一二三四五六七八九十百\d]+)/gm, "$1")
    .replace(/镜头段落/g, "镜头")
    .replace(/【画风】/g, "【整体风格】")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildFallbackStyleBlock(context: PromptContext) {
  const style = context.stylePreset || `${context.primaryScene}${context.secondaryScene}风格`;
  return `【整体风格】\n${style}，画面具备清晰的空间层次、光线方向、人物情绪和材质细节，镜头语言克制但有叙事推进感。\n\n全片无字幕、无文字特效、无水印，不出现清晰可读文字`;
}

function buildFallbackConstraintBlock(images: GeneratedReferenceImage[], context: PromptContext) {
  const imageConstraints = images
    .slice(0, Math.min(images.length, 6))
    .map((img) => `${img.title}始终保持参考图${img.index}中的核心特征一致`)
    .join("\n");
  const motionConstraints =
    context.referenceVideoCount > 0
      ? "\n参考视频只参考机位、运镜、起幅落幅、剪辑节奏和转场方式，不借鉴剧情、角色造型、表演或服化道"
      : "";
  return `【全局约束】\n${imageConstraints || "主要人物、场景与道具在全片保持连续一致"}${motionConstraints}`;
}

function ensureStrictPromptMarkdown(markdown: string, images: GeneratedReferenceImage[], context: PromptContext) {
  let body = stripLegacySections(stripAspectAndTimestampsMarkdown(stripRepeatedDetailFocus(markdown)));

  if (!body.includes("【整体风格】")) {
    body = `${buildFallbackStyleBlock(context)}\n\n${body}`;
  }

  if (!body.includes("【全局约束】")) {
    body = body.replace(/(【整体风格】[\s\S]*?)(?=\n\n镜头[一二三四五六七八九十百\d]+|\s*$)/, `$1\n\n${buildFallbackConstraintBlock(images, context)}`);
    if (!body.includes("【全局约束】")) {
      body = `${buildFallbackConstraintBlock(images, context)}\n\n${body}`;
    }
  }

  return body
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeReferenceAudios(audios: GeneratedReferenceAudio[], context: PromptContext) {
  const voiceTargetCount = context.referenceAudioCount;
  const bgmTargetCount = context.referenceBgmCount;
  const previousKeys = getPreviousAudioKeys(context.previousAudioMarkdown);
  const usedKeys = new Set<string>();
  const sanitized = audios
    .map((audio, index) => ({
      index: index + 1,
      title: String(audio.title || "").trim(),
      sourceWork: String(audio.sourceWork || "").trim(),
      sourceCharacter: String(audio.sourceCharacter || "").trim(),
      usage: String(audio.usage || "").trim(),
      description: String(audio.description || "").trim(),
    }))
    .filter((audio) => audio.title && audio.sourceWork && audio.sourceCharacter && audio.usage && audio.description);
  const normalizeOne = (audio: GeneratedReferenceAudio, kind: "voice" | "bgm") => {
      const key = audioKey(audio);
      if (previousKeys.has(key) || usedKeys.has(key) || (kind === "bgm" && hasInvalidBgmSource(audio))) {
        const replacement = getFallbackAudioReference(context, audio.index, new Set([...previousKeys, ...usedKeys]), kind);
        usedKeys.add(audioKey(replacement));
        return replacement;
      }
      usedKeys.add(key);
      return audio;
  };

  const normalized = sanitized
    .filter((audio) => !isBgmAudio(audio))
    .slice(0, voiceTargetCount)
    .map((audio) => normalizeOne(audio, "voice"));

  while (normalized.length < voiceTargetCount) {
    const fallback = getFallbackAudioReference(context, normalized.length + 1, new Set([...previousKeys, ...usedKeys]), "voice");
    usedKeys.add(audioKey(fallback));
    normalized.push(fallback);
  }

  const bgmAudios = sanitized
    .filter((audio) => isBgmAudio(audio))
    .slice(0, bgmTargetCount)
    .map((audio, index) => normalizeOne({ ...audio, index: voiceTargetCount + index + 1, title: audio.title || "背景BGM", sourceCharacter: "背景BGM" }, "bgm"));

  while (bgmAudios.length < bgmTargetCount) {
    const fallback = getFallbackAudioReference(
      context,
      voiceTargetCount + bgmAudios.length + 1,
      new Set([...previousKeys, ...usedKeys]),
      "bgm"
    );
    usedKeys.add(audioKey(fallback));
    bgmAudios.push(fallback);
  }

  return [...normalized, ...bgmAudios].map((audio, index) => ({ ...audio, index: index + 1 }));
}

function buildReferenceAudioMarkdown(audios: GeneratedReferenceAudio[], context: PromptContext) {
  if (context.referenceAudioCount + context.referenceBgmCount <= 0) return "";

  return audios.map((audio) => {
    if (audio.sourceCharacter === "背景BGM") {
      return `参考音频${audio.index}：${audio.title}\n出处：${audio.sourceWork} / ${audio.sourceCharacter}\n用途：${audio.usage}\n说明：${audio.description}`;
    }
    return `参考音频${audio.index}：${audio.title}\n出处：${audio.sourceWork}${audio.sourceCharacter}\n用途：${audio.usage}\n说明：只借鉴角色声线气质，不模仿演员/声优本人；${audio.description}`;
  }).join("\n\n");
}

function getAudioByIndex(audios: GeneratedReferenceAudio[]) {
  return new Map(audios.map((audio) => [audio.index, audio]));
}

function getReferenceAudioIndexes(text: string) {
  return Array.from(text.matchAll(/参考音频(\d+)/g), (match) => Number(match[1])).filter(Number.isFinite);
}

function isNarrationSpeaker(text: string) {
  return /旁白|画外音|叙述|内心独白/.test(text);
}

function repairPromptReferenceConsistency(
  markdown: string,
  images: GeneratedReferenceImage[],
  audios: GeneratedReferenceAudio[],
  context: PromptContext
) {
  void context;
  const audioByIndex = getAudioByIndex(audios);
  const firstCharacterIndex = images.find((image) => image.kind === "character")?.index;
  const firstVoiceAudioIndex = audios.find((audio) => !isBgmAudio(audio))?.index;
  const firstBgmAudioIndex = audios.find((audio) => isBgmAudio(audio))?.index;
  const lines = markdown.split("\n");

  return lines
    .map((line) => {
      if (/^\s*背景音乐：/.test(line)) {
        if (!firstBgmAudioIndex) return line;
        const indexes = getReferenceAudioIndexes(line);
        if (indexes.length === 0) {
          return `${line}（参考音频${firstBgmAudioIndex}）`;
        }
        return line.replace(/参考音频(\d+)/g, (_match, value) => {
          const audioIndex = Number(value);
          const audio = audioByIndex.get(audioIndex);
          return audio && isBgmAudio(audio) ? `参考音频${audioIndex}` : `参考音频${firstBgmAudioIndex}`;
        });
      }

      if (line.includes("：“")) {
        const [beforeQuote = "", afterQuote = ""] = line.split("：“");
        let repairedSpeaker = beforeQuote;

        if (!isNarrationSpeaker(beforeQuote) && firstCharacterIndex && !/参考图\d+/.test(repairedSpeaker)) {
          repairedSpeaker = `${repairedSpeaker}（参考图${firstCharacterIndex}）`;
        }

        if (firstVoiceAudioIndex) {
          const indexes = getReferenceAudioIndexes(repairedSpeaker);
          if (indexes.length === 0) {
            repairedSpeaker = `${repairedSpeaker}（参考音频${firstVoiceAudioIndex}）`;
          } else {
            repairedSpeaker = repairedSpeaker.replace(/参考音频(\d+)/g, (_match, value) => {
              const audioIndex = Number(value);
              const audio = audioByIndex.get(audioIndex);
              return audio && !isBgmAudio(audio) ? `参考音频${audioIndex}` : `参考音频${firstVoiceAudioIndex}`;
            });
          }
        }

        return `${repairedSpeaker}：“${afterQuote}`;
      }

      if (!/^\s*背景音乐：/.test(line) && firstVoiceAudioIndex) {
        return line.replace(/参考音频(\d+)/g, (match, value) => {
          const audioIndex = Number(value);
          const audio = audioByIndex.get(audioIndex);
          if (!audio || !isBgmAudio(audio)) return match;
          return `参考音频${firstVoiceAudioIndex}`;
        });
      }

      return line;
    })
    .join("\n");
}

function assertPromptReferenceConsistency(markdown: string, audios: GeneratedReferenceAudio[]) {
  const audioByIndex = getAudioByIndex(audios);
  for (const line of markdown.split("\n").map((item) => item.trim()).filter(Boolean)) {
    if (/^背景音乐：/.test(line)) {
      for (const audioIndex of getReferenceAudioIndexes(line)) {
        const audio = audioByIndex.get(audioIndex);
        if (!audio || !isBgmAudio(audio)) {
          throw new Error("背景音乐参考音频无法自动修正");
        }
      }
    }

    if (line.includes("：“") && getReferenceAudioIndexes(line).length > 0) {
      const beforeQuote = line.split("：“")[0] || "";
      for (const audioIndex of getReferenceAudioIndexes(beforeQuote)) {
        const audio = audioByIndex.get(audioIndex);
        if (!audio || isBgmAudio(audio)) {
          throw new Error("台词参考音频无法自动修正");
        }
      }
    }
  }
}

function buildReferenceMaterialHeader(
  images: GeneratedReferenceImage[],
  normalizedAudios: GeneratedReferenceAudio[],
  context: PromptContext
) {
  const imageLines = images.map((img) => `参考图${img.index}：${img.title}`);
  const selectedMotions = getCameraMotionSelection(context.cameraMotionStyle);
  const videoLines = Array.from({ length: context.referenceVideoCount }, (_, index) => {
    const motion = selectedMotions[index % selectedMotions.length];
    return `参考视频${index + 1}用于${motion.label}`;
  });
  const audioLines = normalizedAudios.map((audio) => {
    const label = audio.sourceCharacter === "背景BGM" ? audio.title : `${audio.title}`;
    return `参考音频${audio.index}为${label}`;
  });

  return [...imageLines, ...videoLines, ...audioLines].join("\n");
}

function validateGeneratedPrompt(result: GeneratedPrompt, context: PromptContext) {
  if (!result.generatedStoryBrief?.trim()) {
    throw new Error("模型没有返回随机故事梗概");
  }

  if (!result.finalPromptMarkdown?.trim()) {
    throw new Error("模型没有返回完整视频 Prompt");
  }

  const storyBrief = result.generatedStoryBrief.trim();
  const returnedImages = Array.isArray(result.referenceImages) ? result.referenceImages : [];
  const images = ensureReferenceImagesCount(returnedImages, storyBrief, context);
  const invalidImage = images.find((img) => !img.title || !img.prompt);
  if (invalidImage) {
    throw new Error("模型返回的参考图标题或 Prompt 不完整，请重试生成");
  }
  const audios = Array.isArray(result.referenceAudios) ? result.referenceAudios : [];
  const normalizedAudios = normalizeReferenceAudios(audios, context);
  const promptBody = repairPromptReferenceConsistency(
    ensureStrictPromptMarkdown(result.finalPromptMarkdown, images, context),
    images,
    normalizedAudios,
    context
  );
  assertPromptReferenceConsistency(promptBody, normalizedAudios);
  assertAllReferenceMaterialsUsed(promptBody, {
    imageCount: images.length,
    videoCount: context.referenceVideoCount,
    audioCount: normalizedAudios.length,
  });
  const materialHeader = buildReferenceMaterialHeader(images, normalizedAudios, context);

  return {
    generatedStoryBrief: storyBrief,
    finalPromptMarkdown: `${materialHeader}\n\n${promptBody}`.trim(),
    referenceAudioMarkdown: buildReferenceAudioMarkdown(normalizedAudios, context),
    referenceImages: images,
  };
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonText = fenced?.[1] || trimmed;
  return JSON.parse(jsonText) as GeneratedPrompt;
}

function getTextApiKey(settings: ApiSettings) {
  const userKey = settings.textApiKey?.trim();
  if (userKey) return userKey;
  return process.env.ALLOW_SERVER_API_KEY_FALLBACK === "true" ? process.env.OPENAI_API_KEY || "" : "";
}

function getTextModel(settings: ApiSettings) {
  return settings.textModel?.trim() || process.env.OPENAI_TEXT_MODEL || "gpt-5.5";
}

function isRetryableGenerationError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return (
    /无法自动修正|模型没有返回|参考图|参考素材|JSON|Unexpected token|完整视频 Prompt|随机故事梗概/i.test(err.message) &&
    !/quota|429|billing|API Key|Unauthorized|401|403|network|ECONN|timeout/i.test(err.message)
  );
}

async function generateWithOpenAIResponses({
  apiKey,
  model,
  userPrompt,
}: {
  apiKey: string;
  model: string;
  userPrompt: string;
}) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: {
      format: {
        type: "json_schema",
        name: "video_prompt_generation",
        strict: true,
        schema: promptResponseSchema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("OpenAI returned empty response");
  }

  return parseJsonObject(response.output_text);
}

async function generateWithCompatibleChat({
  apiKey,
  baseURL,
  model,
  userPrompt,
}: {
  apiKey: string;
  baseURL: string;
  model: string;
  userPrompt: string;
}) {
  const openai = new OpenAI({ apiKey, baseURL });
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${userPrompt}

你必须只返回 JSON，不要包裹 markdown 代码块。JSON 字段必须是 generatedStoryBrief、finalPromptMarkdown、referenceImages、referenceAudios。`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model provider returned empty response");
  }

  return parseJsonObject(content);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit({
    key: `generate-prompt:${session.userId}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) {
    const response = rateLimitResponse(limit.resetAt);
    return NextResponse.json(response.body, response.init);
  }

  const project = await prisma.project.findFirst({ where: { id, userId: session.userId } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!project.durationSeconds || project.durationSeconds <= 0) {
    return NextResponse.json({ error: "请先设置视频时长" }, { status: 400 });
  }

  if (!PRIMARY_SCENES.includes(project.primaryScene as (typeof PRIMARY_SCENES)[number])) {
    return NextResponse.json({ error: "请先选择一级场景：漫剧、真人剧或电影" }, { status: 400 });
  }

  if (!SECONDARY_SCENES.includes(project.secondaryScene as (typeof SECONDARY_SCENES)[number])) {
    return NextResponse.json({ error: "请先选择二级场景" }, { status: 400 });
  }

  const referenceImageCount = clampCount(project.referenceImageCount, 6, 0, 12);
  const referenceVideoCount = clampCount(project.referenceVideoCount, 0, 0, 3);
  const referenceAudioCount = clampCount(project.referenceAudioCount, 0, 0, 4);
  const referenceBgmCount = clampCount(project.referenceBgmCount, 0, 0, 3);

  const body = await request.json().catch(() => ({}));
  const apiSettings = (body.apiSettings || {}) as ApiSettings;
  const textProvider = apiSettings.textProvider || "openai";
  const apiKey = getTextApiKey(apiSettings);
  if (!apiKey || apiKey.startsWith("replace-with")) {
    return NextResponse.json({ error: "请先在 API 设置中填写文本模型 API Key" }, { status: 500 });
  }

  if (textProvider !== "openai" && !apiSettings.textBaseUrl?.trim()) {
    return NextResponse.json({ error: "请先填写文本模型 Base URL" }, { status: 500 });
  }

  const model = getTextModel(apiSettings);
  const generationSeed = Math.floor(Math.random() * 1_000_000_000);
  const previousAudioMarkdown = project.referenceAudioMarkdown?.trim() || "无";
  const previousStoryBrief = project.storyBrief?.trim() || "无";
  const recentProjects = await prisma.project.findMany({
    where: {
      userId: session.userId,
      storyBrief: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select: {
      id: true,
      primaryScene: true,
      secondaryScene: true,
      storyBrief: true,
    },
  });
  const recentStoryBriefs = recentProjects
    .filter((item) => item.id !== project.id || item.storyBrief.trim() !== previousStoryBrief)
    .map((item, index) => `${index + 1}. ${item.primaryScene}/${item.secondaryScene}：${item.storyBrief.trim().slice(0, 220)}`)
    .join("\n") || "无";
  const recentStoryBriefList = recentProjects
    .map((item) => item.storyBrief.trim())
    .filter((brief) => brief && brief !== previousStoryBrief)
    .slice(0, 6);
  const selectedCameraMotionText =
    referenceVideoCount > 0
      ? Array.from({ length: referenceVideoCount }, (_, index) => {
          const selectedMotions = getCameraMotionSelection(project.cameraMotionStyle);
          return `参考视频${index + 1}：${selectedMotions[index % selectedMotions.length].label}`;
        }).join("；")
      : "未选择参考视频，不要在正文中引用参考视频";
  const ragQuery = [
    project.primaryScene,
    project.secondaryScene,
    project.stylePreset,
    project.dialogueMode === "yes" ? "对白" : "",
    project.voiceoverMode === "yes" ? "旁白" : "",
    selectedCameraMotionText,
  ]
    .filter(Boolean)
    .join(" ");
  const ragContext = formatScriptRagResults(searchScriptNarrativeRag(ragQuery, 3));

  const userPrompt = `请根据以下项目信息生成视频 Prompt：

故事梗概：不要使用旧梗概；请严格根据本次一级场景和二级场景随机生成一个新的短视频故事梗概，并返回到 generatedStoryBrief 字段。
视频时长：${project.durationSeconds} 秒
一级场景：${project.primaryScene}
二级场景：${project.secondaryScene}
类型硬约束：本次必须是“${project.primaryScene} / ${project.secondaryScene}”。如果 RAG、上一轮内容或任何示例与该类型冲突，必须忽略冲突内容，以用户本次选择为最高优先级。
本次生成批次ID：${generationSeed}
字幕模式：${project.subtitleMode || "none"}
对话台词：${INTENT_MODE_LABELS[project.dialogueMode] || INTENT_MODE_LABELS.auto}
画外旁白：${INTENT_MODE_LABELS[project.voiceoverMode] || INTENT_MODE_LABELS.auto}
参考图数量：${referenceImageCount} 张
参考视频数量：${referenceVideoCount} 段
音色参考数量：${referenceAudioCount} 段
BGM参考数量：${referenceBgmCount} 段
可选细分考点：${DETAIL_FOCUS_OPTIONS.join("、")}
${project.stylePreset ? `画风偏好：${project.stylePreset}` : "画风偏好：未指定，请根据题材选择"}
已选参考视频运镜方式：${selectedCameraMotionText}
上一轮参考音频出处：${previousAudioMarkdown}
上一轮本项目剧情梗概（必须避开，不得复用角色名、地点、道具、核心冲突、关键桥段和结尾）：${previousStoryBrief}
近期已生成剧情梗概（必须避开，不得复用）：\n${recentStoryBriefs}

本地剧情 RAG 参考（只允许抽象借鉴叙事节奏、冲突层级、证据递进和对白质感；不要照搬人物、地点、道具、世界观、题材类型、具体桥段或结尾。如果 RAG 与“${project.primaryScene}/${project.secondaryScene}”不一致，必须忽略 RAG；不要改变 finalPromptMarkdown 的模板结构，不要输出 RAG 来源、检索说明或数据库字样）：
${ragContext}

请严格返回结构化 JSON。referenceImages 数组数量必须等于参考图数量，且 referenceImages.kind 只能从 character、scene、prop 中选择；只能生成人物、场景、道具三类参考图，不要生成氛围图、关键动作图、光影图、风格图或其他参考图。
generatedStoryBrief 和 finalPromptMarkdown 的剧情类型必须与“${project.primaryScene}/${project.secondaryScene}”一致；必须和上一轮、近期梗概明显不同。不要复用旧角色名、旧地点、旧道具、旧核心事件或旧结尾。
每一条 referenceImages 必须与 finalPromptMarkdown 中对应的“参考图X”对象一致：title 要直接命名正文里出现的人物/道具/场景。prompt 必须是直接给生图模型的具体画面提示词，只写主体外观、构图、光线、材质、色彩、风格、清晰度和负面约束；不要写“根据剧情”“用于短视频”“故事梗概”“剧情作用”“服务镜头”“请生成”等说明式话术。若正文写“旧书（参考图2）”，referenceImages 第 2 条的 prompt 直接写旧书的外观、材质、磨损、摆放、光线和背景虚化；若正文写“雨夜旧街口（参考图3）”，第 3 条 prompt 直接写街口空间、雨水反光、灯光、建筑、构图和氛围。
人物参考图必须包含人物面部特写及正面、侧面、背面三视图。场景参考图只写具体空间、陈设、光线、色彩和构图；道具参考图只写具体外观、材质、尺寸、磨损、摆放和背景。场景与道具绝对不要写面部特写、人物三视图或四视图布局。
禁止使用“主角三视图”“重要配角三视图”“主场景设定图”“关键道具设定图”“补充场景设定图”“场景变化图”“补充道具特写图”等泛化占位标题。每个标题必须包含本次故事中可辨认的具体角色名、地点名或道具名；如果素材数量较多，应从正文中增加真实出现的角色、场景或道具，不得用空泛素材凑数。
剧情里所有具名角色都必须占用 character 类型参考图；如果角色说话，台词前必须同时贴近引用角色参考图和对应音色参考，例如“陈序（参考图1，参考音频1）：...”。不能出现只有参考音频没有参考图的具名角色台词。旁白可以没有参考图，但必须使用非 BGM 音色参考。背景音乐只能引用 BGM 参考音频。
referenceAudios 数组数量必须等于“音色参考数量 + BGM参考数量”。前者必须是人物、旁白或角色音色，必须写具体作品名和具体角色名，并且必须匹配人物说话语言：中文对白找中文影视/动画角色，日语对白找日本影视/动画角色，英语对白找英语影视/动画角色，其他语言同理。后者必须是 BGM，sourceCharacter 必须填“背景BGM”，sourceWork 必须是现有影视剧/电影/动画配乐或现有音乐曲目，禁止写“当前项目”“自选BGM”“原创BGM”“项目统一配乐”。referenceAudios 必须先输出全部音色参考，再输出全部 BGM 参考；正文中台词/旁白只能引用音色参考编号，背景音乐只能引用 BGM 参考编号。每条都要根据本次随机故事里的角色功能和本次生成批次ID动态选择具体出处，不要每次固定输出同一批角色。若上一轮参考音频出处不是“无”，本轮必须尽量避开上一轮相同的 sourceWork/sourceCharacter 组合，至少更换主要人物音色出处。如果音色参考数量和 BGM参考数量都为 0，referenceAudios 返回空数组。

finalPromptMarkdown 必须严格按这个结构输出：
参考图1：动态素材名
参考图2：动态素材名
参考视频1用于已选运镜/转场方式
参考音频1为本片音色用途

【整体风格】
整体视觉风格、色彩、光线、材质、节奏和气质。
全片无字幕、无文字特效、无水印，不出现清晰可读文字。

【全局约束】
人物、道具、场景、特效和参考视频/参考音频使用约束。

镜头一
景别：具体景别
运镜：具体运镜（参考视频1）
内容：导演手记式连续分镜正文，人物/道具/场景/台词/旁白/声音的参考编号必须牢牢跟在对象后面。
背景音乐：BGM 情绪与进入方式（参考音频X）（仅有 BGM 时输出）
转场：具体转场方式（仅有转场时输出）

镜头二
景别：具体景别
运镜：具体运镜（参考视频X）
内容：继续推进剧情。

不要输出元信息块，不要输出【画幅】，不要输出画幅比例，不要输出时间戳，不要输出参考图 Prompt/参考视频描述/参考音频描述等旧章节。参考素材清单只列编号和名称/用途，不要放图片生成 Prompt、音频详细出处或参考视频生成 Prompt。镜头个数必须根据视频时长和剧情复杂度动态生成：10秒以内2-3个，10-20秒3-5个，20-40秒5-7个，40-60秒7-10个，60-90秒10-14个，90秒以上14个以上。1-15秒视频 finalPromptMarkdown 约900个中文字符，16-30秒视频约1400个中文字符，上下浮动约15%。每个镜头都必须按“景别/运镜/内容/背景音乐/转场”字段格式输出，其中背景音乐和转场按需出现。运镜与转场必须合理、有逻辑承接，不能突兀炫技；转场必须说明动作、遮挡、光色、视线、道具、运动方向、声音节奏或情绪推进中的承接依据。参考视频只能在运镜或转场字段中作为（参考视频X）贴近标注，不要生成参考视频 Prompt；参考音频在内容或背景音乐字段中作为（参考音频X）贴近标注，详细出处交给 referenceAudios 字段。`;

  const promptContext: PromptContext = {
      primaryScene: project.primaryScene,
      secondaryScene: project.secondaryScene,
      stylePreset: project.stylePreset,
      cameraMotionStyle: project.cameraMotionStyle,
      referenceImageCount,
      referenceVideoCount,
      referenceAudioCount,
      referenceBgmCount,
      generationSeed,
      previousAudioMarkdown,
      previousStoryBrief,
      recentStoryBriefs: recentStoryBriefList,
  };

  try {
    let result: ReturnType<typeof validateGeneratedPrompt> | null = null;
    let lastGenerationError: unknown = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const repairPrompt =
        attempt === 1
          ? userPrompt
          : `${userPrompt}

上一轮输出没有通过后端一致性校验，失败原因：${lastGenerationError instanceof Error ? lastGenerationError.message : "未知格式错误"}。
请不要解释原因，直接重新生成完整 JSON。referenceImages 必须严格达到用户指定数量，每一项都必须对应正文真实出现的具体人物、具体场景或具体道具，并写成可直接生图的具体 Prompt；严禁使用“补充场景”“关键道具”“场景变化”等占位内容。角色说台词尽量带人物参考图和非 BGM 音色参考；背景音乐使用 BGM 参考音频；参考音频编号和用途保持一致。`;

      try {
        const generated =
          textProvider === "openai"
            ? await generateWithOpenAIResponses({ apiKey, model, userPrompt: repairPrompt })
            : await generateWithCompatibleChat({
                apiKey,
                baseURL: apiSettings.textBaseUrl?.trim() || "",
                model,
                userPrompt: repairPrompt,
              });

        result = validateGeneratedPrompt(generated, promptContext);
        break;
      } catch (attemptError) {
        lastGenerationError = attemptError;
        if (!isRetryableGenerationError(attemptError) || attempt === maxAttempts) {
          throw attemptError;
        }
      }
    }

    if (!result) {
      throw lastGenerationError instanceof Error ? lastGenerationError : new Error("模型生成失败");
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          storyBrief: result.generatedStoryBrief,
          finalPromptMarkdown: result.finalPromptMarkdown,
          referenceAudioMarkdown: result.referenceAudioMarkdown,
        },
      });

      await tx.referenceImage.deleteMany({ where: { projectId: id } });

      for (const img of result.referenceImages) {
        await tx.referenceImage.create({
          data: {
            projectId: id,
            index: img.index,
            kind: img.kind,
            title: img.title,
            prompt: img.prompt,
            size: img.kind === "character" ? "1536x1024" : "1024x1536",
          },
        });
      }
    });

    const updated = await prisma.project.findFirst({
      where: { id },
      include: { referenceImages: { orderBy: { index: "asc" } } },
    });

    return NextResponse.json({ project: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: formatProviderError(err) }, { status: 500 });
  }
}
