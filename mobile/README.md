# Frontier Hub 安卓壳

详细说明见仓库根目录 [README.md](../README.md) 的「安卓 APK 怎么用」。

```powershell
cd mobile
npm install
npm run build
npx cap sync android
npx cap open android   # 或 cd android && .\gradlew.bat assembleRelease
```

编译请使用 **JDK 21**。同步仅用户下拉刷新触发；翻译需打开文章后手动点「翻译成中文」。
