# AgentRound

多模型圆桌讨论工具 —— 让多个 AI 模型共享上下文、依次发言、协作达成共识。

## 项目概述

- **核心功能**：用户发起话题 → 多模型轮次发言 → 用户引导 → 达成共识
- **新特性**：
    - 支持多种 LLM Provider (OpenAI, Anthropic, Google, Ollama)
    - 实时 SSE流式响应
    - 前端可配置 Prompt 和 API Key
    - **动态模型/Provider 管理** (支持 UI 添加自定义模型)
    - **UI/UX 优化**：优化的对话滚动体验与输入布局
    - 支持一键关闭服务释放端口
- **详细规划**：见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)

---

## 后端 (Backend)


### 技术栈

- FastAPI + Uvicorn
- Pydantic v2
- SQLite + SQLAlchemy（持久化）
- SSE（流式输出）

### 一键启动（推荐）

```bash
# Windows 双击 start.bat
# 或命令行执行
python start.py
```

说明：启动脚本会尝试安装依赖、释放占用端口；若 `8000` 被占用，将在 `8000-8010` 中选择可用端口并自动打开浏览器。

### 手动启动

```bash
# 1. 安装依赖
pip install -r backend/requirements.txt

# 2. 配置 Provider（编辑 API Key）
# 编辑 config/providers.yaml 设置 API Key

# 3. 启动后端
uvicorn backend.main:app --reload --port 8000
```

### 环境变量

- `DATABASE_URL`：自定义数据库连接字符串（默认 `sqlite:///data/chat.db`）
- `SESSION_STORE_BACKEND`：`sqlite` 或 `memory`（默认 `sqlite`）
- `SSE_TOKEN_DELAY_MS`：SSE 分块发送延迟（毫秒，默认 0）
- `SSE_TOKEN_CHUNK_SIZE`：SSE 分块大小（默认 4）
- `TITLE_MAX_LENGTH`：自动标题最大长度（默认 24）
- `THOUGHT_FILTER_ENABLED`：是否过滤 `<think>` 等思维链（默认 true）
- `PORT`：启动脚本默认端口（默认 8000）
- `ENABLE_RELOAD`：启动脚本是否启用热更新（默认 0）

### 停止服务

- 前端设置页点击“关闭服务”（调用 `/api/shutdown`）
- 或在运行窗口按 `Ctrl + C`

### API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/providers` | 获取模型列表 |
| `GET` | `/api/providers/{id}` | 获取单个 Provider |
| `PUT` | `/api/providers/{id}` | 更新 Provider 配置 |
| `POST` | `/api/providers` | **新增 Provider** |
| `POST` | `/api/providers/{id}/models` | **新增模型** |
| `GET` | `/api/providers/{pid}/models/{mid}/prompt` | 获取模型提示词 |
| `PUT` | `/api/providers/{pid}/models/{mid}/prompt` | 更新模型提示词 |
| `POST` | `/api/sessions` | 创建会话 |
| `GET` | `/api/sessions` | 获取会话列表 |
| `GET` | `/api/sessions/{id}` | 获取会话详情 |
| `DELETE` | `/api/sessions/{id}` | 删除会话 |
| `PATCH` | `/api/sessions/{id}` | 更新会话信息 |
| `POST` | `/api/sessions/{id}/start` | 开始首轮对话 |
| `POST` | `/api/sessions/{id}/continue` | 继续下一轮对话 |
| `POST` | `/api/sessions/{id}/end` | 结束对话 |
| `GET` | `/api/sessions/{id}/stream` | SSE 流式输出 |
| `POST` | `/api/shutdown` | 关闭后端服务 |

> 完整 API 文档见 `http://localhost:8000/docs`

### 开发状态

<!-- Backend Agent 更新此处 -->
- [x] 项目初始化
- [x] Provider 抽象层
- [x] OpenAI Provider
- [x] Session 管理
- [x] SSE 流式输出（Token 分块）
- [x] SQLite 持久化

---

## 前端 (Frontend)


### 技术栈

- HTML5 + Vanilla JavaScript
- Tailwind CSS (CDN)
- Phosphor Icons

### 本地开发

前端静态文件位于 `frontend/` 目录，由后端 FastAPI 托管：

```bash
# 启动后端后，访问（默认端口 8000）
http://localhost:8000/

# 若使用启动脚本自动换端口，请以脚本打开的地址为准
```

或使用任意静态服务器：

```bash
# 使用 Python 内置服务器
cd frontend && python -m http.server 8080
```

### 目录结构

```
frontend/
├── index.html          # 主页面
├── settings.html       # 设置页面
├── css/
│   └── styles.css      # 自定义样式
└── js/
    ├── app.js          # 主应用逻辑
    ├── api.js          # 后端 API 调用
    ├── chat.js         # 聊天功能
    ├── sidebar.js      # 侧边栏
    └── utils.js        # 工具函数
```

### 开发状态

<!-- Frontend Agent 更新此处 -->
- [x] 页面结构
- [x] 三栏布局
- [x] 消息气泡组件
- [x] API 集成 (动态端口适配)
- [x] SSE 流式接收
- [x] 设置页面 (Prompt/Provider 配置)
- [x] 关闭服务功能
- [x] 布局与滚动优化 (解决输入框遮挡)
- [ ] 模型拖拽排序

---

## 配置说明

### providers.yaml

```yaml
providers:
  - id: openai-main
    name: OpenAI
    type: openai
    api_key: ${OPENAI_API_KEY}  # 支持环境变量
    models:
      - id: gpt-4o
        display_name: GPT-4o
        color: teal
        icon: robot
```

---

## License

MIT
