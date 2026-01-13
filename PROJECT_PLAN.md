# 多模型协作对话系统 - 项目计划

> **文档用途**：本文件是项目的主控文档，用于定义需求、记录进度、下达指令。
> 
> **更新时间**：2026-01-11

---

## 一、项目概述

### 1.1 核心目标

构建一个**多 AI 模型圆桌讨论系统**：
- 用户发起话题，选择参与讨论的模型
- 多个模型按轮次依序发言，共享完整上下文
- 每轮结束后，用户可以认可共识结束，或发言引导方向开启下一轮
- 类似主流 AI 对话网页的气泡式聊天界面

### 1.2 交互流程

```
┌─────────────────────────────────────────────────────────────────┐
│  用户发起话题: "如何设计一个高可用的微服务架构？"                      │
│  用户选择模型: [GPT-4] [Claude] [Gemini]                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  【第 1 轮讨论】                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🤖 GPT-4: 我建议采用服务网格架构...                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🟣 Claude: GPT的方案不错，但我想补充关于熔断机制...           │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🔵 Gemini: 综合两位的观点，我认为可以这样整合...              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  【用户决策点】                                                    │
│  [✓ 认可共识，结束讨论]    [💬 我来补充/引导方向]                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (如果用户选择补充)
┌─────────────────────────────────────────────────────────────────┐
│  👤 用户: 请重点讨论一下灾备方案，我更关心跨区域容灾...               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  【第 2 轮讨论】模型们继续基于新的引导发言...                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 项目状态

| 阶段 | 状态 | 说明 |
|------|------|------|
| 需求定义 | ✅ 已确认 | v2.0 |
| 架构设计 | ✅ 已确认 | 前后端分离 |
| 后端开发 | ✅ 已完成 | 模板 API、导出 API |
| 前端开发 | ✅ 已完成 | v2.0 功能完整 |
| 测试验证 | ✅ 已完成 | 用户验收 |

---

## 二、系统架构（前后端分离）

### 2.1 架构概览

```
┌────────────────────────────────────────────────────────────────┐
│                        用户浏览器                               │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    前端 (Web UI)                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • HTML + Tailwind CSS + Vanilla JS                       │  │
│  │  • 气泡式聊天界面、模型选择器、侧边栏                        │  │
│  │  • Fetch API 调用后端 REST / SSE 流式                      │  │
│  │  • Phosphor Icons 图标库                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                    由 FastAPI 静态托管 或独立部署               │
└────────────────────────────────────────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    后端 (FastAPI)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • REST API 接口                                          │  │
│  │  • 会话管理 (Session)                                      │  │
│  │  • 轮次调度 (Round)                                        │  │
│  │  • Provider 管理 (LLM 调用)                                │  │
│  │  • 数据持久化 (SQLite)                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                         端口: 8000                              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    外部 LLM APIs                                │
│         OpenAI  │  Anthropic  │  Google  │  Ollama             │
└────────────────────────────────────────────────────────────────┘
```

说明：默认端口为 8000，使用启动脚本时若端口被占用会自动切换到 8000-8010。

### 2.2 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| **后端框架** | FastAPI | 异步、自动生成 OpenAPI 文档、静态文件托管 |
| **前端技术** | HTML + Tailwind CSS + JS | 纯 Web UI，无框架依赖 |
| **图标库** | Phosphor Icons | 轻量级 SVG 图标 |
| **数据模型** | Pydantic v2 | 请求/响应模型、自动验证 |
| **LLM 调用** | openai + httpx | 兼容多 Provider |
| **持久化** | SQLite + SQLAlchemy | 会话/消息存储 |
| **配置存储** | YAML 文件 | Provider API 密钥配置 |
| **通信协议** | REST + SSE | SSE 用于流式输出 |

### 2.3 后端 API 设计

#### 2.3.0 系统

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/api/health` | 健康检查（返回后端状态） |
| `POST` | `/api/shutdown` | **关闭服务**（停止进程释放端口） |

#### 2.3.1 Provider 管理

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/api/providers` | 获取所有已配置的 Provider 及其模型列表 |
| `GET` | `/api/providers/{id}` | 获取单个 Provider 详情 |
| `PUT` | `/api/providers/{id}` | 更新 Provider 配置（API Key 等），写入 YAML |
| `POST` | `/api/providers/reload` | 重新加载 YAML 配置 |


> Provider 的增删通过编辑 `config/providers.yaml` 文件，API 支持编辑配置及 Prompt。

| `POST` | `/api/providers` | **新增 Provider** |
| `POST` | `/api/providers/{pid}/models` | **新增模型** |

#### 2.3.1.1 模型 Prompt 配置

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/api/providers/{pid}/models/{mid}/prompt` | 获取特定模型的系统提示词 |
| `PUT` | `/api/providers/{pid}/models/{mid}/prompt` | 更新特定模型的系统提示词 |

#### 2.3.2 会话管理

| 方法 | 路径 | 描述 |
|------|------|------|
| `POST` | `/api/sessions` | 创建新会话（指定参与模型列表） |
| `GET` | `/api/sessions` | 获取历史会话列表 |
| `GET` | `/api/sessions/{id}` | 获取会话详情（含所有消息） |
| `DELETE` | `/api/sessions/{id}` | 删除会话 |
| `PATCH` | `/api/sessions/{id}` | 更新会话（如标题） |

#### 2.3.3 对话交互

| 方法 | 路径 | 描述 |
|------|------|------|
| `POST` | `/api/sessions/{id}/start` | 发起话题，开始第一轮讨论 |
| `POST` | `/api/sessions/{id}/continue` | 用户引导发言，继续下一轮 |
| `POST` | `/api/sessions/{id}/end` | 认可共识，结束会话 |
| `GET` | `/api/sessions/{id}/stream` | **SSE 流式输出**（核心） |

### 2.4 SSE 流式输出规范

前端通过 `EventSource` 订阅 `/api/sessions/{id}/stream`，接收以下事件：

```
event: round_start
data: {"round": 1}

event: model_start
data: {"model": "gpt-4", "display_name": "GPT-4", "color": "teal"}

event: token
data: {"content": "建议"}

event: token
data: {"content": "采用"}

event: model_end
data: {"model": "gpt-4", "status": "success"}

event: model_start
data: {"model": "claude-3.5", "display_name": "Claude 3.5", "color": "violet"}

...

event: model_error
data: {"model": "gemini", "error": "API timeout", "skipped": true}

event: round_end
data: {"round": 1, "awaiting_decision": true}

event: session_end
data: {"status": "consensus_reached"}

event: title_generated
data: {"title": "微服务高可用架构设计方案"}
```

**设计决策**：
- ✅ **依次流式输出**：每个模型完成后再切换到下一个
- ✅ **失败跳过**：单个模型调用失败时发送 `model_error` 事件，继续下一个
- ✅ **前端决策卡片**：根据 `round_end` 事件显示
- ✅ **会话标题生成**：第一个模型回复后，异步调用生成摘要标题，通过 `title_generated` 事件推送
- ✅ **发言顺序**：用户可拖拽调整模型顺序，顺序保存在 Session.selected_models 中
- ✅ **最大轮次**：用户可在设置中配置（默认无限制），每轮结束用户可选择结束
- ✅ **API Key 编辑**：设置页面支持在线编辑，保存后写入 YAML 文件

### 2.5 数据模型（Pydantic Schema）

#### Provider（从 YAML 加载）

```python
class ProviderConfig(BaseModel):
    id: str                    # 唯一标识，如 "openai-main"
    name: str                  # 显示名称，如 "OpenAI"
    type: str                  # 类型: openai / anthropic / google / ollama
    api_key: str               # API 密钥
    base_url: str | None       # 自定义 endpoint
    models: list[ModelConfig]  # 可用模型列表

class ModelConfig(BaseModel):
    id: str                    # 如 "gpt-4o"
    display_name: str          # 如 "GPT-4o"
    color: str                 # UI 颜色，如 "teal"
    icon: str                  # 图标，如 "robot"
    prompt: str | None         # 模型系统提示词
```

#### Session & Message

```python
class Session(BaseModel):
    id: str
    title: str
    status: Literal["active", "ended"]
    selected_models: list[str]  # 模型 ID 列表
    created_at: datetime
    updated_at: datetime

class Message(BaseModel):
    id: str
    session_id: str
    round: int
    role: Literal["user", "assistant"]
    model_id: str | None       # assistant 消息才有
    content: str
    timestamp: datetime
    status: Literal["success", "error", "skipped"]
```

### 2.6 配置文件格式

`config/providers.yaml` 示例：

```yaml
providers:
  - id: openai-main
    name: OpenAI
    type: openai
    api_key: ${OPENAI_API_KEY}  # 支持环境变量
    base_url: null
    models:
      - id: gpt-4o
        display_name: GPT-4o
        color: teal
        icon: robot
        prompt: null
      - id: gpt-4o-mini
        display_name: GPT-4o Mini
        color: teal
        icon: robot

  - id: anthropic-main
    name: Anthropic
    type: anthropic
    api_key: ${ANTHROPIC_API_KEY}
    models:
      - id: claude-3-5-sonnet
        display_name: Claude 3.5 Sonnet
        color: violet
        icon: brain

  - id: ollama-local
    name: Ollama (本地)
    type: ollama
    base_url: http://localhost:11434
    api_key: null
    models:
      - id: llama3
        display_name: Llama 3
        color: orange
        icon: cpu
```

### 2.7 其他后端要点

#### CORS 配置

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 静态文件托管

```python
# FastAPI 托管前端静态文件
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
```

#### 启动命令

```bash
# 一键启动（推荐）
# Windows 可直接双击 start.bat
python start.py

# 开发模式
uvicorn backend.main:app --reload --port 8000

# 生产模式
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```


---

## 三、功能需求（v1.0）

### 3.1 核心功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| **模型选择器** | 用户在对话开始前勾选参与讨论的模型 | P0 |
| **轮次发言机制** | 每轮内选定模型按顺序依次发言，共享完整上下文 | P0 |
| **用户引导发言** | 每轮结束后，用户可插入发言引导下一轮方向 | P0 |
| **气泡式对话UI** | 类似 ChatGPT/Gemini，每个模型有独立名称/头像/颜色 | P0 |
| **结束确认** | 用户可随时认可共识，结束讨论 | P0 |

### 3.2 辅助功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Provider 配置 | 用户可配置多个 API（API Key、Base URL） | P1 |
| 对话历史 | 保存/加载历史对话 | P1 |
| 流式输出 | 模型发言实时流式显示 | P1 |
| 暗色主题 | 支持暗色/亮色切换 | P2 |
| 导出功能 | 导出对话为 Markdown | P2 |

### 3.3 界面设计规范

> **效果参考**：`frontend.html` 文件  
> **技术栈**：Tailwind CSS + Phosphor Icons

#### 布局草图

```
+-----------------------------------------------------------------------------------+
| [Sidebar: bg-gray-50]     | [Header: bg-white/80 backdrop-blur, border-b]         |
|  w-72, border-r           |  h-16, 模型胶囊标签 + 状态指示灯                        |
|                           |                                                       |
| 🤖 Logo  AgentRound       |  参与模型: [✓ GPT-4] [✓ Claude 3.5] [+]                |
| -----------------------   |  ● 讨论中 (Round 1)  [amber 呼吸动画]                  |
|                           +-------------------------------------------------------+
| [+ 新一轮讨论] 按钮        | [Main Chat Area: 点阵背景]                            |
|                           |  bg-[radial-gradient(#e5e7eb_1px,transparent_1px)]    |
| 今天                      |                                                       |
|  🔵 微服务高可用架构       |                                    [用户气泡: 右对齐]  |
|  ○ Rust vs Go 性能对比    |                    bg-blue-600 text-white rounded-2xl  |
|                           |                    "我们需要重构现有的单体应用..."      |
|                           |                                                       |
|                           |         -------- ↻ 第 1 轮开始 --------               |
|                           |                                                       |
| -----------------------   | 🤖 GPT-4 [teal-100 头像]                              |
| ⚙️ 设置                  |    bg-white border-teal-100 rounded-2xl rounded-tl-none|
|                           |    "建议采用 Spring Cloud 生态..."                     |
|                           |                                                       |
|                           | 🧠 Claude 3.5 [violet-100 头像]                       |
|                           |    bg-white border-violet-100                          |
|                           |    "同意。补充一点，建议引入 Kafka..."                 |
|                           |                                                       |
|                           |   ┌─────────────────────────────────────┐             |
|                           |   │ 本轮讨论结束                         │             |
|                           |   │ 请决定下一步行动                     │             |
|                           |   │ [认可共识]  [引导下一轮]             │             |
|                           |   └─────────────────────────────────────┘             |
+---------------------------+-------------------------------------------------------+
                            | [Input: 悬浮框 shadow-xl rounded-2xl p-2]             |
                            | [ 输入指令...                        [发送✈️] ]       |
                            +-------------------------------------------------------+
```

#### 颜色系统（Tailwind 原生）

| 模型 | 主色 | 背景 | 边框 | CSS变量 |
|------|------|------|------|---------|
| **GPT-4** | `teal-700` | `teal-50/100` | `teal-100` | `#0d9488` |
| **Claude** | `violet-700` | `violet-50/100` | `violet-100` | `#7c3aed` |
| **Gemini** | `blue-700` | `blue-50/100` | `blue-100` | `#2563eb` |
| **用户** | `white` | `blue-600` | - | `#2563eb` |

#### 组件详细规范

| 组件 | Tailwind 类 | 说明 |
|------|-------------|------|
| **Sidebar** | `w-72 bg-gray-50 border-r border-gray-200` | 固定宽度 288px |
| **新对话按钮** | `bg-white border border-gray-200 hover:border-blue-400 rounded-xl shadow-sm` | 描边按钮 |
| **选中会话** | `bg-blue-50 text-blue-700 border border-blue-100 rounded-xl` | 蓝色高亮 |
| **Header** | `h-16 bg-white/80 backdrop-blur-md border-b border-gray-100` | 毛玻璃效果 |
| **模型胶囊** | `px-3 py-1 rounded-full bg-{color}-50 text-{color}-700 border border-{color}-200` | 各模型独立颜色 |
| **状态指示** | `flex items-center gap-2 text-amber-600 bg-amber-50 rounded-full` + `animate-ping` | 呼吸灯动画 |
| **聊天区** | `bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]` | 点阵背景 |
| **用户气泡** | `bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none shadow-md` | 右对齐，右上无圆角 |
| **模型气泡** | `bg-white border border-{color}-100 p-4 rounded-2xl rounded-tl-none shadow-sm` | 左对齐，左上无圆角 |
| **模型头像** | `w-6 h-6 bg-{color}-100 rounded text-{color}-700` | 小圆角方形 |
| **轮次标记** | `bg-gray-100 px-3 py-1 rounded-full border border-gray-200 text-xs text-gray-500` | 胶囊居中 |
| **决策卡片** | `bg-white/90 backdrop-blur border border-gray-200 p-4 rounded-2xl shadow-lg` | 毛玻璃浮层 |
| **输入框** | `rounded-2xl shadow-xl border border-gray-200 p-2` | 悬浮大阴影 |
| **发送按钮** | `bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-xl` | 蓝色实心 |

#### 动效规范

| 效果 | 实现 |
|------|------|
| **打字机光标** | `::after { content: '\|'; animation: blink 1s step-start infinite; }` |
| **状态呼吸灯** | `animate-ping` + 双层圆点 |
| **决策卡片入场** | `transition-all duration-500 opacity-0 → opacity-100` |
| **滚动条** | 自定义 6px 宽，圆角，灰色 |

#### 图标库

使用 **Phosphor Icons**（`@phosphor-icons/web`）：
- Logo: `ph-chats-circle`
- GPT: `ph-robot` / `ph-robot-fill`
- Claude: `ph-brain` / `ph-brain-fill`
- Gemini: `ph-sparkle` / `ph-sparkle-fill`
- 新建: `ph-plus`
- 设置: `ph-gear`
- 发送: `ph-paper-plane-tilt`
- 轮次: `ph-arrows-clockwise`




---

## 四、项目结构（前后端分离）

```
Agent_Client/
├── PROJECT_PLAN.md              # 📌 本文件 - 项目主控文档
├── README.md                    # 项目说明
├── start.py                     # 一键启动脚本
├── start.bat                    # Windows 双击启动
│
├── backend/                     # ========== 后端 ==========
│   ├── main.py                  # FastAPI 入口
│   ├── requirements.txt         # 后端依赖
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── providers.py     # /api/providers
│   │   │   └── sessions.py      # /api/sessions
│   │   └── schemas.py           # Pydantic 请求/响应模型
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── session.py           # 会话管理逻辑
│   │   ├── round.py             # 轮次调度逻辑
│   │   ├── context.py           # 上下文管理
│   │   └── filters.py           # 思维链过滤
│   │
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py              # Provider 抽象接口
│   │   ├── openai_provider.py   # OpenAI/兼容 API
│   │   ├── anthropic_provider.py
│   │   ├── google_provider.py
│   │   └── registry.py          # Provider 注册表
│   │
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── database.py          # SQLAlchemy 配置
│   │   ├── models.py            # ORM 模型
│   │   ├── session_store.py     # SQLite 会话存储
│   │   └── store_factory.py     # 存储后端选择
│   │
│   └── config/
│       └── settings.py          # 配置管理
│
├── frontend/                    # ========== 前端 (Web UI) ==========
│   ├── index.html               # 主页面
│   ├── settings.html            # 设置页面
│   │
│   ├── css/
│   │   └── styles.css           # 自定义样式（Tailwind 扩展）
│   │
│   ├── js/
│   │   ├── app.js               # 主应用逻辑
│   │   ├── api.js               # API 调用封装
│   │   ├── chat.js              # 聊天功能
│   │   ├── sidebar.js           # 侧边栏逻辑
│   │   └── utils.js             # 工具函数
│   │
│   └── assets/
│       └── icons/               # 可选本地图标
│
├── config/
│   └── providers.yaml           # Provider 配置文件
│
└── data/
    └── chat.db                  # SQLite 数据库
```

---

## 五、开发阶段（前后端并行）

### 后端开发路线

#### Phase B1：基础框架 + Provider
- [x] 初始化 FastAPI 项目结构
- [x] 实现 Provider 抽象接口
- [x] 实现 OpenAI Provider
- [x] `/api/providers` 接口

#### Phase B2：会话与轮次
- [x] 实现 Session 管理
- [x] 实现 Round 轮次调度
- [x] 共享上下文管理
- [x] `/api/sessions/*` 接口

#### Phase B3：持久化 + 流式
- [x] SQLite 数据持久化
- [x] SSE 流式输出
- [x] 历史会话接口

---

### 前端开发路线 (Web UI)

#### Phase F1：基础页面
- [x] 创建 `index.html` 主页面结构
- [x] 引入 Tailwind CSS CDN + Phosphor Icons
- [x] 实现三栏布局（Sidebar / Main / Input）
- [x] 实现消息气泡 HTML/CSS

#### Phase F2：核心交互
- [x] `api.js` 封装 Fetch 调用后端
- [x] `chat.js` 实现发送消息、渲染回复
- [x] 模型选择器胶囊标签
- [ ] 轮次分割线 + 决策卡片
- [x] SSE 流式接收 + 打字机效果

#### Phase F3：完善功能
- [x] `sidebar.js` 历史会话列表
- [x] `settings.html` 设置页面
- [x] 状态指示灯动画
- [ ] 暗色主题切换

---

## 六、开发进度

> **说明**：此区域供前后端开发 Agent 同步进度，由主 Agent 审查。

---

### 6.1 后端开发进度

**负责 Agent**：Backend Agent  
**当前阶段**：B3 完成  
**最后更新**：2026-01-11

#### 进度检查点

| 阶段 | 任务 | 状态 | 备注 |
|------|------|------|------|
| B1 | FastAPI 项目初始化 | ✅ | |
| B1 | Provider 抽象接口 | ✅ | |
| B1 | OpenAI Provider 实现 | ✅ | |
| B1 | `/api/providers` 接口 | ✅ | |
| B1 | `/api/health` 接口 | ✅ | |
| B2 | Session 管理 | ✅ | 内存实现 |
| B2 | Round 轮次调度 | ✅ | 内存实现 |
| B2 | 共享上下文管理 | ✅ | 内存实现 |
| B2 | `/api/sessions/*` 接口 | ✅ | 基础接口完成 |
| B3 | SQLite 持久化 | ✅ | |
| B3 | SSE 流式输出 | ✅ | Token 分块 |
| B3 | 标题生成功能 | ✅ | |

#### 开发日志

```
2026-01-11
- 完成后端目录结构与 FastAPI 入口，配置 CORS 与健康检查。
- 实现 Provider 抽象接口与 OpenAI Provider，完成 /api/providers 管理接口。
- 实现 Session/Round/Context 的内存版逻辑与 /api/sessions 基础接口。
- 完成 SQLite 持久化接入、SSE 流式输出与标题生成功能。
- 新增思维链过滤与模型提示词配置接口（GET/PUT）。
- 新增 start.py/start.bat 一键启动脚本（端口检测与自动打开浏览器）。
```

---

### 6.2 前端开发进度

**负责 Agent**：Frontend Agent  
**当前阶段**：F2/F3 进行中  
**最后更新**：2026-01-11

#### 进度检查点

| 阶段 | 任务 | 状态 | 备注 |
|------|------|------|------|
| F1 | index.html 页面结构 | ✅ | |
| F1 | Tailwind + Phosphor Icons | ✅ | |
| F1 | 三栏布局实现 | ✅ | |
| F1 | 消息气泡组件 | ✅ | |
| F2 | api.js 封装 | ✅ | 完整封装 providers/sessions 接口 |
| F2 | chat.js 发送/渲染 | ✅ | 支持消息发送与响应渲染 |
| F2 | 对话布局优化 | ✅ | 增加底部留白，优化 requestAnimationFrame 滚动逻辑 |
| F2 | 模型选择器 | ✅ | 交互与样式优化完成 |
| F2 | 轮次分割线 + 决策卡片 | ⬜ | |
| F2 | SSE 流式接收 | ✅ | 已完成 |
| F3 | 侧边栏历史列表 | ✅ | 集成于 chat.js，支持加载/切换/新建/删除 |
| F3 | 设置/添加模型入口 | ✅ | UI 入口已添加 |
| F3 | settings.html 设置页面 | ✅ | 支持 Prompt/Provider 配置及新增 |
| F3 | 关闭服务功能 | ✅ | 支持前端关闭后端进程 |
| F3 | 动态新增 Provider/模型 | ✅ | 支持 OpenAI 兼容协议接入 |
| F3 | 暗色主题 | ⬜ | |
```

---

### 6.3 协调事项

> 前后端对接问题、接口变更、阻塞项等在此记录。

| 日期 | 提出方 | 问题描述 | 状态 |
|------|--------|----------|------|
| 2026-01-11 | Frontend | **对话触发方式调整**：后端采用 `/start`/`continue` 写入用户消息，实际模型生成通过 `/api/sessions/{id}/stream` 触发。前端需在提交后建立 SSE 连接以接收回复。 | **已完成** |
| 2026-01-11 | Frontend | **会话详情数据**：`GET /api/sessions/{id}` 返回 `messages` 列表，字段与 `MessageResponse` 一致，可直接用于 `refreshChat` 渲染。 | **已完成** |
| 2026-01-11 | Frontend | **模型管理 API**：提供 `/api/providers` 的 GET/PUT/RELOAD。前端需在设置页实现对 **API Key** 和 **Base URL** 的编辑功能。 | **已完成** |
| 2026-01-11 | Server | **SSE 流式支持**：`/api/sessions/{id}/stream` 已按规范输出事件，并改为真实流式输出；前端继续使用 `EventSource` 即可。 | **已完成** |
| 2026-01-11 | Backend | **并行模型调用开关**：新增 `PARALLEL_MODEL_CALLS`，开启后同轮模型基于轮次开始时上下文快照，不包含同轮前序模型输出。 | **已完成** |
| 2026-01-11 | Backend | **请求重试/超时与 API Key 加密**：新增 `REQUEST_RETRY_*`、`PROVIDER_REQUEST_TIMEOUT`、`PROVIDERS_ENC_KEY` 环境变量；前端无须改动。 | **已完成** |
| 2026-01-11 | Backend | **思维链过滤**：后端需过滤模型返回中的 `<think>` 等思维链内容，避免直接展示给前端。 | **已完成** |
| 2026-01-11 | Backend | **模型提示词配置**：为每个模型提供独立提示词配置与接口（GET/PUT），前端可直接调用。 | **已完成** |
| 2026-01-11 | Frontend | **设置页面完善**：在该页面集成 Provider 配置（API Key/Base URL）及模型 Prompt 配置。 | **已完成** |
| 2026-01-11 | Frontend | **关闭服务功能**：新增 `/api/shutdown` 及前端退出按钮，用于释放端口。 | **已完成** |
| 2026-01-11 | Frontend | **动态端口适配**：启动脚本可能切换端口，前端以 `window.location.origin` 作为 API baseUrl。 | **已完成** |
| 2026-01-11 | Fullstack | **动态模型管理**：后端支持 `POST /providers` 和 `/models`，前端设置页增加添加入口与模态框。 | **已完成** |
| 2026-01-11 | Frontend | **布局优化**：大幅增加对话窗口底部留白 (`pb-60`) 并优化滚动逻辑，解决输入框遮挡问题。 | **已完成** |

---

### 6.4 待解决问题

> **审查日期**：2026-01-11  
> **审查人**：Main Agent

#### 6.4.1 后端待修复

| 优先级 | 问题 | 位置 | 描述 | 状态 |
|--------|------|------|------|------|
| ⚠️ 中 | `shutdown` 使用强制退出 | `main.py:76` | 已改为 signal 触发优雅关闭 | ✅ |
| ℹ️ 低 | 废弃的内存存储文件 | `backend/core/session.py` | 已标记为 legacy（SQLite 为默认） | ✅ |
| ℹ️ 低 | 空壳 Provider 实现 | `anthropic_provider.py` / `google_provider.py` | Google 已实现；Anthropic 暂未实现并已标注 | 部分完成 |
| ℹ️ 低 | ContextBuilder 重复读取 | `sessions.py:247-250` | SSE 流式改为复用消息列表，避免重复构建 | ✅ |

#### 6.4.2 前端待修复

| 优先级 | 问题 | 位置 | 描述 | 状态 |
|--------|------|------|------|------|
| ✅ 高 | `setupEventListeners` 重复定义 | `chat.js:58-88` 和 `315-338` | 已合并修复 | ✅ |
| ✅ 中 | 缺少 `deleteSession` 方法 | `api.js` | 经核实 `api.js` 中已存在该方法 | ✅ |
| ✅ 低 | Tailwind 动态类名问题 | `chat.js:495-500` | 已使用 `colorClasses` 映射表完整类名 | ✅ |
| ✅ 低 | SSE 连接未清理 | `chat.js:381` | 已在 `switchSession` 中添加关闭逻辑 | ✅ |

#### 6.4.3 功能待实现

| 优先级 | 功能 | 负责方 | 状态 |
|--------|------|--------|------|
| ✅ | **Markdown 渲染增强** | Frontend | ✅ 已集成 marked.js + highlight.js |
| ✅ | Minimax 输出前导空行 | Backend | ✅ 已添加前导空白过滤 |
| ✅ | **删除模型功能** | Full-stack | ✅ API + UI 已实现 |
| ⚠️ 中 | 轮次分割线 + 决策卡片 | Frontend | ✅  已完成|
| ℹ️ 低 | 暗色主题切换 | Frontend | ⬜ |
| ℹ️ 低 | 模型拖拽排序 | Frontend | ⬜ |

---

### 6.5 未来改进建议

> **提出日期**：2026-01-11  
> **状态**：待评估  
> **部署模式**：个人本地部署，单用户使用，无需用户认证和多租户支持。

#### 6.5.1 前端改进

| 优先级 | 建议 | 描述 | 状态 |
|--------|------|------|--------|
| ✅ | **Markdown 渲染增强** | 代码高亮、表格、数学公式（KaTeX） | ✅ 已完成 |
| ✅ | **删除模型功能** | 设置页面删除模型 | ✅ 已完成 |
| ✅ | **决策卡片交互** | 每轮结束显示"认可共识/继续讨论"按钮 | ✅ 已完成 |
| ⚠️ 中 | **消息编辑/重发** | 编辑已发送消息并重新生成 | ⬜ |
| ✅ | **模型回复折叠** | 长回复折叠，点击展开 | ✅ 已完成 |
| ✅ | **会话导出** | 导出为 Markdown | ✅ 已完成 |
| ✅ | **预设模板** | "系统分析""代码审查"等场景 | ✅ 已完成 |
| ℹ️ 低 | **暗色主题** | 深色模式切换 | ⬜ |
| ℹ️ 低 | **模型拖拽排序** | 调整发言顺序 | ⬜ |
| ℹ️ 低 | **消息分页加载** | 长对话分页，优化性能 | ⬜ |
| ℹ️ 低 | **模型投票/评分** | 对回复打分记录偏好 | ⬜ |
| ℹ️ 低 | **多语言支持** | 界面国际化（i18n） | ⬜ |

#### 6.5.2 后端改进

| 优先级 | 建议 | 描述 | 状态 |
|--------|------|------|--------|
| ✅ | **真正的流式输出** | 改为实时 SSE 流（async generator） | ✅ 已完成 |
| ✅ | **请求重试机制** | 失败自动重试，指数退避 | ✅ 已完成 |
| ✅ | **并行模型调用** | 多模型同时请求（默认关闭） | ✅ 已完成 |
| ✅ | **API Key 加密存储** | 配置文件 key 加密 | ✅ 已完成 |
| ✅ | **请求日志审计** | 记录 API 调用日志 | ✅ 已完成 |
| ✅ | **Minimax 空行修复** | 前导空白过滤 | ✅ 已完成 |
| ℹ️ 低 | **Anthropic Provider** | Claude 系列原生 API 支持（暂缓） | ⬜ |
| ℹ️ 低 | **WebSocket 替代 SSE** | 双向通信，支持取消 | ⬜ |
| ℹ️ 低 | **插件系统** | 自定义后处理器 | ⬜ |

#### 6.5.3 代码解耦建议

| 优先级 | 建议 | 描述 | 状态 |
|--------|------|------|------|
| ✅ | **SSE 事件生成器抽取** | `sessions.py` 的 `event_generator` 抽到独立模块 | ✅ 已完成 |
| ✅ | **响应转换器迁移** | `_to_message_response` 等移到 `converters.py` | ✅ 已完成 |
| ✅ | **重试逻辑模块化** | 创建 `backend/core/retry.py` | ✅ 已完成 |
| ✅ | **colorClasses 共享** | 前端重复定义移到 `utils.js` | ✅ 已完成 |
| ✅ | **Google Provider 流式** | 实现 `generate_stream` 方法 | ✅ 已完成 |

---

## 七、变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-01-11 | 初始版本，确认技术选型 |
| 2026-01-11 | v1.0 需求确认：圆桌讨论、轮次发言、用户引导、气泡式UI |
| 2026-01-11 | v1.1 架构调整：前后端分离，后端 FastAPI + 前端 NiceGUI |
| 2026-01-11 | v1.2 前端改为 Web UI（HTML + Tailwind CSS + Vanilla JS） |
| 2026-01-11 | v1.3 后端规范完善：SSE 事件格式、数据模型、YAML 配置、设计决策 |
| 2026-01-11 | v1.4 最终确认：标题生成、拖拽排序、健康检查、API Key 编辑、旧文件整理 |
| 2026-01-11 | v1.5 代码审查：添加待解决问题清单 |
| 2026-01-12 | v1.6 Bug 修复：CSS 动画消息偏移；Gemini 多模型空输出；添加日志配置 |
| 2026-01-12 | v1.7 新功能：Markdown 渲染（marked.js + highlight.js）；删除模型 API + UI |
| 2026-01-13 | **v2.0 重大版本**：预设模板系统（本地 YAML 存储）；会话导出；决策卡片；长回复折叠；模板管理 API |

