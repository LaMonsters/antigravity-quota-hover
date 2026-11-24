# Antigravity Quota Hover

在 Antigravity 桌面版侧边栏底部查看模型剩余额度。左半边是原有的「设置」，右半边是圆形额度按钮。悬停右半边即可查看 Gemini、Claude 和 GPT 等模型分组的每周及 5 小时限额、剩余百分比和重置倒计时。移开鼠标即收起，按 Tab 聚焦按钮也可查看，Esc 收起。

## Windows 安装

已在 **Antigravity Desktop 2.34.0（Windows）** 实测。需要 Python 3.10 或更高版本。

1. [下载此版本的 ZIP](https://github.com/LaMonsters/antigravity-quota-hover/archive/refs/tags/v0.1.0.zip)，解压到任意文件夹。
2. 等待手头的任务结束，完全退出 Antigravity。
3. 双击解压目录中的 `install.bat`。看到成功提示后，重新打开 Antigravity。
4. 将鼠标移到「设置」右侧的圆形按钮上。面板读取当前登录账号的数据，显示的模型分组和时间窗口随账号变化。

## 卸载与更新

完全退出 Antigravity，双击 `uninstall.bat`，再打开客户端。客户端升级可能覆盖组件，可在确认新版本兼容后重新安装。

安装器在客户端资源包 `resources/app.asar` 中更新本组件的预加载脚本。首次安装会在同一目录保存备份 `app.asar.usage.bak`。已安装原版 Sidebar Usage 的用户可以直接安装本版，原卡片会被替换；卸载本版会移除额度组件。

## 自定义安装位置

默认查找 `%LOCALAPPDATA%\Programs\antigravity\resources\app.asar`。可在解压目录的 PowerShell 中指定实际路径。下例先查看状态，再演练，最后安装。

```powershell
$asar = 'D:\Apps\Antigravity\resources\app.asar'
py -3 install.py --asar $asar --action status
py -3 install.py --asar $asar --action install --dry-run
py -3 install.py --asar $asar --action install
```

## 来源与许可

本项目基于 jiannuoc 的 Antigravity Sidebar Usage，保留了其资源包安装逻辑和本地配额查询逻辑，重新设计了侧栏交互。社区项目，采用 MIT 许可。[上游源码](https://github.com/jiannuoc/antigravity-sidebar-usage/tree/7b21510af7a38ccecd3c95b5c21272a8df2e5c78) · [MIT 许可证](LICENSE)
