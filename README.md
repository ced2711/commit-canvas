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
- Your drawing is saved in the browser automatically. English and 简体中文 interface.

## Use it

It's a static web page — nothing to install.

1. Open the app (GitHub Pages, or any static server, e.g. `python -m http.server` in this folder and visit <http://localhost:8000>).
2. Create a [personal access token with the `repo` scope](https://github.com/settings/tokens/new?scopes=repo&description=Commit%20Canvas) and paste it. If you use the GitHub CLI, `gh auth token` prints one you can paste.
3. Choose a repository (or click **New**), draw, and press **Paint to GitHub**.

New squares usually show up within minutes; GitHub says it can take up to 24 hours.

### How it works

For every painted day the app creates empty commits dated at local noon, authored with your GitHub `noreply` address, on the repository's default branch, and then fast‑forwards the branch once. Nothing is force‑pushed except when you explicitly undo your last paint. An empty repository is first seeded with a README.

The shade you pick decides how many commits a day gets: the darkest shade uses the number in **Commits for darkest shade** (auto‑suggested from your existing activity), lighter shades use ¼, ½ and ¾ of it. GitHub's own shading is relative to your whole year, so the result is close but not always exact.

For commits to count, GitHub requires the repository to be a non‑fork you own, and private repositories only show if you enable **Private contributions** on your profile.

### Privacy

The token is sent only to `api.github.com`. By default it lives in the tab's session storage and disappears when you close the tab; tick **Remember on this device** to keep it in local storage. **Sign out** removes it. You can revoke the token on GitHub at any time.

## Please be fair

Decorative commits are not work. Use this for fun, in a repository you own, and don't present the drawing as real activity. Follow the [GitHub Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies).

---

## 简体中文

在 GitHub 贡献图（绿墙）上画画：连接账号、选一个仓库、涂格子，Commit Canvas 会往这个仓库添加对应日期的 commit，画就会出现在你的主页上。

**功能**：四种深浅的画笔和橡皮擦（右键也能擦）；输入文字自动居中印到墙上；整体左右移动、撤销（Ctrl+Z）、清空；底下半透明显示你已有的真实贡献；可选最近一年或任意年份；在应用里直接选择或新建仓库；可以撤销上一次绘制；草稿自动保存。

**使用**：这是一个静态网页，无需安装。打开页面后粘贴一个 [带 `repo` 权限的 Token](https://github.com/settings/tokens/new?scopes=repo&description=Commit%20Canvas)（装了 GitHub CLI 的话运行 `gh auth token` 即可得到），选择仓库，画好后点 **画到 GitHub**。通常几分钟内就能在主页看到，最长可能需要 24 小时。

**说明**：每个格子会生成若干个中午时间的空 commit，作者是你的 GitHub `noreply` 邮箱，提交到默认分支并一次性快进推送；只有在你主动“撤销上次绘制”时才会强制重置分支。Token 只会发送给 `api.github.com`，默认只保存在当前标签页，关闭即消失。私有仓库需要在主页开启 “Private contributions” 才会显示。

装饰性的 commit 不代表真实工作量，请只在自己的仓库里娱乐使用。

## License

[GNU Affero General Public License v3.0](LICENSE). Copyright © 2026 Cedric (ced2711).

Inspired by the MIT‑licensed [gelstudios/gitfiti](https://github.com/gelstudios/gitfiti). Not affiliated with GitHub, Inc.
