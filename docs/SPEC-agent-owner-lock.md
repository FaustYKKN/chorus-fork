# SPEC: Agent 属主锁（严格私有化）

- 状态：**待评审**（评审人：平台负责人）
- 版本：v1（2026-07-14）
- 范围：chorus-fork 服务端；opencode-chorus 插件**无需改动**
- 一句话：把"能让某台开发机执行任何东西"的全部路径收敛到一条规则——**只有机器属主本人（及其名下 Agent）能把工作路由到该 Agent**。不设共享标签，不设超管例外。

---

## 1. 威胁模型

**资产**：约 40 台开发机的本地执行权。Agent 被唤醒后，opencode 以开发者本人的系统权限运行（可读写删文件、可出网），并消耗该开发者的模型 key 额度。唤醒机制本质上是"平台签发的远程代码执行"，必须按病毒的传播路径来审视。

**敌手 / 事故源**（按预期频率排序）：

| 编号 | 来源 | 说明 |
|---|---|---|
| A1 | 手滑用户 | 最高频。指派列表里 40 个 Agent 选错一个，任务跑到别人机器上 |
| A2 | 恶意注册用户 | 邀请码外泄、离职未禁用 |
| A3 | 被提示词注入的 Agent | 恶意任务/评论/文档内容注入某人的 Agent 后，用它的 MCP key **二次派发**给全公司 Agent —— "一锅端"主通道 |
| A4 | 泄露的 Agent API key | 冒充该 Agent 身份 |
| A5 | 被盗超管账号 | 平台管理权被盗 |

**信任锚**：服务端。平台本身被攻破不在本 SPEC 范围。**UI 过滤只是体验，不是防线**——所有规则必须落在服务层，REST / server action / MCP 三个入口共用。

---

## 2. 现状盘点（已逐条在代码里核实）

| # | 路径 | 现状 | 风险 |
|---|---|---|---|
| 1 | 会话直发指令：`/api/daemon-sessions/ad-hoc`、`/api/daemon-sessions/[uuid]/instruction` | ✅ 已 owner 锁（`findVisibleSession` / `callerOwnsAgent`，非属主 404 不泄露） | 补对抗测试锁住行为即可 |
| 2 | 连接/会话/转录可见性 | ✅ 基本已按 owner（`listConnectionsForOwner`） | P2 复核补测 |
| 3 | 任务指派（网页 server actions，含**实例钉选**） | ❌ 全公司任意 Agent 可选可派 | A1/A2 主通道 |
| 4 | 任务指派（MCP `chorus_pm_assign_task`） | ❌ PM agent 可派全公司任意 Agent | **A3 一锅端主通道** |
| 5 | Idea 指派 + YOLO / start_development 等唤醒触发 | ❌ 任何用户可对"assignee 是别人 Agent"的 Idea 按下唤醒 | A1/A2 |
| 6 | 提案任务草稿携带 assignee，批准时物化成真任务 | ❌（实现前复核草稿字段细节） | 隐蔽指派 |
| 7 | @提及 Agent/实例 触发唤醒 | ❌（实现前复核唤醒策略细节） | 评论区注入+唤醒 |
| 8 | Agent 定义改写：persona / **systemPrompt** / permissions / 删除 | ❌ 疑似仅公司范围 | **systemPrompt 投毒 = 持久注入**，比派任务更毒 |
| 9 | 给任意 Agent 发 API key（`POST /api/api-keys` 只校验公司） | ❌ 已确认 | 身份冒用 |

**生产库现状**：7 个 Agent 的 ownerUuid 全部指向 admin 用户，无空值——迁移零成本，规则可直接非空强制。

---

## 3. 规则（Normative）

- **R1 属主唯一**：`Agent.ownerUuid` 为唯一属主，强制非空。新 Agent 创建时自动归创建者（现有行为）。
- **R2 执行路由规则**：凡是"导致 Agent 被唤醒、或改变它将来执行内容"的操作（指派、实例钉选、唤醒触发、提及唤醒、直发指令、草稿物化），actor 必须满足：
  - `user`：`actorUuid === agent.ownerUuid`；
  - `agent`：目标是**自己**（claim 等自指操作，现状不变），或目标 Agent 与自己**同一 owner**（我的 PM agent 只能驱动我自己的开发 agent）；
  - `super_admin`：**一律拒绝**。超管只有"停"权（见 R3），没有"派"权——被盗超管号不能变成 40 台机器的遥控器。
- **R3 管理面规则**：改 Agent 定义（persona/systemPrompt/roles/permissions）、删除、发 key —— **仅 owner**。超管保留三件事：**停用、删除、转移属主**，全部记审计并通知原属主；超管**不可**改 systemPrompt/persona（防投毒）、不可发 key。
- **R4 人对人不受限**：任务派给 `user` 不执行代码，保持全公司可派。
- **R5 失败语义**：非属主路由 → `403` 并明确说"该 Agent 不属于你"；涉及会话/转录存在性的场景沿用现有 404 不泄露先例。
- **R6 单一闸门**：新增 `assertAgentRoutable(auth, agentUuid)` / `assertAgentOwned(auth, agentUuid)`（放 `src/lib/authz/`），instance uuid 先解析回 Agent 再判。**禁止**各路由自己写判断——三个入口（REST / server action / MCP）都必须过这一个函数，测试只锁它 + 每个入口一条穿透用例。
- **R7 UI 同步收敛**：指派弹窗、实例选择器、YOLO 按钮只对 owner 出现/可选。别人的 Agent 在看板上仍然**可见**（任务归属要能看懂），只是不可选。
- **R8 拒绝即审计**：所有被拒的路由尝试写 activity（谁 → 想动谁的哪个 Agent），供发现 A2/A3 苗头。

---

## 4. 落地清单

**P0 执行面（一锅端通道，必须一次做完）**
1. 服务层闸门函数 + 单测（含 instance→agent 解析）
2. 任务指派 server actions：assign-to-agent、assign-to-instance 两条
3. MCP `chorus_pm_assign_task` 加同规则（同 owner 才可派）
4. Idea 指派/agent-claim 路径 + YOLO / start_development / stage-advance 触发前校验（触发者必须是 assignee Agent 的 owner）
5. 提案物化：以**批准人**为 actor 逐条复核 task draft 的 assignee；不合规的物化为**未指派**并在结果里提示
6. 提及唤醒：非 owner 的提及**不产生 wake**（页面通知照常，唤醒事件没有）

**P1 管理面（投毒与冒用通道）**
7. `PATCH/DELETE /api/agents/[uuid]` owner 锁（persona/systemPrompt/permissions 仅 owner）
8. `POST /api/api-keys` owner 锁
9. 超管能力收敛为 停用/转移/删除 + 审计 + 通知原属主

**P2 纵深（可延后）**
10. 连接/转录可见性全面复核补测
11. 被拒尝试的审计视图/告警
12. 守护进程侧二次校验：wake envelope 携带 assigner 身份，属主不符本地拒执（防未来服务端逻辑回归；可选）

估算：P0+P1 含测试一到两天。全部改动在 fork 服务端，插件与守护进程零改动（P12 除外）。

---

## 5. 显式不解决（残留风险，写进培训材料）

1. **内容注入到"自己人"**：你自己的 Agent 读到恶意任务内容仍可能被带偏。本 SPEC 把爆炸半径压缩到"该属主自己的机器"，不能压到零。缓解：opencode 端权限别全放行（`permission` 配置收敛）、"任务内容不可信"写进 skill 提示。
2. **邀请码即入场券**：码泄露=能注册进来；但进来也只能玩自己的 Agent。码可随时在超管面板轮换/清空。
3. **DEFAULT_USER 共号**：谁用它登录谁就是"admin 属主"。40 人各自有账号后建议下线该兜底账号（只影响网页登录，Agent API key 链路无关）。
4. **超管被盗**：不能直接派活，但能"转移属主→再派"。转移动作记审计+通知原属主，属于可发现不可阻止；平台根被盗本就是全输局面。
5. **Agent key 被盗**：等于盗走该属主的 Agent 身份，半径=同属主的机器。

---

## 6. 决策点（评审时请逐条拍板）

| # | 问题 | 推荐 |
|---|---|---|
| D1 | 超管是否完全没有派活权 | **是**（严格模式；超管只停不派） |
| D2 | 非 owner 提及别人的 Agent：整个禁止，还是允许提及但不唤醒 | **允许提及、不唤醒**（保留协作语义，掐断执行） |
| D3 | 40 人到位后 DEFAULT_USER 兜底账号是否下线 | **下线**（超管+个人账号已覆盖全部用途） |
| D4 | PM agent 跨人分发被打破：跨人协作改为"派给人，人自己转给自己的 Agent"，接受吗 | **接受**（这正是把'动我机器'的最终决定权还给机主本人） |
| D5 | 现有 7 个 Agent 全归 admin：保持不动，新人自建自持 | **保持** |

---

## 7. 验收（对抗性用例，全部要有自动化测试）

- 用户 B 经 **REST / server action / MCP** 三条路把任务派给 A 的 Agent → 全部 403 + 审计记录
- B 把任务钉到 A 机器的某个目录实例 → 403
- B 对"assignee = A 的 Agent"的 Idea 点 YOLO / 开始开发 → 403
- B 在评论里 @A 的 Agent 注入指令 → 服务端断言**无 wake 事件、无 pending turn**
- B 给 A 的 Agent 发 API key / 改 systemPrompt → 403
- PM agent（owner=B）`chorus_pm_assign_task` 到 A 的 Agent → 拒绝
- 提案里藏一条"assignee=