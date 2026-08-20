# 可复用风格档案

此模式把一组相关参考图总结为可复用的视觉选项，不负责复制具体作品。先确认图片权利与用途，再实际查看每张图；脚本只能检查文件和保存结构，不能替代视觉分析。

## 输入与边界

- 建议 3–12 张风格一致、来源可说明的参考图；先用 `inspect_style_inputs.py` 给每张稳定 `style-NN` 编号并保存机器可读清单。
- 排除品牌标志、IP 角色、人物肖像及要求模仿在世艺术家的素材；若无法安全抽象，停止并说明。
- 分析画面语言，不复制具体角色、构图、签名、水印或可识别作品元素。
- 19.9 元首发订单仅使用已批准的默认档案；新建或切换档案不会自动改变商品范围。

## 分析维度

实际观察并总结：媒介/质感、轮廓、形状语言、头身比、色彩与饱和度、光影、阴影、高光、细节密度、构图、主体占比、安全边距、背景、贴纸边缘、表情夸张度、文字留白。区分多张图共有的稳定规律与偶发元素，并给出证据图片 ID 与置信度。

## 保存格式

创建 UTF-8 JSON 后运行 `save_style_profile.py`。必填字段：

```json
{
  "profile_id": "warm-rounded-v1",
  "display_name": "暖圆贴纸",
  "version": 1,
  "source_image_ids": ["style-01", "style-02", "style-03"],
  "rights_confirmed": true,
  "status": "approved",
  "summary": "温暖、圆润、低细节的贴纸插画",
  "positive_requirements": ["圆润清晰外轮廓", "柔和暖色光影"],
  "negative_constraints": ["不含品牌或 IP 元素", "不生成文字"],
  "visual_parameters": {
    "shape_language": "round",
    "linework": "clean medium outline",
    "palette": "warm muted",
    "lighting": "soft",
    "detail_density": "low-medium",
    "composition": "centered square",
    "background": "transparent",
    "safe_margin_percent": 8
  },
  "evidence": [{"observation": "轮廓圆润", "image_ids": ["style-01", "style-03"], "confidence": "high"}],
  "prohibited_references": []
}
```

`status` 为 `draft` 或 `approved`。只有权利确认、无禁止模仿目标且经人工审核的 `approved` 档案可用于生产。保存后生成同名 `.json` 与 `.md`，同一 `profile_id` 不覆盖；修改时增加版本或使用新 ID。

项目内已保存的具体档案位于 `references/style-profiles/`。使用前读取所选 JSON；`draft` 只能用于评审和试验，不得作为正式客户生产的已批准选项。
