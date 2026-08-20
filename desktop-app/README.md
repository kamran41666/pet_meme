# PetMemeStudio 本地生产台

## 直接使用

双击 `dist/PetMemeStudio.exe`。程序会打开本地中文界面，关闭控制台窗口即可停止。

建议先手工建立一笔自有样品单，再配置飞书同步。完整方案见 `自动化工作流与表单实施方案.md`，飞书后台按 `飞书接入操作手册.md` 配置，字段按 `飞书表单字段配置清单.csv` 创建。

## 开发与验证

```powershell
npm install
npm test
npm run build
```

最终文件：`dist/PetMemeStudio.exe`。

程序默认向上寻找包含 `pet-sticker-studio/SKILL.md` 的项目目录。若需要放到其他位置运行，可设置环境变量 `PET_MEME_PROJECT_ROOT` 指向项目根目录。
