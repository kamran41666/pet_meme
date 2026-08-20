# 订单结构

订单以 UTF-8 `order.json` 保存，必填字段如下：

| 字段 | 类型 | 规则 |
|---|---|---|
| `order_id` | string | 不含个人信息的稳定编号，建议 `PS-YYYYMMDD-NNN` |
| `pet_name` | string | 仅用于成品与预览展示 |
| `pet_type` | string | 只能是 `cat` 或 `dog` |
| `reference_photos` | string[] | 5–8 个相对订单文件的路径 |
| `must_keep_features` | string[] | 必须保留的可见身份特征 |
| `must_not_include` | string[] | 禁止元素 |
| `case_display_authorization` | boolean | 默认 `false`，与订单处理授权分开 |
| `photo_rights_confirmation` | boolean | 必须为 `true` 才能生产 |
| `output_directory` | string | 输出目录；不得覆盖已有订单 |
| `auto_approve_sample` | boolean | 仅自有样品可设 `true` |

可选字段 `style_profile_id` 指向已批准的风格档案；缺省值为首发唯一风格 `launch-warm-rounded-v1`。使用其他档案属于内部配置或套餐外需求，不自动改变 19.9 元商品边界。

输入需含 5–8 张照片：至少两张清晰正脸、一张侧脸、一张全身；照片应无遮挡、不过暗、不过度美颜且主体明确。模糊、过暗、严重遮挡、多宠或主体不明确时，状态改为 `NEED_MORE_INPUT`，逐项列出缺少的角度或替换照片。

自有且有权使用的样品在 `auto_approve_sample=true` 时，可输出身份卡后继续；正式客户订单默认 `false`，停在 `IDENTITY_REVIEW` 等待人工确认。双宠、复杂场景/服装、换风格、IP 角色模仿和重新设计不属于体验包。

示例（不含真实个人信息）：

```json
{
  "order_id": "PS-20260820-001",
  "pet_name": "团子",
  "pet_type": "cat",
  "reference_photos": ["references/photo-01.jpg", "references/photo-02.jpg", "references/photo-03.jpg", "references/photo-04.jpg", "references/photo-05.jpg"],
  "must_keep_features": ["左眼上方浅色斑", "深色尾尖"],
  "must_not_include": ["衣服", "项圈"],
  "case_display_authorization": false,
  "photo_rights_confirmation": true,
  "output_directory": "orders/PS-20260820-001",
  "auto_approve_sample": false
}
```
