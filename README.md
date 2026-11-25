# Antigravity 桌面版 · 中文界面与额度面板

一次安装，在 Antigravity Desktop 中使用简体中文界面，并在侧栏查看当前账号的模型额度。适用于 Windows x64。客户端需已安装，查看额度时需登录 Antigravity。

**[下载 Windows x64 一键安装包](https://github.com/LaMonsters/antigravity-quota-hover/releases/latest/download/Antigravity-ZH-Quota-Windows-x64.zip)** · [所有版本](https://github.com/LaMonsters/antigravity-quota-hover/releases)

## 安装

1. 保存正在进行的工作，从系统托盘完全退出 Antigravity。
2. 将下载的 ZIP **全部解压**到一个文件夹，双击里面的 **`install.bat`**。安装包自带运行环境，可以离线安装。
3. 重新打开 Antigravity。主窗口和原生菜单会显示中文。鼠标停在左下角「设置」右侧的圆形仪表按钮，即可查看各模型组的每周额度、5 小时额度和重置时间。也可以按 Tab 聚焦按钮，按 Esc 收起面板。

面板使用客户端当前登录账号显示的数据。模型分组和可见的额度窗口由账号决定。首次安装默认保留英文品牌名 Antigravity。已单独安装汉化时，整合版沿用已有汉化，并安装本项目的额度按钮。

## 更新和还原

- **客户端升级后**，若汉化或按钮消失，退出客户端，重新双击 `install.bat`。同一客户端版本可以重复安装。
- **还原**时退出客户端，双击 **`uninstall.bat`**。它会恢复本次客户端版本首次使用整合版前的资源文件。如果当时就有其中一个插件，还原后该插件也会保留。
- 安装器先在临时目录生成整合包，验证两个组件后再替换客户端资源文件。原文件和校验记录保存在客户端的 `resources\.antigravity-zh-quota\` 目录。请保留此目录以便还原。客户端更新或被其他工具修改后，安装器只使用与当前文件指纹匹配的恢复记录。

## 自定义路径和源码运行

默认查找 `%LOCALAPPDATA%\Programs\antigravity`。安装在其他位置时，可在解压目录的 PowerShell 中运行以下命令，将示例路径换成包含 `Antigravity.exe` 的文件夹。

```powershell
.\install.bat --install-dir "D:\Apps\Antigravity"
.\runtime\node.exe .\bundle.js status --install-dir "D:\Apps\Antigravity"
.\uninstall.bat --install-dir "D:\Apps\Antigravity"
```

GitHub 自动生成的源码 ZIP 需使用本机的 Node.js 22 或更高版本。源码和发行包使用同一个 `bundle.js` 安装入口。原有的 Python 工具 `install.py` 仍提供单独管理额度插件的命令，供 v0.1.0 用户使用。

## 来源与许可

本项目是社区维护的 Antigravity 定制工具，采用 MIT 许可。额度按钮沿用 LaMonsters 的悬停交互，额度读取与展示基于 jiannuoc 的 Sidebar Usage。[本项目许可证](./LICENSE) · [额度组件上游](https://github.com/jiannuoc/antigravity-sidebar-usage/tree/7b21510af7a38ccecd3c95b5c21272a8df2e5c78)

简体中文词典、界面翻译引擎和原生菜单翻译来自 qqxpee 的 antigravity2-cn，整合版固定使用提交 `ae290fc`。发行包中的 Node.js 来自官方 Windows x64 发行版，随包包含完整许可声明。[汉化上游源码](https://github.com/qqxpee/antigravity2-cn/tree/ae290fc0b040f86a1fe154e6f66dbbf85d1da510) · [汉化组件许可证](./localization/LICENSE) · [Node.js](https://nodejs.org/)
