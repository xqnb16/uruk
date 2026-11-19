# 乌鲁克 · 旅人

古代乌鲁克的互动全景与第一人称漫游。可以从芦苇船码头进入双塔城门，过桥参观西岸作坊，或者沿台阶登上白庙露台。

## 游览

1. 下载并解压发布包，打开 `index.html`。
2. 点击「乘船入城」，等待场景载入后点击「开始漫游」。也可以直接打开 `explore.html`。
3. 电脑用 W、A、S、D 移动，鼠标转向，按 Shift 快走，按 Esc 释放鼠标。触屏设备用方向按钮移动，拖动画面转向。

网页素材随包提供，可离线运行。第一人称漫游需要支持 WebGL 2 的浏览器。右上角可切换「高画质」与「流畅画质」。

## 源文件

`index.html` 是全景入口，`explore.html` 是漫游入口。修改 `journey.js` 或 `uruk-*.js` 中的漫游逻辑后，可用下面的命令重新生成浏览器使用的脚本。

```sh
npx --yes esbuild@0.25.10 journey.js --bundle --format=iife --minify --target=es2020 --loader:.webp=dataurl --outfile=assets/journey-v08.bundle.js
```

## 第三方素材

- Three.js 与网格压缩解码器使用 MIT 许可。[Three.js 许可](assets/THREE-LICENSE.txt) · [Meshoptimizer 许可](assets/MESHOPT-LICENSE.md)
- 人物基础网格和形体数据来自 MakeHuman / MPFB 的 CC0 核心素材，并在项目中重新制作了服装与动作。[MakeHuman 许可说明](https://www.makehumancommunity.org/about/license.html)
