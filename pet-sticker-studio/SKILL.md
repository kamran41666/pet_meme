---
name: pet-sticker-studio
description: 将 5–8 张单只猫或狗的参考照片规范化制作成固定十张、统一风格、透明底且单独叠加中文的宠物表情包。用于 19.9 元首发体验包生产；不处理双宠、复杂场景服装、IP 模仿或无限修改。
---

# Pet Sticker Studio

按状态推进订单：`RECEIVED → NEED_MORE_INPUT → IDENTITY_REVIEW → PILOT_GENERATION → BATCH_GENERATION → CAPTIONING → QA → PREVIEW → FINAL_DELIVERY`。资料不足时停在 `NEED_MORE_INPUT` 并给出补图清单。

## 不变量

- 先查看全部照片、确认身份特征，再批量生成；正式客户默认在身份卡阶段等待人工确认。
- 先生成“开心”和“委屈”两张无字试作并质检，通过后才生成剩余八张。
- 宠物主体必须依照 `imagegen` Skill 使用内置图片生成或编辑能力；不得用普通绘图脚本伪造。优先参考图衍生，并让每张引用原图、确认身份卡与同一锚点。
- 卡通夸张只能改变比例和动作幅度，不能破坏身体拓扑、透视、关节连接、前后遮挡或落地关系；生成与质检必须读 [姿态与透视规范](references/pose-and-perspective.md)。
- Python/Pillow 只负责检查、中文排版、联系表、验证与打包。不得把确定性脚本当作视觉判断。
- 用户明确选择外部提供商时，可用 `scripts/generate_external_image.py` 调用已配置的模型；密钥只能从本地 `.env`/`.env.csv` 读取，不得写入提示词、报告、日志或交付包。外部模型仍必须执行同一身份、姿态、透明底与人工视觉质检门禁。
- 单张最多自动重试两次；仍失败便停止并记录人工处理项。不得扩大 19.9 元体验包范围。

## 按需读取与执行

1. 收单时读 [订单结构](references/order-schema.md) 与 [隐私授权](references/privacy-and-rights.md)，运行 `scripts/inspect_inputs.py`。
2. 建身份卡时读 [身份卡结构](references/pet-identity-schema.md)，输出 `pet_identity.json` 和 `pet_identity.md`；需要确认时暂停。
3. 生成前读 [风格预设](references/style-preset.md)、[表情库](references/expression-pack.md)、[姿态与透视规范](references/pose-and-perspective.md) 与 [生成流程](references/generation-protocol.md)。依照 `imagegen` Skill 先做锚点，再做两张试作，最后做八张；先保存无字版。
4. 排字时运行 `scripts/apply_captions.py`。质检时读 [质检表](references/qa-checklist.md)，并运行 `scripts/validate_exports.py`。
5. 预览与交付分别运行 `scripts/create_contact_sheet.py`、`scripts/package_order.py`；人工视觉质检仍不可省略。

## 风格档案

当用户提供一组有权使用的风格参考图并要求保存为以后可选项时，读 [风格档案](references/style-profiles.md)：先运行 `scripts/inspect_style_inputs.py`，再实际查看全部图片，提炼而非复制具体作品，输出结构化分析，最后运行 `scripts/save_style_profile.py` 校验并保存。不得把品牌、IP 或在世艺术家名称写成模仿目标。首发订单默认仍使用 `style-preset.md`；选择其他档案视为内部配置或套餐外需求，除非用户明确调整商品边界。

所有脚本先用 `--help` 查看参数；遇到非零退出码，保留输出报告并停止相关阶段。
