# Script Narrative RAG Data

This directory is optional runtime data for story reference only. It must not change the final prompt template.

Expected files live in `script_narrative_rag/data` and are tracked with Git LFS:

- `index.json`
- `chunks.jsonl`
- optional metadata files such as `documents.json`, `manifest.json`, `style_profiles.json`

If these files are missing, prompt generation continues without RAG reference.
