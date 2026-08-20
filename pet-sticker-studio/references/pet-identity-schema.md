# 宠物身份卡

先逐张查看编号照片，基于可见证据输出 `pet_identity.json` 和便于人工确认的 `pet_identity.md`。禁止凭外观断言年龄、品种纯度、健康状况、性格或性别。

顶层字段：`order_id`、`pet_name`、`pet_type`、`source_photo_ids`、`features`、`uncertainties`、`review_status`。`review_status` 为 `pending`、`approved` 或 `changes_requested`。

`features` 必须覆盖：毛色底色、脸型、口鼻比例、眼睛、耳朵、鼻头、脸部花纹、身体花纹、四肢花纹、尾巴花纹、左右不对称特征、毛发长度、体型、尾巴形状、特殊标志、临时配饰。每项采用：

```json
{
  "description": "左前爪为白色，边界到腕部",
  "evidence_photo_ids": ["photo-01", "photo-04"],
  "confidence": "high",
  "persistence": "stable",
  "must_preserve": true
}
```

- `confidence`：`low` / `medium` / `high`。
- `persistence`：`stable`（身份稳定特征）或 `temporary`（项圈、衣服等临时元素）。
- 证据冲突或照片看不清时写入 `uncertainties`，不得猜测。
- 将订单的 `must_keep_features` 映射为 `must_preserve=true`；无明确要求时不保留临时配饰。
- 批量生成前必须获得 `approved`；只有已确认权利的自有样品且 `auto_approve_sample=true` 可在输出身份卡后自动标为批准。
