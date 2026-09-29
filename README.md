# Commit Canvas

Draw on your GitHub contribution graph. Connect your account, pick a repository, paint some squares, and Commit Canvas adds the matching commits to that repository so the drawing appears on your profile.

[简体中文](#简体中文)

## Features

- **Paint** with four shades of green, or erase. Click a square with the same shade again to clear it; right‑click also erases.
- **Text**: type a word (A–Z, 0–9, `! ? . , : - + < > / * ♥`) and it's stamped centered on the graph.
- **Shift** the whole drawing left or right, **undo** (Ctrl+Z), **clear**. Keys `1`–`4` pick a shade, `0` the eraser.
- **Your real graph** is shown faded underneath, so you can see what's already there.
- **Past year or any year** you've been active in.
- **Pick or create** the target repository right in the app.
- **Undo last paint** resets the branch to where it was before, as long as nothing else was pushed since.
- Your drawing is saved automatically. English and 简体中文 interface.

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

1. Open Commit Canvas.
2. Create a [personal access token with the `repo` scope](https://github.com/settings/tokens/new?scopes=repo&description=Commit%20Canvas) and paste it. If you use the GitHub CLI, `gh auth token` prints one you can paste.
3. Choose a repository (or click **New**), draw, and press **Paint to GitHub**.

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

**功能**：四种深浅的画笔和橡皮擦（右键也能擦）；输入文字自动居中印到墙上；整体左右移动、撤销（Ctrl+Z）、清空；底下半透明显示你已有的真实贡献；可选最近一年或任意年份；在应用里直接选择或新建仓库；可以撤销上一次绘制；草稿自动保存。

**下载**：到 [Releases](https://github.com/ced2711/commit-canvas/releases/latest) 下载对应系统的安装包——Windows 选 `…_x64-setup.exe`，macOS 选 `…_universal.dmg`，Linux 选 `.AppImage` 或 `.deb`。安装包没有代码签名：Windows 弹出 SmartScreen 时点「更多信息 → 仍要运行」；macOS 提示“已损坏”时运行一次 `xattr -cr "/Applications/Commit Canvas.app"`。不想安装也可以直接用网页版：<https://ced2711.github.io/commit-canvas/>。

**使用**：打开软件后粘贴一个 [带 `repo` 权限的 Token](https://github.com/settings/tokens/new?scopes=repo&description=Commit%20Canvas)（装了 GitHub CLI 的话运行 `gh auth token` 即可得到），选择仓库，画好后点 **画到 GitHub**。通常几分钟内就能在主页看到，最长可能需要 24 小时。

**说明**：每个格子会生成若干个中午时间的空 commit，作者是你的 GitHub `noreply` 邮箱，提交到默认分支并一次性快进推送；只有在你主动“撤销上次绘制”时才会强制重置分支。Token 只会发送给 `api.github.com`；桌面版默认记住在本机，网页版默认只保存在当前标签页。私有仓库需要在主页开启 “Private contributions” 才会显示。

装饰性的 commit 不代表真实工作量，请只在自己的仓库里娱乐使用。

## License

[GNU Affero General Public License v3.0](LICENSE). Copyright © 2026 Cedric (ced2711).

Inspired by the MIT‑licensed [gelstudios/gitfiti](https://github.com/gelstudios/gitfiti). Not affiliated with GitHub, Inc.
