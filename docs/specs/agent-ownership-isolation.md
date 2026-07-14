# SPEC：Agent 归属隔离（防止跨人驱动机器）

状态：**已实现并端到端验证**　负责人：小杨　起草：2026-07-14　fork：chorus-fork

## 实现结果（2026-07-14）

咽喉守卫 `assertAgentAssignmentOwnership`（`src/lib/assignment-ownership.ts`）接入 `claimTask`
与 `assignIdea` 两个服务层写入点；`GET /api/agents` 按 owner 过滤。单元 + 集成测试全绿
（4111 通过），本机端到端验证：

| 场景 | 结果 |
|------|------|
| 小李（他人）查看 agent 列表 | 只见自己的，看不到小杨的 ✓ |
| 小杨 REST 指派任务 → 小李机器 | 403 拒绝 ✓ |
| 小杨 REST 指派任务 → 自己机器 | 200 通过 ✓ |
| PM(小杨) 经 MCP 指派 → 小李机器（注入路径）| isError 拒绝 ✓ |
| PM(小杨) 经 MCP 指派 → 自己机器 | 通过，不误杀编排 ✓ |

下游 start_development / yolo / stage-advance 唤醒均从 assignee 出发，指派闸门锁死后自动安全。

## 决策定稿（2026-07-14 评审）

1. **硬隔离，确认**。跨人自动 push 到机器就是要禁的威胁本身，不是"代价"。跨人协作一律走"派给人"。
   （你自己的 PM/autopilot 仍可编排你自己的机器——被禁的只有跨 owner 的指派。）
2. **超管纯管理**：超管不参与任何指派/干活，无全局指派后门。架构上已天然满足（super_admin 上下文无 companyUuid/actorUuid，走不到指派路径），实现时只需确认不回归。
3. **存量迁移**：本地是测试环境，直接重建/改 ownerUuid，不做保守迁移。null-owner Agent 一律 fail-closed。

---

## 1. 为什么要做

Chorus 的"唤醒"本质上是**平台签发的远程代码执行**：把任务指派/钉到某个 Agent 或实例，
平台就会唤醒对应开发者机器上的 opencode，让它按任务描述真实地读写文件、跑命令。

当前隔离边界只有"公司"。凭邀请码注册的 40 个人全在同一家公司，而**公司内任何人都能
把任务指派给公司内任何 Agent**——也就是能驱动任何同事的电脑、消耗其模型额度、在其工作
目录里删改文件。任务描述来自网页输入，等于一条**未经机主同意、可被提示词注入放大的
远程命令通道**。

> 威胁模型不是"防坏人"，而是"防蠢操作 + 防注入"：一个手滑选错目标、或一段被诱导的
> 任务描述，就能一锅端所有 PC。唤醒机制必须把"是否在我机器上执行"的决定权，硬性锁死
> 在机主手里。

设计目标（按用户拍板）：

- **硬隔离，不设共享标签**：默认且唯一——别人的 Agent 你碰不到，没有例外开关。
- **极严格**：宁可掐死便利，也不留可被注入绕过的缝。
- **咽喉执法**：在服务层唯一写入点强制，杜绝"某个入口忘了加校验"。

---

## 2. 攻击面盘点（现状）

代码核实结果。分两类：**执行面**（能让别人机器动起来）与**信息面**（能看到别人机器、助攻注入/钓鱼）。

### 2.1 执行面

| # | 路径 | 入口 | 现状校验 | 风险 |
|---|------|------|----------|------|
| A1 | UI 指派任务给 Agent | `tasks/[taskUuid]/actions.ts` `assignToAgentAction` → `claimTask()` | 仅校验任务存在+状态 | ❌ 可派给任意 Agent/实例 |
| A2 | MCP 指派任务 | `chorus_pm_assign_task`（`mcp/tools/pm.ts:568`）→ `claimTask()` | 仅校验同公司 + 目标有 `task:write` | ❌ 任意 PM agent 可派给任意 Agent |
| A3 | Idea 指派 | idea 的 `assigneeType/Uuid` 写入 | 同上模式 | ❌ 下游 start_development/yolo 据此唤醒 |
| A4 | Agent 认领开放任务 | `chorus_claim_task`（developer.ts）| 已有实例归属守卫（上一次修复） | ✅ assignee=自己，天然安全 |
| B1 | start_development 唤醒 | `start-development.service.ts` | 从 `idea.assignee` 解析 owning agent | 依赖 A3——A 锁死则自动安全 |
| B2 | Yolo 唤醒 | `yolo-request.service.ts` | 同上 | 同上 |
| B3 | stage-advance 唤醒 | `stage-advance.service.ts` | 从 assignee→owning agent→online 检查 | 同上 |

**关键洞见**：B 类唤醒全部从"assignee 是谁"出发。只要在 A 类**指派写入点**强制
`目标 Agent 必须属于调用方`，所有下游唤醒自动安全——不必在几十个唤醒点各加一遍。
咽喉就是服务层的 `claimTask()`（UI、MCP、idea 指派最终都汇于此）。

### 2.2 已有防线（无需改，作为参照）

直接对着某个 Agent 打字驱动的通道**已经是 owner-scoped 的**，说明上游本就认可这条边界：

- 定向指令 `POST /api/daemon-sessions/[sessionUuid]/instruction` → `sendInstruction()`：
  `findVisibleSession` 用 `agent: { ownerUuid: auth.actorUuid }` 过滤，非机主一律 404 不披露。
- 临时会话 `POST /api/daemon-sessions/ad-hoc` → `createAdHocSessionWithInstruction()`：
  `callerOwnsAgent()` 校验——user 只能 target 自己 `ownerUuid` 的 Agent，agent-key 只能 target 自己。

我们要做的，是把**同一条 owner 边界推广到"指派/认领到 Agent"这条路**。

### 2.3 信息面（次要，但防注入需要）

| 路径 | 现状 | 计划 |
|------|------|------|
| `GET /api/agents` | 全公司可见 | 普通用户仅见自己的 Agent；超管可见全部 |
| Agent 在线/实例列表（presence） | 全公司可见 | 同上 |
| `GET /api/mentionables` | 全公司可见 | 仅自己的 Agent + 人类用户 |

信息面收缩的意义：别人看不到我的 Agent uuid / 实例 uuid，就无法在任务描述里引用它诱导指派。
纵深防御，不是主锁。

---

## 3. 核心设计：owner 作为隔离边界

### 3.1 归属语义

- 人类 `User` 是隔离主体，`ownerUuid = 自己的 uuid`。
- `Agent.ownerUuid` = 创建它的人 = 这台机器的主人。
- **可达性规则**：`调用方能指派到 Agent X ⟺ X.ownerUuid == 调用方的 owner`。
  - 调用方是 user U：`X.ownerUuid == U.uuid`
  - 调用方是 agent A（如 PM agent）：`X.ownerUuid == A.ownerUuid`（PM 与 developer 属同一人）
  - super_admin：见 §6 开放问题（默认**也受限**，仅豁免只读全局视图）

一句话：**每个人是自己所有机器的国王，永远碰不到别人的机器。**

### 3.2 跨人协作怎么办（不设共享标签的前提下）

跨人不通过"直接把活推到对方机器"，而通过 **"派给人"**（`assigneeType=user`）：

```
小杨想让小李做某任务
  → 指派给「小李（人）」，不是「小李的 Agent」
  → 小李收到通知，自己决定在自己机器上认领执行（chorus_claim_task，assignee=自己的 agent，天然过闸）
```

平台仍是中心：任务、看板、依赖、验收全在平台流转。唯一变化是**"在我机器上跑"这一步由机主亲手拍板**，
而不是别人替他按下执行键。派给人不动任何机器，只是记在他名下等他处理——零风险。

### 3.3 ⚠ 需要你确认的代价

硬隔离意味着 **没有跨人的全自动编排**：一个"中央 PM agent"只能编排它主人自己的机器，
不能自动把子任务撒给全公司 40 台机器执行。全自动跨人调度 → 降级为"派给人 + 人认领"的半自动。

这与最初"中心平台控制个人本地 opencode"的愿景有取舍：
- **保**：中心化的任务管理、可观测、审计、验收闭环。
- **舍**：跨人的"一键全自动 push 执行"。换来"机主对自己机器的绝对控制权"。

> 若你要保留跨人自动编排，唯一安全的做法是"机主显式把机器放进共享池"——但你已明确**不加共享标签**。
> 所以本 SPEC 按硬隔离推进。**这一条是最重要的评审点，请确认你接受这个取舍。**

---

## 4. 执法实现

### 4.1 咽喉：`claimTask()` 服务层

所有指派/认领最终调用 `taskService.claimTask({ ..., assigneeUuid, assignedByUuid })`。在此处强制：

```ts
// 伪代码，插入 claimTask 内，写库之前
if (assigneeType === "agent" || assigneeType === "agent_instance") {
  const targetAgentUuid = resolveAgentFromAssignee(assigneeType, assigneeUuid); // 实例→其 agent
  const callerOwner = await resolveOwnerUuid(companyUuid, assignedByUuid);       // user→自己; agent→其 ownerUuid
  const targetAgent = await getAgent(companyUuid, targetAgentUuid);
  if (!targetAgent || targetAgent.ownerUuid !== callerOwner) {
    throw new AssignmentNotOwnedError(); // 路由映射 403；MCP 工具映射 isError
  }
}
```

`resolveOwnerUuid`：
- `assignedByUuid` 命中某 `User` → 返回其 uuid
- `assignedByUuid` 命中某 `Agent` → 返回该 agent 的 `ownerUuid`
- 命中 super_admin → 见 §6

要点：
- 校验在**服务层**而非各路由，UI/MCP/未来新入口全部自动覆盖。
- `chorus_claim_task`（Agent 自认领）assignee=自己，owner 天然相等，不受影响。
- 现有"实例归属守卫"（上次修复）与本校验叠加：先归属、再钉选，双保险。

### 4.2 Idea 指派同源处理

Idea 的 assignee 写入点（`idea.service` / 相关 action）套用同一 `assertCanAssignToAgent`。
确保 B 类唤醒的源头也过闸。

### 4.3 信息面过滤

- `listAgents({ companyUuid })` → 增加 `ownerUuid` 过滤参数；user 请求默认只回自己的，super_admin 传特殊标记回全部。
- presence / mentionables 列表同步按 owner 过滤。
- 指派弹窗的 Agent 候选，天然就只剩自己的机器（列表已过滤）。

---

## 5. 存量迁移

当前 7 个 Agent 的 `ownerUuid` 全指向老 admin（单账号时代建的）。上线前需要：

1. **认领脚本**：把每台机器的 Agent 归到真实机主名下（按你给的映射表逐个改 `ownerUuid`）。
2. 或者**清空重建**：40 人上来后各自在自己账号里新建 Agent + 发 key，老的删掉。
3. 迁移期兜底：`ownerUuid` 为 null 的 Agent，**默认拒绝任何指派**（fail-closed），逼迫先认领。

推荐 2（干净）；若已有跑起来的机器不想动，用 1。

---

## 6. 开放问题（请评审拍板）

1. **§3.3 的取舍**：接受"无跨人自动编排、跨人走派给人"吗？（最重要）
2. **super_admin 权限**：超管是否可以全局指派（救火/代运维）？还是超管也受硬隔离、仅保留全局**只读**看板？
   - 建议：超管仅全局只读；指派仍受限，避免超管账号被钓成万能后门。
3. **存量迁移**走 §5 的哪条（认领 vs 重建）？
4. **信息面收缩范围**：普通用户是否完全看不到别人的 Agent（连名字都不显示）？还是只是不能指派、但能看到存在？
   - 建议：完全不可见（防注入引用 uuid）。
5. **审计**：指派/认领是否落审计日志（谁在何时把什么派到哪台机器）？`assignedByUuid` 已存在，建议补一条显式 activity + 保留。

---

## 7. 测试计划

- 服务层 `claimTask` 归属守卫：同 owner 通过 / 跨 owner 拒绝 / null owner 拒绝 / 实例钉选跨 owner 拒绝。
- MCP `chorus_pm_assign_task`：PM agent 派给同主人 developer 通过；派给他人 Agent 拒绝且不写库。
- UI `assignToAgentAction`：同上。
- `chorus_claim_task` 自认领不回归。
- Idea 指派 + start_development/yolo：跨 owner 源头即被拒，唤醒不发生。
- 列表过滤：user 只见自己的 Agent；super_admin 见全部（若采纳建议 2 则仅只读）。
- 回归：instruction / ad-hoc 既有 owner-scoped 行为不变。

---

## 8. 影响面小结

- 数据库：无新字段（`ownerUuid` 已存在）；仅存量数据迁移。
- 代码：`claimTask` + `resolveOwnerUuid`/`assertCanAssignToAgent` 新增；idea 指派、列表 API、presence/mentionables 过滤；错误类型 + 路由/MCP 映射。
- 兼容：单人使用（所有 Agent 同 owner）行为完全不变——只有跨人指派被拦，正是目标。

---

## 9. Review 补漏：Agent 管理面旁路（2026-07-14 复审发现并修复）

第一轮实现锁死了"指派"这个咽喉，但复审发现 **Agent 本身的管理面仍是公司级敞开**——
在"Agent = 个人机器"的新语义下，这些全是越权，其中一条是**直接绕过整个隔离的致命后门**：

| # | 路径 | 原漏洞 | 危害 |
|---|------|--------|------|
| 1 | `POST /api/api-keys` | 只校验同公司，可给**他人 Agent 签发 API key** | 🔴 致命：拿到他人机器身份 → MCP 自认领任务到其机器 → 绕过指派闸门 |
| 2 | `PATCH /api/agents/:uuid` | 可改他人 Agent 的 `systemPrompt`/`persona` | 🔴 注入他人 Agent 的"大脑"，下次跑任务执行注入指令 |
| 3 | `DELETE /api/agents/:uuid` | 可删他人 Agent（级联删 key） | 🟠 DoS/破坏 |
| 4 | `DELETE /api/api-keys/:uuid` | 可撤销他人 Agent 的 key | 🟠 DoS：让他人机器掉线 |
| 5 | `GET /api/agents/:uuid` | 可看他人 Agent 详情（含 systemPrompt） | 🟡 信息泄露 |
| 6 | `GET /api/api-keys` | 列出他人 Agent 的 key 元信息 | 🟡 信息泄露 + 拿 uuid 去删 |

**修复**：统一原则——凡"管理自己 Agent"的 route，Agent 查询一律加 `ownerUuid: auth.actorUuid`，
查不到即 404（非披露，与"不存在"无法区分）。api-keys 列表先解析调用者自己的 Agent 再按 `agentUuid in [...]`
过滤；api-keys 撤销先解析 key 的 Agent 再校验归属。super_admin 走 `isUser` 门禁之外，不受影响。

**端到端复验**（小李 攻击 小杨 的机器）：给他人 Agent 签发 key / 篡改 systemPrompt / 删除 / 查看详情
**全部 404**，小杨 Agent 原样未污染；小李对自己 Agent 的同类操作全部成功；key 列表双向只见自己的。
新增 `api-keys/__tests__/route.test.ts`（5 例，含致命后门的拒绝断言）。全量 4116 绿。

> 教训：咽喉执法锁住了"数据写入"（指派），但"身份签发"（api-key）和"配置篡改"（agent PATCH）
> 是并行的旁路——归属隔离必须覆盖一个资源的**全部改动动词**，不只是最显眼的那个。
