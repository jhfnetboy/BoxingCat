# 构建与发布

## 概述

Nezha 的 CI/CD 基于 GitHub Actions，实现了**多平台构建**（Windows x86_64/ARM64、macOS x86_64/ARM64、Linux x86_64）和**自动发布**。

## 一、整体流水线

```
Git Tag Push (vX.Y.Z)
  │
  ├─ verify-version ──────────────────────────────────────┐
  │   检查 tag 与 package.json / tauri.conf.json /        │
  │   Cargo.toml 版本一致性                                │
  │                                                       │
  └─ build (matrix, 5 jobs) ──────────────────────────────┤
      ├─ Windows x86_64  (windows-latest)                  │
      ├─ Windows ARM64   (windows-11-arm)                  │
      ├─ macOS x86_64    (macos-15-intel)                  │
      ├─ macOS ARM64     (macos-15)                        │
      └─ Linux x86_64    (ubuntu-22.04)                    │
            │                                              │
            └─ Upload artifacts ───────────────────────────┤
                                                           │
  └─ release ─────────────────────────────────────────────┘
      下载所有 artifacts → 创建 GitHub Release
```

## 二、版本一致性校验

```yaml
verify-version:
  steps:
    - name: Check tag matches package.json / Cargo.toml / tauri.conf.json
      run: |
        TAG="${GITHUB_REF_NAME#v}"
        PKG=$(jq -r .version package.json)
        TAURI=$(jq -r .version src-tauri/tauri.conf.json)
        CARGO=$(awk -F\" '/^version[[:space:]]*=/ {print $2; exit}' src-tauri/Cargo.toml)
        if [ "$TAG" != "$PKG" ] || [ "$TAG" != "$TAURI" ] || [ "$TAG" != "$CARGO" ]; then
          echo "::error::Version mismatch"
          exit 1
        fi
```

这确保了 `package.json`、`tauri.conf.json`、`Cargo.toml` 三个文件中的版本号始终一致。

## 三、多平台构建矩阵

```yaml
strategy:
  fail-fast: false  # 单平台失败不影响其他平台
  matrix:
    include:
      - name: Windows x86_64
        runner: windows-latest
        target: x86_64-pc-windows-msvc
        bundle_args: --bundles nsis,msi
      - name: Windows ARM64
        runner: windows-11-arm
        target: aarch64-pc-windows-msvc
        bundle_args: --bundles nsis,msi
      - name: macOS x86_64
        runner: macos-15-intel
        target: x86_64-apple-darwin
        bundle_args: --bundles dmg
      - name: macOS ARM64
        runner: macos-15
        target: aarch64-apple-darwin
        bundle_args: --bundles dmg
      - name: Linux x86_64
        runner: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
        bundle_args: --bundles deb,rpm
```

### 各平台产物

| 平台 | 打包格式 | 产物 |
|------|----------|------|
| Windows x86_64 | NSIS + MSI | `.exe` 安装包, `.msi` 安装包 |
| Windows ARM64 | NSIS + MSI | `.exe` 安装包, `.msi` 安装包 |
| macOS x86_64 | DMG | `.dmg` 磁盘映像 |
| macOS ARM64 | DMG | `.dmg` 磁盘映像 |
| Linux x86_64 | DEB + RPM | `.deb` 包, `.rpm` 包 |

## 四、构建步骤详解

```yaml
steps:
  # 1. 系统依赖（仅 Linux 需要 WebKit）
  - name: Install Linux system dependencies
    if: runner.os == 'Linux'
    run: |
      sudo apt-get install -y \
        libwebkit2gtk-4.1-dev libgtk-3-dev \
        libayatana-appindicator3-dev librsvg2-dev \
        libsoup-3.0-dev libjavascriptcoregtk-4.1-dev

  # 2. 前端工具链
  - uses: pnpm/action-setup@v4
    with: { version: 9 }
  - uses: actions/setup-node@v4
    with: { node-version: 20, cache: pnpm }

  # 3. Rust 工具链
  - uses: dtolnay/rust-toolchain@stable
    with: { targets: ${{ matrix.target }} }

  # 4. Rust 依赖缓存
  - uses: swatinem/rust-cache@v2
    with:
      workspaces: ./src-tauri -> target
      key: ${{ matrix.target }}

  # 5. 前端依赖
  - run: pnpm install --frozen-lockfile --ignore-scripts

  # 6. Tauri build（同时编译 Rust + 打包）
  - run: pnpm tauri build --target ${{ matrix.target }} ${{ matrix.bundle_args }}
```

### 关键设计点

1. **`--frozen-lockfile`**：CI 中严格使用锁定版本，防止依赖漂移
2. **`--ignore-scripts`**：跳过 postinstall 脚本（安全 + 加速）
3. **`fail-fast: false`**：单平台构建失败不阻止其他平台
4. **`rust-cache`**：按 target 缓存，避免跨平台 cache 膨胀
5. **`kill_on_drop(true)`**：超时的 git 子进程在 Future drop 时被自动 kill

## 五、CI 质量检查

```yaml
checks:  # 每次 push + PR 触发
  steps:
    - run: cargo install cargo-audit --version 0.22.1 --locked
    - run: cargo audit                    # Rust 依赖安全审计
    - run: pnpm lint                      # ESLint
    - run: pnpm test                      # Vitest
    - run: pnpm build                     # Web 构建（验证可构建性）
```

## 六、前端构建配置

### vite.config.ts

```typescript
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,  // 不遮挡 Rust 编译错误
  server: {
    port: 1420,
    strictPort: true,  // 端口占用时直接报错
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },  // 忽略 Rust 源码变更
  },
}));
```

### Tauri dev flow

```
pnpm tauri dev
  ├─ beforeDevCommand: "pnpm dev" → Vite 启动 HMR 服务器 (1420)
  ├─ Rust 编译 → 启动 Tauri 窗口 → 加载 http://localhost:1420
  └─ 前端修改 → HMR 热更新；Rust 修改 → 重新编译 + 窗口重启
```

### Tauri build flow

```
pnpm tauri build
  ├─ beforeBuildCommand: "pnpm build" → tsc 类型检查 + vite build
  ├─ frontendDist: "../dist" → Tauri 内嵌 dist/ 产物
  ├─ Rust release 编译 → 链接 → 二进制 + 资源
  └─ 打包（NSIS/DMG/DEB/RPM）
```

## 七、发布流程

```yaml
release:
  needs: build
  permissions:
    contents: write  # 仅此 job 有写入权限（最小权限原则）
  steps:
    - uses: actions/download-artifact@v4
      with:
        path: release-artifacts
        merge-multiple: true   # 5 个平台的产物合并到一个目录
    - uses: softprops/action-gh-release@v2
      with:
        generate_release_notes: true
        files: release-artifacts/**/*
```

### 发布步骤

1. `git tag v0.4.2` → `git push --tags`
2. GitHub Actions 触发构建流水线
3. 5 个平台并行构建（约 15-25 分钟）
4. 所有平台完成后，创建 GitHub Release 并上传所有产物
5. 自动生成 Release Notes（基于 commits）

## 八、Tauri 配置要点

```json
{
  "productName": "NeZha",
  "identifier": "com.hanshutx.nezha",
  "app": {
    "windows": [{
      "title": "Nezha",
      "width": 1100, "height": 720,
      "minWidth": 900, "minHeight": 580,
      "acceptFirstMouse": true  // macOS: 接受首次点击
    }],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; ..."
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico", "icons/icon.icns"]
  }
}
```

### 安全策略

- **CSP**：`default-src 'self'`，仅允许同源资源
- **最小权限**：CI jobs 中 `contents: read` 为默认，仅 release job 有 `write`
- **并发控制**：`concurrency: group: release-${{ github.ref }}, cancel-in-progress: true`——同一 tag 的重复构建自动取消旧的
