# Templates

> 子模块：Templates
> 所属模块：Capability Distribution System
> 目标：为用户提供领域模板、审美偏好、颜色方案和品牌/IP 风格引用

## 1. 定位

Templates 解决的是：

> 为用户在某个领域下，针对某种审美风格进行开发。

它不直接调用工具，不直接执行自动修复，也不直接控制 runtime。模板只提供结构化设计上下文。

## 2. 两个层次

### 2.1 领域模板

领域模板回答“这是哪类网站或页面”。

示例：

- 创意与艺术。
- 金融科技。
- 专业企业。
- 汽车。
- Apple 风产品页。
- 品牌/IP 风格站点。
- SaaS Landing Page。
- Admin Console。
- Portfolio。
- Product Launch Page。

领域模板包含：

- 推荐页面结构。
- 常见信息架构。
- 默认模块顺序。
- 适合的 CTA 类型。
- 适合的视觉密度。
- 行业禁忌和合规提示。
- 推荐 variation directions。

### 2.2 审美偏好

审美偏好回答“它看起来是什么视觉气质”。

示例：

- 极简黑白。
- 蓝白可信。
- 暖色商业。
- 高饱和艺术。
- 高级灰。
- 霓虹未来。
- 柔和 pastel。
- 高对比 editorial。

审美偏好包含：

- 颜色方案。
- 背景策略。
- 排版气质。
- 按钮与控件风格。
- 图片/素材倾向。
- 动效克制程度。

## 3. 推荐数据模型

### DomainTemplate

```ts
type DomainTemplate = {
  id: string
  visibility: 'official' | 'private' | 'workspace' | 'team'
  ownerUserId?: string | null
  name: string
  category: string
  description: string
  schemaVersion: string
  contentVersion: string
  structure: {
    sections: string[]
    requiredElements: string[]
    optionalElements: string[]
  }
  constraints: string[]
  variationDirections: string[]
  status: 'active' | 'archived' | 'disabled'
}
```

### AestheticProfile

```ts
type AestheticProfile = {
  id: string
  name: string
  description: string
  colorPaletteIds: string[]
  typographyTone: string
  layoutTone: string
  motionTone: string
  negativeRules: string[]
}
```

### ColorPalette

```ts
type ColorPalette = {
  id: string
  name: string
  colors: string[]
  usage: Record<string, string>
  accessibilityNotes: string[]
}
```

## 4. Runtime 编译

Templates 编译为 Runtime Gateway prompt context，而不是前端直接拼 prompt。

编译结果包括：

- Domain context。
- Information architecture hint。
- Aesthetic context。
- Color palette rules。
- Negative style rules。
- Variation direction seed。

## 5. MVP 官方模板建议

首批已落地 registry：

- Fintech Trust Landing。
- Creative Studio Portfolio。
- Professional Enterprise Home。
- Automotive Product Launch。
- Apple-like Product Page。
- AI Tool Dashboard。

后续候选：

- SaaS Conversion Landing。
- Brand/IP Campaign Page。

## 6. 安全与版本

- 官方模板必须版本化。
- 用户模板必须记录来源 artifact id/version。
- 模板不能包含 runtime 路径指令。
- 模板不能覆盖安全 guardrails。
- 创建 job 时保存模板 snapshot，避免旧 session resume 读取新版本模板。
