# CTONEW
玩具，支持多轮对话、上下文记忆、输出思维链，
支持会话ID管理，自动删除对话。
多账号轮询，使用webui
使用Oai ChatCompetition 格式

### Deno Deploy部署
Fork本仓库，点个star

点击depley（使用dash.deno.com部署而非console.deno.com）

[![Deploy to Deno](https://deno.com/deploy.svg)](https://dash.deno.com/new_project)

选择你的GitHub仓库

设置入口文件为 `main.ts`




如需在正式版本中部署，请将deno.json替换为如下内容
（Deno在线部署忽略）
```
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv --watch main.ts",
    "start": "deno run --allow-net --allow-read --allow-write --allow-env --unstable-kv main.ts"
  },
  "imports": {
    "oak": "https://deno.land/x/oak@v12.6.1/mod.ts",
    "djwt": "https://deno.land/x/djwt@v3.0.1/mod.ts"
  },
  "compilerOptions": {
    "lib": ["deno.window", "deno.unstable"]
  }
}
```

### 环境变量

在 Deno Deploy 项目设置中添加环境变量：

- `ADMIN_KEY`: 管理后台密钥（**必填**，请使用强密码）

- `PORT`: 服务端口（默认 8000）

### 管理后台

1. 访问 `http://localhost:8000/admin/login` 登录
2. 输入管理密钥（默认: `your-secret-key-change-me`）
3. 密钥会保存在浏览器，下次自动登录

## 获取 Cookie

1. 访问 https://cto.new
2. 登录你的账号
3. 打开浏览器开发者工具（F12）
4. 找到 "Cookies" → "https://clerk.cto.new"
5. 复制 Cookie 值（格式：`_cfuvid=xxxxx`官方更改了ck格式，以实际为准）
如图所示，过滤`clerk.cto.new/v1/client/sessions`将cookie直接复制即可
![image](20251018180109.jpg)
7. 在管理后台添加 Cookie

## License

MIT
