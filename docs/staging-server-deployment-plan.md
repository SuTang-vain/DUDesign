# DUDesign Staging 服务器部署规划

> 版本：v0.1
> 日期：2026-06-27
> 目标服务器：`tyy` / `ubuntu@49.233.190.201`
> 定位：将该服务器作为 DUDesign 远程测试、浏览验收和上线前 staging 环境
> 当前公网入口：`http://49.233.190.201/`
> 关联文档：
> - `docs/development-release-governance.md`
> - `docs/architecture-governance-plan.md`
> - `docs/modules/application-service/TODO.md`

## 1. 服务器盘点

### 1.1 基础信息

```text
Host: VM-0-9-ubuntu
SSH alias: tyy
User: ubuntu
OS: Ubuntu 24.04.4 LTS
Kernel: Linux 6.8.0-117-generic
CPU: 2 cores
Memory: 1.9 GiB
Swap: 1.9 GiB
Disk: 40G total, 32G available
```

### 1.2 已安装工具

```text
git: installed, 2.43.0
docker: installed, 29.6.0
node: not installed
npm: not installed
postgresql client: not installed
nginx: installed
pm2: not installed
```

### 1.3 当前监听端口

```text
22/tcp: SSH
80/tcp: Nginx staging reverse proxy
3001/tcp: Web, bound to `127.0.0.1`
3002/tcp: Admin, bound to `127.0.0.1`
4000/tcp: API, bound to `127.0.0.1`
5432/tcp: PostgreSQL container internal network only
```

当前服务器较干净，适合作为 staging 起点。

## 2. 部署策略选择

### 2.1 推荐策略：Docker Compose

基于当前服务器环境，推荐使用 Docker Compose，而不是直接在主机安装 Node.js、PostgreSQL、Nginx 和 PM2。

原因：

- 服务器已有 Docker。
- 避免污染主机环境。
- 方便后续重建、迁移和回滚。
- staging 与 production 未来可共享相似部署形态。
- 2C2G 小机器更适合控制进程数量和资源边界。

### 2.2 初期不推荐

暂不推荐：

- 在宿主机裸装 Node/npm/PostgreSQL/PM2。
- 一开始就引入 Kubernetes。
- 一开始就配置复杂蓝绿发布。
- 一开始就把 staging 和 production 混在同一套数据库。

## 3. 目标部署拓扑

MVP staging 当前拓扑：

```text
Browser
  -> Tencent Cloud security group :80
  -> host Nginx
    -> web container      127.0.0.1:3001
    -> admin container    127.0.0.1:3002
    -> api container      127.0.0.1:4000
api container
  -> postgres container   :5432
  -> local artifact volume
  -> MockRuntimeGateway or BabeL-O Gateway, by env
```

当前公网入口：

```text
Web:   http://49.233.190.201/
Admin: http://49.233.190.201/admin/
API:   http://49.233.190.201/api/
```

后续绑定域名和 HTTPS 后：

```text
Web:   https://staging.example.com
Admin: https://staging.example.com/admin/
API:   https://staging.example.com/api/
```

## 4. 服务器目录规划

推荐目录：

```text
/opt/dudesign
  /repo                  # git checkout
  /releases              # 可选，后续 release 包
  /shared
    /artifacts           # DUDesign artifact root
    /postgres            # PostgreSQL docker volume bind mount, optional
    /env
      staging.env        # staging 环境变量
    /logs
```

权限建议：

```text
owner: ubuntu
group: ubuntu
artifact dir: 750
env files: 600
```

## 5. 环境变量规划

Staging API 推荐：

```bash
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
DUDESIGN_REPOSITORY=postgres
DATABASE_URL=postgresql://dudesign:<password>@postgres:5432/dudesign_staging
DUDESIGN_ARTIFACT_ROOT=/opt/dudesign/shared/artifacts
```

Staging Web/Admin 推荐：

```bash
# 留空表示通过 Nginx 同源 `/api` 访问 API。
# 如果后续 API 拆到独立域名，只填写 origin，例如 `https://api.example.com`。
# 不要填写 `/api` 路径后缀。
NEXT_PUBLIC_DUDESIGN_API_URL=
```

后续 M28 可加入：

```bash
DUDESIGN_REPOSITORY_HYDRATE=false
```

Runtime 相关后续加入：

```bash
DUDESIGN_RUNTIME_PROVIDER=mock
DUDESIGN_RUNTIME_PROVIDER=babel-o
BABELO_BASE_URL=http://babel-o:xxxx
BABELO_API_KEY=...
```

## 6. 数据库策略

Staging 使用独立 PostgreSQL 数据库：

```text
database: dudesign_staging
user: dudesign
```

必须执行 migration：

```text
apps/api/db/migrations/0001_initial_schema.sql
apps/api/db/migrations/0002_usage_event_idempotency.sql
```

治理规则：

- staging 数据可清理，但不能和 production 共库。
- migration 必须先 staging 验证，再进入 production。
- 每次 schema 变化后必须跑 PostgreSQL opt-in test。

## 7. Artifact 存储策略

MVP staging 先使用服务器本地目录：

```text
/opt/dudesign/shared/artifacts
```

对应环境变量：

```bash
DUDESIGN_ARTIFACT_ROOT=/opt/dudesign/shared/artifacts
```

后续 production 可迁移到 S3 兼容对象存储。迁移前需要保证：

- artifact storage key 稳定。
- preview/export/share 不依赖本地绝对路径。
- share 读取固定 artifact version。

## 8. 部署步骤草案

### 8.1 一次性初始化

```bash
ssh tyy
sudo mkdir -p /opt/dudesign/{repo,releases,shared/artifacts,shared/env,shared/logs}
sudo chown -R ubuntu:ubuntu /opt/dudesign
cd /opt/dudesign/repo
git clone https://github.com/SuTang-vain/DUDesign.git .
```

### 8.2 配置环境变量

```bash
vim /opt/dudesign/shared/env/staging.env
chmod 600 /opt/dudesign/shared/env/staging.env
```

### 8.3 构建和启动

仓库已包含：

```text
deploy/staging/docker-compose.yml
deploy/staging/Dockerfile
deploy/staging/nginx.conf
deploy/staging/staging.env.example
deploy/staging/scripts/package-release.sh
deploy/staging/scripts/deploy-remote.sh
deploy/staging/scripts/smoke-remote.sh
```

推荐从本地打包上传部署，避免服务器直连 GitHub 不稳定：

```bash
DUDESIGN_STAGING_REMOTE=tyy \
DUDESIGN_STAGING_PUBLIC_BASE=http://49.233.190.201 \
deploy/staging/scripts/deploy-remote.sh
```

仅远程 smoke：

```bash
DUDESIGN_STAGING_REMOTE=tyy \
DUDESIGN_STAGING_PUBLIC_BASE=http://49.233.190.201 \
deploy/staging/scripts/smoke-remote.sh
```

真实 BabeL-O 多变体 smoke：

```bash
DUDESIGN_STAGING_REMOTE=tyy \
DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT=3 \
DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS=420 \
deploy/staging/scripts/smoke-babelo-prompt-remote.sh
```

`DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT` 可设为 `1..6`。常规 smoke 默认仍为 1，避免每次部署都触发高成本真实内核并发生成。

服务器上手动启动：

```bash
cd /home/ubuntu/deployments/dudesign/current
docker compose -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d --build
```

### 8.4 验证

```bash
docker compose -f deploy/staging/docker-compose.yml ps
curl -I http://127.0.0.1/
curl http://127.0.0.1/api/dev/bootstrap
curl -I http://127.0.0.1/admin/
curl -I http://49.233.190.201/
curl http://49.233.190.201/api/dev/bootstrap
curl -I http://49.233.190.201/admin/
```

## 9. Staging Smoke 清单

用户端：

```text
[ ] 打开 Web 首页
[ ] 创建 session
[ ] 创建 design job
[ ] 生成 3 个 variations
[ ] 打开结果墙
[ ] 打开 variation detail
[ ] preview 正常
[ ] refine 正常
[ ] annotation refine 正常
[ ] export HTML 正常
[ ] share link 正常
[ ] 后续 refine 不影响旧 share
[ ] 刷新页面后 session 可恢复
```

管理端：

```text
[ ] 打开 Admin 首页
[ ] runtime health 可读
[ ] jobs 列表可读
[ ] artifacts 列表可读
[ ] support user lookup 可读
[ ] cost summary 可读
[ ] audit log 可读
[ ] cancel/retry 权限符合预期
```

API：

```text
[ ] `/api/dev/bootstrap`
[ ] `/api/sessions`
[ ] `/api/design-jobs`
[ ] `/api/design-jobs/:id/stream`
[ ] `/api/variations/:id/preview`
[ ] `/api/variations/:id/export`
[ ] `/api/variations/:id/share`
[ ] `/api/shares/:token`
```

## 10. 安全与暴露面

当前反向代理阶段需要注意：

- 不要暴露 PostgreSQL 5432 到公网。
- API/Web/Admin 容器端口必须只绑定 `127.0.0.1`。
- Admin 页面后续必须接入真实鉴权；当前 header-based role 只适合 staging/dev。
- `staging.env` 不提交到 Git。
- SSH key 不进入仓库。

建议云服务器安全组只开放：

```text
22    SSH
80
443   后续 HTTPS 使用
```

## 11. 回滚策略

初期 Docker Compose 回滚：

```bash
cd /opt/dudesign/repo
git checkout <previous_commit>
docker compose -f deploy/staging/docker-compose.yml --env-file /opt/dudesign/shared/env/staging.env up -d --build
```

数据库回滚：

- staging 可清库重建。
- production 不允许随意 down migration。
- destructive schema change 必须分阶段发布。

## 12. 下一步任务

建议后续拆成三个里程碑：

### M-DEPLOY-1：部署脚手架

- [x] 新增 `deploy/staging/docker-compose.yml`。
- [x] 新增 API/Web/Admin 共用 Dockerfile。
- [x] 新增 `deploy/staging/staging.env.example`。
- [x] API 支持生产 host `0.0.0.0`。
- [x] 本地 `docker compose up` 能启动。

### M-DEPLOY-2：远程部署

- [x] 初始化 `/home/ubuntu/deployments/dudesign/current`。
- [x] 配置 staging env。
- [x] 构建并启动服务。
- [x] PostgreSQL repository 自动初始化基础 schema。
- [x] Nginx 本机和公网 smoke。

### M-DEPLOY-3：浏览验收与反向代理

- [x] 通过浏览器打开公网用户端。
- [x] 管理端 smoke。
- [x] 引入 Nginx。
- [ ] 后续配置域名和 HTTPS。
