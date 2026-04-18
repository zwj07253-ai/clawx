# 企业内部 OpenClaw 私有化管控平台 设计文档

> **Status:** Approved
> **Date:** 2026-04-18

## Goal

为企业内部员工提供统一管控的 OpenClaw 使用平台：所有模型调用走公司后端代理，后端统一管理 API Key、模型切换、用量统计，员工客户端开箱即用，无需任何模型配置。

## Architecture

两个独立系统协同工作：

1. **后端服务**（`ClawClient/server/`）— FastAPI + SQLite，部署在 `120.24.116.82:8026`
2. **客户端改造**（现有 ClawX）— 修改 `dist-electron/main/index.js`，注入激活流程 + 用量上报逻辑

员工客户端的本地 Gateway 不直连大模型，`openclaw.json` 中的模型 provider `baseUrl` 指向后端代理接口，后端持有真实 API Key 并转发请求。

## Tech Stack

- 后端：Python 3.11+, FastAPI, SQLite (via aiosqlite), uvicorn
- 客户端：Node.js (Electron main process), 原生 `https` 模块
- 管理页面：纯 HTML + JS + Chart.js (CDN)

---

## Section 1：后端服务

### 文件结构

```
server/
├── main.py              # FastAPI 入口，挂载所有路由，serve static
├── database.py          # SQLite 初始化，建表
├── models.py            # Pydantic 数据模型
├── auth.py              # 管理员 token 验证中间件
├── routes/
│   ├── user.py          # 员工激活、获取配置
│   ├── usage.py         # 用量上报、查询
│   ├── admin.py         # 模型切换、配额管理
│   └── proxy.py         # 模型请求代理转发
└── static/
    └── index.html       # 管理后台 Web 页面
```

### 数据库表

**devices**
| 字段 | 类型 | 说明 |
|------|------|------|
| device_id | TEXT PK | 客户端自动生成的 UUID |
| employee_id | TEXT | 工号 |
| name | TEXT | 员工姓名 |
| token | TEXT | 激活后颁发的访问 token |
| activated_at | DATETIME | 首次激活时间 |
| last_seen | DATETIME | 最后活跃时间 |

**usage_logs**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| device_id | TEXT | 设备 ID |
| employee_id | TEXT | 工号 |
| name | TEXT | 员工姓名 |
| model | TEXT | 模型名称 |
| skill_name | TEXT | 技能名称（可为空） |
| input_tokens | INTEGER | 输入 token 数 |
| output_tokens | INTEGER | 输出 token 数 |
| status | TEXT | success / error |
| created_at | DATETIME | 上报时间 |

**config**
| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PK | 配置键 |
| value | TEXT | 配置值（JSON 字符串） |

初始配置项：
- `default_model`：当前默认模型 ID
- `model_base_url`：大模型 API 地址
- `model_api_key`：大模型 API Key（加密存储）
- `daily_quota`：每日调用次数上限（0 = 不限制）

### API 接口

#### 员工端接口（需要 `Authorization: Bearer <token>`，激活接口除外）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/user/activate` | 首次激活，传入工号+姓名+设备ID，返回 token + 模型配置 |
| GET | `/api/user/info` | 获取当前模型配置（客户端缓存 5 分钟） |
| POST | `/api/usage/report` | 异步上报用量记录 |
| POST | `/api/proxy/chat` | 模型请求代理转发（OpenAI 兼容格式） |

#### 管理员接口（需要 `X-Admin-Token` header）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/usage/list` | 查询用量列表，支持按员工/日期/模型过滤 |
| GET | `/api/usage/summary` | 用量聚合统计（排行榜、每日/每月） |
| GET | `/api/admin/devices` | 查看所有激活设备 |
| POST | `/api/admin/config` | 切换模型、修改配额 |
| GET | `/api/admin/config` | 获取当前配置 |

#### 激活接口请求/响应

```json
// POST /api/user/activate
// Request
{
  "employee_id": "E001",
  "name": "张三",
  "device_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response
{
  "token": "ent_abc123...",
  "model_config": {
    "base_url": "http://120.24.116.82:8026/api/proxy",
    "model_id": "astron-code-latest",
    "api": "openai-completions"
  }
}
```

#### 用量上报请求

```json
// POST /api/usage/report
{
  "employee_id": "E001",
  "name": "张三",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "model": "astron-code-latest",
  "skill_name": "brainstorming",
  "input_tokens": 1200,
  "output_tokens": 340,
  "status": "success",
  "timestamp": "2026-04-18T10:00:00Z"
}
```

**不上报：** prompt 内容、文件路径、代码内容、截图

### 管理后台页面

访问地址：`http://120.24.116.82:8026/admin`

功能模块：
- **用量排行**：表格，按员工聚合，显示总调用次数、总 token 消耗，降序排列
- **每日/每月统计**：折线图（Chart.js CDN）
- **员工设备列表**：工号、姓名、设备ID、激活时间、最后活跃时间
- **模型切换**：下拉框选择模型，点击"应用"调 `/api/admin/config`
- **管理员认证**：页面加载时弹出 token 输入框，存入 sessionStorage，后续请求带 `X-Admin-Token` header

### 安全

- 管理员 token 通过环境变量 `ADMIN_TOKEN` 配置，不写入代码
- 员工 token 在激活时服务端生成（`secrets.token_hex(24)`），存入 `devices` 表
- 模型 API Key 只存在服务端，不下发给客户端
- 所有员工端接口验证 `Authorization: Bearer <token>` 与 `device_id` 匹配

---

## Section 2：客户端改造

### 改动范围

只修改 `dist-electron/main/index.js`，不改动其他文件。

### 本地持久化文件

`~/.openclaw/clawx-enterprise.json`（Electron userData 目录）：
```json
{
  "employee_id": "E001",
  "name": "张三",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "ent_abc123...",
  "model_config": {
    "base_url": "http://120.24.116.82:8026/api/proxy",
    "model_id": "astron-code-latest",
    "api": "openai-completions"
  },
  "config_cached_at": 1713434400000
}
```

### 首次激活流程

```
客户端启动（initialize 函数）
  → 读取 clawx-enterprise.json
  → 文件不存在 → 通过 IPC 触发 renderer 显示激活对话框
  → 用户输入工号 + 姓名
  → 生成 device_id（crypto.randomUUID()）
  → POST http://120.24.116.82:8026/api/user/activate
  → 成功 → 保存 clawx-enterprise.json
  → 将 model_config 写入 openclaw.json（provider: enterprise-proxy）
  → 继续正常启动流程
```

### 模型配置懒加载（缓存 5 分钟）

```
Gateway 收到模型请求（拦截 WebSocket 消息）
  → 读取 clawx-enterprise.json 中的 config_cached_at
  → 距今 < 5 分钟 → 直接使用缓存配置
  → 距今 >= 5 分钟 → GET /api/user/info（带 Bearer token）
    → 成功 → 更新 model_config + config_cached_at
    → 如果模型变化 → 更新 openclaw.json → 触发 Gateway restart
  → 继续处理请求
```

### 用量上报

```
拦截 Gateway WebSocket 响应消息
  → 检测到 usage 字段（input_tokens / output_tokens）
  → 异步 POST /api/usage/report
    → 失败静默忽略（不影响主流程）
    → 超时 3 秒后放弃
```

---

## Section 3：数据流总览

```
员工电脑                          云服务器 120.24.116.82
┌─────────────────────┐          ┌──────────────────────────────┐
│  ClawX Electron     │          │  FastAPI :8026               │
│  ┌───────────────┐  │  激活    │  ┌──────────────────────┐    │
│  │ 激活对话框    │──┼─────────▶│  │ /api/user/activate   │    │
│  └───────────────┘  │          │  └──────────────────────┘    │
│                     │  配置    │  ┌──────────────────────┐    │
│  ┌───────────────┐  │◀─────────┼──│ /api/user/info       │    │
│  │ openclaw.json │  │          │  └──────────────────────┘    │
│  └───────────────┘  │          │                              │
│         │           │  代理    │  ┌──────────────────────┐    │
│  ┌───────────────┐  │─────────▶│  │ /api/proxy/chat      │───▶│ 大模型
│  │ Local Gateway │  │          │  └──────────────────────┘    │
│  └───────────────┘  │  上报    │  ┌──────────────────────┐    │
│         │           │─────────▶│  │ /api/usage/report    │    │
│  ┌───────────────┐  │          │  └──────────────────────┘    │
│  │ enterprise    │  │          │                              │
│  │ .json (cache) │  │          │  ┌──────────────────────┐    │
│  └───────────────┘  │          │  │ SQLite               │    │
└─────────────────────┘          │  └──────────────────────┘    │
                                 │                              │
管理员浏览器                      │  ┌──────────────────────┐    │
┌─────────────────────┐          │  │ /admin (静态页面)     │    │
│  http://120.24...   │◀─────────┼──│ /api/usage/list      │    │
│  /admin             │          │  │ /api/admin/config    │    │
└─────────────────────┘          │  └──────────────────────┘    │
                                 └──────────────────────────────┘
```

---

## 部署说明

### 后端启动

```bash
cd server
pip install fastapi uvicorn aiosqlite python-dotenv
ADMIN_TOKEN=your-secret-token uvicorn main:app --host 0.0.0.0 --port 8026
```

### 环境变量（`.env`）

```
ADMIN_TOKEN=your-admin-secret
MODEL_API_KEY=your-model-api-key
MODEL_BASE_URL=https://maas-coding-api.cn-huabei-1.xf-yun.com/v2
DEFAULT_MODEL=astron-code-latest
```

### 客户端打包

客户端内置后端地址 `http://120.24.116.82:8026`，打包后员工直接安装使用，无需任何配置。
