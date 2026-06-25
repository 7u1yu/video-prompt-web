import fs from "node:fs";
import path from "node:path";

interface RagChunk {
  chunk_id: string;
  source_path: string;
  section: string;
  chunk_type: string;
  text: string;
  tags: string[];
}

interface RagIndex {
  vectors: Record<string, Record<string, number>>;
}

interface LoadedRag {
  chunks: Map<string, RagChunk>;
  vectors: Record<string, Record<string, number>>;
  norms: Map<string, number>;
}

export interface ScriptRagResult {
  score: number;
  chunkId: string;
  sourcePath: string;
  section: string;
  chunkType: string;
  tags: string[];
  preview: string;
}

const DEFAULT_RAG_DATA_DIR = path.join(process.cwd(), "script_narrative_rag", "data");

let cachedRag: LoadedRag | null = null;
let cachedRagDir = "";

function charNgrams(text: string) {
  const clean = text.toLowerCase().replace(/\s+/g, "");
  const grams: string[] = [];

  for (const n of [2, 3]) {
    for (let index = 0; index <= clean.length - n; index += 1) {
      grams.push(clean.slice(index, index + n));
    }
  }

  grams.push(...Array.from(text.toLowerCase().matchAll(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]{2,}/g), (match) => match[0]));
  return grams;
}

function countTerms(terms: string[]) {
  const counts = new Map<string, number>();
  for (const term of terms) {
    counts.set(term, (counts.get(term) || 0) + 1);
  }
  return counts;
}

function loadRag(dataDir = process.env.SCRIPT_NARRATIVE_RAG_DIR || DEFAULT_RAG_DATA_DIR) {
  if (cachedRag && cachedRagDir === dataDir) return cachedRag;

  const indexPath = path.join(dataDir, "index.json");
  const chunksPath = path.join(dataDir, "chunks.jsonl");
  if (!fs.existsSync(indexPath) || !fs.existsSync(chunksPath)) {
    return null;
  }

  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as RagIndex;
    const chunks = new Map<string, RagChunk>();
    for (const line of fs.readFileSync(chunksPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as RagChunk;
      chunks.set(chunk.chunk_id, chunk);
    }

    const norms = new Map<string, number>();
    for (const [chunkId, vector] of Object.entries(index.vectors)) {
      let norm = 0;
      for (const weight of Object.values(vector)) {
        norm += weight * weight;
      }
      norms.set(chunkId, Math.sqrt(norm));
    }

    cachedRagDir = dataDir;
    cachedRag = { chunks, vectors: index.vectors, norms };
    return cachedRag;
  } catch {
    return null;
  }
}

export function searchScriptNarrativeRag(query: string, topK = 5): ScriptRagResult[] {
  const rag = loadRag();
  if (!rag) return [];

  const queryCounts = countTerms(charNgrams(query));
  let queryNorm = 0;
  for (const count of queryCounts.values()) {
    queryNorm += count * count;
  }
  queryNorm = Math.sqrt(queryNorm);
  if (queryNorm === 0) return [];

  const scored: ScriptRagResult[] = [];
  for (const [chunkId, vector] of Object.entries(rag.vectors)) {
    let dot = 0;
    for (const [term, count] of queryCounts) {
      dot += count * (vector[term] || 0);
    }
    if (dot <= 0) continue;

    const vectorNorm = rag.norms.get(chunkId) || 0;
    if (vectorNorm === 0) continue;

    const chunk = rag.chunks.get(chunkId);
    if (!chunk) continue;

    const score = dot / (queryNorm * vectorNorm);
    scored.push({
      score,
      chunkId,
      sourcePath: chunk.source_path,
      section: chunk.section,
      chunkType: chunk.chunk_type,
      tags: chunk.tags || [],
      preview: chunk.text.replace(/\s+/g, " ").slice(0, 520),
    });
  }

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map((result) => ({ ...result, score: Number(result.score.toFixed(4)) }));
}

export function formatScriptRagResults(results: ScriptRagResult[]) {
  if (results.length === 0) return "无可用 RAG 检索结果。";

  return results
    .map((result, index) => {
      return [
        `RAG参考${index + 1}`,
        `类型：${result.chunkType}`,
        `章节：${result.section}`,
        `标签：${result.tags.join("、") || "无"}`,
        `来源：${result.sourcePath}`,
        `片段：${result.preview}`,
      ].join("\n");
    })
    .join("\n\n");
}
