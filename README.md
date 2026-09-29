# Commit Canvas

Draw on your GitHub contribution graph. Connect your account, pick a repository, paint some squares, and Commit Canvas adds the matching commits to that repository so the drawing appears on your profile.

[简体中文](#简体中文)

## Features

- **See your real graph**: your existing contributions are shown in full color; squares you add get a dot, and **Preview result** shows roughly how the graph will look afterwards.
- **Skip busy days** (on by default): no commits are added on days that already have contributions, so your drawing stays clean.
- **Paint** with four shades or the eraser; click a square again (or right‑click) to erase. Each shade shows how many commits it adds.
- **Text and templates**: stamp a word (A–Z, 0–9, `! ? . , : - + < > / * ♥`) or start from Heart, HELLO, Wave or Stars.
- **Edit comfortably**: undo / redo (Ctrl+Z / Ctrl+Y), move the drawing left or right, clear, bigger squares, keyboard drawing (arrows + Space, `0`–`4` for shades) and a scroll mode on touch screens.
- **Past year or any year** you've been active in.
- **Pick or create** the repository in the app — one click creates a dedicated `commit-canvas-art` repository.
- **Review before sending**: account, repository, branch, number of commits and dates; large sends need an extra tick.
- **Undo last send** puts the branch back as long as nothing else was pushed since.
- **Save / open designs** as files (designs from the previous version open too) and **export a Bash or PowerShell script** if you'd rather create the commits yourself.
- Drawing saved automatically; English and 简体中文 interface.

## Download

Get the installer for your system from the [latest release](https://github.com/ced2711/commit-canvas/releases/latest):

| System | File |
| --- | --- |
| Windows | `…_x64-setup.exe` (or `.msi`) |
| macOS (Intel & Apple silicon) | `…_universal.dmg` |
| Linux | `.AppImage` or `.deb` |

The builds are not code‑signed. On Windows, if SmartScreen appears choose **More info → Run anyway**. On macOS, if the app is reported as damaged, run `xattr -cr "/Applications/Commit Canvas.app"` once.

Prefer not to install anything? The same app runs in the browser at <https://ced2711.github.io/commit-canvas/>.

## Use it

The app walks you through four numbered steps:

1. **Sign in.** In the desktop app, if you already use the GitHub CLI, click **Use my GitHub CLI login**. Otherwise click **Create a token** — GitHub opens with the right permission (`repo`) ticked — press **Generate token**, and paste the token.
2. **Choose a repository**, or click **New repository** to create one just for drawing.
3. **Draw.**
4. **Send to GitHub**, check the summary, and confirm.

New squares usually show up within minutes; GitHub says it can take up to 24 hours.

### How it works

For every painted day the app creates empty commits dated at local noon, authored with your GitHub `noreply` address, on the repository's default branch, and then fast‑forwards the branch once. Nothing is force‑pushed except when you explicitly undo your last paint. An empty repository is first seeded with a README.

The shade you pick decides how many commits a day gets: the darkest shade uses the number in **Commits for darkest shade** (auto‑suggested from your existing activity), lighter shades use ¼, ½ and ¾ of it. GitHub's own shading is relative to your whole year, so the result is close but not always exact.

For commits to count, GitHub requires the repository to be a non‑fork you own, and private repositories only show if you enable **Private contributions** on your profile.

### Privacy

The token is sent only to `api.github.com`. In the desktop app it is remembered on your computer by default; on the web page it only lives in the current tab unless you tick **Remember on this device**. **Sign out** removes it. You can revoke the token on GitHub at any time.

## Development

The interface is plain HTML/CSS/JavaScript in [`web/`](web); the desktop app wraps it with [Tauri](https://tauri.app) in [`src-tauri/`](src-tauri).

- Web: serve `web/` with any static server, e.g. `python -m http.server -d web`.
- Desktop: install Node.js and Rust, then `npm install`, `npm run icons`, and `npm run dev` (or `npm run build` for installers).
- Releases: pushing a `v*` tag builds Windows, macOS and Linux installers with GitHub Actions and publishes them as a release. Pushes to `main` redeploy the web version to GitHub Pages.

## Please be fair

Decorative commits are not work. Use this for fun, in a repository you own, and don't present the drawing as real activity. Follow the [GitHub Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies).

---

## 简体中文

在 GitHub 贡献图（绿墙）上画画：连接账号、选一个仓库、涂格子，Commit Canvas 会往这个仓库添加对应日期的 commit，画就会出现在你的主页上。

**功能**：完整显示你已有的绿点，新加的格子带圆点标记，并可「预览效果」；默认避开已有贡献的日子；四种深浅画笔和橡皮擦（每种显示对应 commit 数）；文字和模板（爱心 / HELLO / 波浪 / 星星）；撤销 / 重做、整体移动、清空、放大格子、键盘绘图、触屏滑动模式；最近一年或任意年份；在软件里选择或一键新建专用仓库；提交前核对账号、仓库、分支、数量和日期；可撤销上次提交；保存 / 打开设计文件（兼容旧版），导出 Bash / PowerShell 脚本；自动保存草稿；中英文界面。

**下载**：到 [Releases](https://github.com/ced2711/commit-canvas/releases/latest) 下载对应系统的安装包——Windows 选 `…_x64-setup.exe`，macOS 选 `…_universal.dmg`，Linux 选 `.AppImage` 或 `.deb`。安装包没有代码签名：Windows 弹出 SmartScreen 时点「更多信息 → 仍要运行」；macOS 提示“已损坏”时运行一次 `xattr -cr "/Applications/Commit Canvas.app"`。不想安装也可以直接用网页版：<https://ced2711.github.io/commit-canvas/>。

**使用**：软件按 1–4 步引导：① 登录——桌面版装了 GitHub CLI 可一键沿用登录，否则点「创建 Token」（权限已自动勾好），点 Generate token 后粘贴回来；② 选择仓库或一键新建；③ 画画；④ 提交到 GitHub，核对后确认。通常几分钟内就能在主页看到，最长可能需要 24 小时。

**说明**：每个格子会生成若干个中午时间的空 commit，作者是你的 GitHub `noreply` 邮箱，提交到默认分支并一次性快进推送；只有在你主动“撤销上次绘制”时才会强制重置分支。Token 只会发送给 `api.github.com`；桌面版默认记住在本机，网页版默认只保存在当前标签页。私有仓库需要在主页开启 “Private contributions” 才会显示。

装饰性的 commit 不代表真实工作量，请只在自己的仓库里娱乐使用。

## License

[GNU Affero General Public License v3.0](LICENSE). Copyright © 2026 Cedric (ced2711).

Inspired by the MIT‑licensed [gelstudios/gitfiti](https://github.com/gelstudios/gitfiti). Not affiliated with GitHub, Inc.
