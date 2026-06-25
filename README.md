# Video Prompt Web

一个可本地部署的视频 Prompt 生成工具。默认包含注册登录、项目库、视频 Prompt 生成、参考图片 Prompt、音色/BGM 参考和可选剧情 RAG 参考。

## 本地 Docker 部署

```bash
git clone <your-repo-url>
cd video-prompt-web
npm run setup:local
git lfs install
git lfs pull
docker compose up --build
```

打开 [http://localhost:3000](http://localhost:3000)，注册账号后使用。

模型 API Key 默认由每个用户在网页里的 API 设置中填写，不需要写进仓库。服务端默认不读取 `OPENAI_API_KEY` 作为兜底，避免误把个人 Key 打包发布。

## 环境变量

复制 `.env.example` 到 `.env`，或运行 `npm run setup:local` 自动生成。

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | SQLite 数据库路径，Docker 默认是 `file:/app/data/dev.db` |
| `SESSION_SECRET` | 32 字符以上随机字符串，不能使用固定默认值 |
| `ALLOW_REGISTRATION` | 是否允许本地注册，默认 `true` |
| `ALLOW_SERVER_API_KEY_FALLBACK` | 是否允许服务端环境变量兜底 API Key，默认 `false` |
| `SESSION_COOKIE_SECURE` | 本地 HTTP 调试通常为 `false` |
| `OPENAI_TEXT_MODEL` | OpenAI 文本模型名，仅作为供应商预设 |
| `OPENAI_IMAGE_MODEL` | OpenAI 图片模型名，仅作为供应商预设 |
| `SCRIPT_NARRATIVE_RAG_DIR` | 可选 RAG 数据目录 |

## 持久化数据

Docker Compose 会把数据保存到本机目录：

- `./data`：SQLite 数据库
- `./uploads`：生成或上传的图片文件
- `./script_narrative_rag/data`：可选剧情 RAG 数据，只作为剧情参考

这些目录不会提交到 Git。RAG 大文件通过 Git LFS 管理，缺失时生成流程会自动降级，不阻塞 Prompt 生成。

## 开发

```bash
npm install
npm run setup:local
npx prisma migrate deploy
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 上传 GitHub 前检查清单

发布前必须运行：

```bash
npm run lint
npm run build
npm run security:check
```

同时确认：

- `.env`、`.env.local`、真实数据库、`uploads/` 没有被 Git 跟踪
- `.env.example` 只包含占位值
- 仓库中没有真实 API Key、Bearer Token、Cookie Secret
- 仓库中没有本机绝对路径
- RAG 数据内容本身允许公开

可辅助检查：

```bash
git ls-files .env dev.db uploads data
git status --ignored
```

## 常见问题

如果容器启动时报 `SESSION_SECRET` 错误，先运行：

```bash
npm run setup:local
```

如果不需要 RAG，保持 `script_narrative_rag/data` 为空即可。最终生成的 Prompt 不会输出 RAG 来源、检索说明或数据库字样。
