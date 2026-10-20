# 拆解登录巨石组件、抽取托管会话服务与重构虚假测试

**Class:** simplification
**Status:** implemented
**Date:** 2026-10-18
**Source:** 2026-10-18 `$thermo-nuclear-code-quality-review` 专项架构审查；上游主提案 `.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`

## Goal

针对 UI 表现层与会话管理层的过度耦合与坏味道进行治理：
1. **消除 UI 层的领域逻辑渗透与近百行 1:1 复制粘贴**：`Login.tsx` 与 `InstanceEdit.tsx` 中逐行复制了底层 Salt 生成、MasterKey 派生、内存 KeyVault 写入与远端 POST 注册；
2. **拆解 600 行巨石 `Login.tsx`**：组件平铺了 17 个 `useState`，由各种隐式布尔组合拼凑视图渲染，容易产生状态未清理的幽灵 UI；
3. **消除三态反射坏味道**：`auth.tsx` 的 `connect` 函数利用 `'managed' in opts` 运行时反射来处理清空、更新与保留，破坏了 TypeScript 类型系统；
4. **根除自证式虚假测试（Mock Theater）**：`Login.test.ts` 仅断言局部变量赋值并在测试用例内自写业务分支逻辑，产生虚假安全感。

## Decision

1. **下沉抽取 `ManagedSessionService` 领域服务**：
   - 在 `src/lib/session/managedService.ts` 中封装 `enroll(params)` 与 `unenroll(instanceId)`；
   - 统一收敛密码学派生、远端注册、KeyVault 缓存与本地快照迁移触发；
   - 具备完整的事务回滚保证：若任一环节（如网络或密码错误）失败，自动擦除已缓存的内存 SessionKey，杜绝孤立脏状态；
   - `Login.tsx` 与 `InstanceEdit.tsx` 仅调用高层服务，不再直接触碰加解密底层。
2. **`Login.tsx` 彻底拆解为单一职责子组件体系**：
   - `Login.tsx`（~80 行，纯容器，负责背景装饰、Logo Header 与 Segmented 模式切换）；
   - `DirectLoginForm.tsx`（专注直连模式的 URL/账号/密码输入与提交跳转）；
   - `ManagedLoginView.tsx`（通过严格的 Discriminated Union 有限状态机驱动）：
     ```ts
     type ManagedPhase =
       | { type: 'list' }
       | { type: 'activate'; instance: ManagedInstanceMeta }
       | { type: 'register' }
     ```
     彻底根除 17 个平铺 State 变量与相互依赖的标志位布尔运算。
3. **规范化 `auth.connect` 参数契约**：
   - 废除 `'managed' in opts` 反射，引入具名显式动作：
     ```ts
     export interface ConnectOptions {
       id?: string
       label?: string
       activate?: boolean
       managedAction?:
         | { type: 'set'; metadata: InstanceManagedMetadata }
         | { type: 'remove' }
         | { type: 'preserve' }
     }
     ```
   - 意图显式表达，杜绝参数转发时的属性丢失或隐式行为。
4. **重构 `Login.test.ts` 为真实行为契约测试**：
   - 彻底删除单纯测试 JS 局部变量赋值的无效用例；
   - 测试 `ManagedSessionService.enroll` 在异常场景下的回滚能力（事务原子性测试）；
   - 测试 `ManagedLoginView` 状态机在 `list` -> `activate` -> `register` 之间的确切状态流转与取消行为。

## Accept

- [x] `Login.tsx` 削减至 100 行以内，不再包含任何加解密或平铺的多重标志位
- [x] `Login.tsx` 与 `InstanceEdit.tsx` 中的重复代码彻底消除，统一走 `ManagedSessionService`
- [x] `auth.connect` 接口使用显式枚举动作替代 `'managed' in opts` 反射
- [x] `Login.test.ts` 彻底清空 Mock Theater，所有用例均针对真实服务契约与交互行为进行断言
- [x] `pnpm test` 全量通过
- [x] `node scripts/verify-proposals.mjs` 校验通过

## Note

- 关联主提案：`.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`
