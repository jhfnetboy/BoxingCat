# Git 集成

## 概述

Nezha 在 Rust 侧实现了完整的 Git 操作子系统，通过直接调用 `git` CLI（而非 libgit2）实现状态查看、差异对比、暂存/提交、分支管理、推送/拉取，以及**基于 worktree 的任务隔离**。

## 一、架构设计

### 为什么用 CLI 而非 libgit2

- **完整性**：`git` CLI 支持所有操作，libgit2 对某些操作（如 worktree）支持不完整
- **兼容性**：与用户本地 git 配置（hooks、aliases、 credential helpers）自然兼容
- **可维护性**：CLI 接口稳定，不用跟随 libgit2 API 变更

### 核心模式

```rust
// 同步 git 命令（简单操作）
fn run_git<S: AsRef<OsStr>>(project_path: &str, args: &[S]) -> Result<Output, String> {
    validate_project_path(project_path)?;
    Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|e| e.to_string())
}

// 带超时的异步 git 命令（可能长时间运行的操作）
async fn run_git_with_timeout(
    project_path: String,
    args: Vec<String>,
    timeout: Duration,
) -> Result<Output, String> {
    let mut child = tokio::process::Command::new("git")
        .args(&args)
        .current_dir(&project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)  // 超时杀进程
        .spawn()?;

    let status = tokio::time::timeout(timeout, child.wait()).await
        .map_err(|_| format!("Git 命令执行超时（{}秒）", timeout.as_secs()))?;

    // 并行读取 stdout/stderr
    let (stdout, stderr) = tokio::join!(stdout_task, stderr_task);
    Ok(Output { status, stdout, stderr })
}
```

## 二、路径安全

### 三层防护

```rust
// 第一层：项目路径必须是绝对路径
fn validate_project_path(project_path: &str) -> Result<(), String> {
    let path = Path::new(project_path);
    if !path.is_absolute() {
        return Err("Project path must be absolute".into());
    }
    let canonical = path.canonicalize()?;
    // ...
}

// 第二层：相对文件路径不能包含目录遍历
fn validate_git_relative_path(relative_path: &str) -> Result<(), String> {
    for component in Path::new(relative_path).components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("File path must stay inside the git worktree".into());
            }
            _ => {}
        }
    }
    Ok(())
}

// 第三层：操作前验证 worktree root 包含项目路径
fn git_worktree_root(project_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(run_git(project_path, &["rev-parse", "--show-toplevel"])?)
        .canonicalize()?;
    let project = Path::new(project_path).canonicalize()?;
    if !project.starts_with(&root) {
        return Err("Git worktree root does not contain project path".into());
    }
    Ok(root)
}
```

### 受保护路径

```rust
const PROTECTED_FIRST_SEGMENTS: &[&str] = &[".git", ".nezha"];

fn is_protected_project_relative_path(relative_path: &str) -> bool {
    // 禁止对 .git/ 和 .nezha/ 下的文件操作
    // .gitignore → 允许（非 .git/ 目录本身）
    // src/git.rs → 允许
    // .git/index → 拒绝
}
```

## 三、Git 状态解析（Porcelain Z Format）

```rust
fn parse_porcelain_z_status(stdout: &[u8]) -> Vec<GitFileChange> {
    let mut changes = Vec::new();
    let mut entries = stdout.split(|byte| *byte == 0)
        .filter(|entry| !entry.is_empty());

    while let Some(entry) = entries.next() {
        let x = entry[0] as char;  // 暂存区状态
        let y = entry[1] as char;  // 工作区状态
        let display_path = String::from_utf8_lossy(&entry[3..]).into_owned();

        // 处理重命名（R）和复制（C）：path 后面跟着原路径
        if x == 'R' || x == 'C' { let _ = entries.next(); }

        if x == '?' && y == '?' {
            changes.push(GitFileChange { path: display_path, status: "?", staged: false });
        } else {
            if x != ' ' && x != '?' {
                changes.push(GitFileChange { path: display_path.clone(), status: x, staged: true });
            }
            if y != ' ' && y != '?' {
                changes.push(GitFileChange { path: display_path, status: y, staged: false });
            }
        }
    }
    changes
}
```

使用 `-z` 标志以 NUL 字节分隔，正确处理文件名中的空格和特殊字符。

## 四、文件丢弃策略

```rust
#[tauri::command]
pub async fn git_discard_file(
    project_path: String, file_path: String, untracked: bool
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if untracked {
            // 未跟踪文件 → 移入系统回收站（可恢复）
            trash::delete(&target)?;
        } else {
            // 已跟踪文件 → git restore 重置到索引状态
            // 保留已暂存的一半（MM 文件不会丢失 staged 部分）
            run_git_check(&worktree_root, &["restore", "--", &file_path])?;
        }
    })
    .await?
}
```

**Discard All** 的正确实现：

```rust
pub async fn git_discard_all(project_path: String) -> Result<(), String> {
    // 1. 重置所有已跟踪文件（staged + worktree）回 HEAD
    run_git_check(&root, &["restore", "--source=HEAD", "--staged", "--worktree", "."])?;

    // 2. 遍历未跟踪文件，跳过受保护路径，逐一移到回收站
    for rel in list_untracked_files(&root)? {
        if is_protected_worktree_relative_path(&root, &project_path, &rel) { continue; }
        trash::delete(&target)?;
    }
}
```

## 五、提交信息 AI 生成

```rust
pub async fn generate_commit_message(project_path: String) -> Result<String, String> {
    // 1. 获取暂存区 diff，超过 50KB 截断
    let diff = run_git(&project_path, &["diff", "--staged"])?;
    let diff = if diff.len() > 50_000 {
        format!("{}...(diff truncated)", &diff[..50_000])
    } else { diff };

    // 2. 读取项目配置中的 commit_prompt 模板
    let config = read_project_config(project_path.clone())?;
    let commit_prompt = config.git.commit_prompt;
    let timeout_secs = config.git.commit_message_timeout_secs.clamp(1, 120);

    // 3. 用 codex exec 模式（headless）生成提交信息
    let full_prompt = format!(
        "{}\n\nGit diff:\n```diff\n{}\n```\n\nOutput only the commit message, nothing else.",
        commit_prompt, diff
    );

    // 4. 带超时执行
    let output = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        tokio::task::spawn_blocking(move || {
            run_agent_commit_message_command(&agent, &project_path, &full_prompt)
        }),
    ).await??;
}
```

## 六、Worktree 任务隔离

Nezha 为每个任务提供**可选**的独立 Git worktree：

```rust
#[tauri::command]
pub async fn create_task_worktree(
    project_path: String,
    task_id: String,
    base_branch: String,
) -> Result<WorktreeCreated, String> {
    tokio::task::spawn_blocking(move || {
        let worktrees_dir = Path::new(&project_path).join(".nezha").join("worktrees");
        let worktree_path = worktrees_dir.join(&task_id);
        let branch = format!("nezha/task-{}", &task_id[task_id.len()-6..]);

        // git worktree add <path> -b <branch> <base>
        run_git(&project_path,
            &["worktree", "add", &wt_path_str, "-b", &branch, &base_branch]
        )?;

        Ok(WorkflowCreated { worktree_path, worktree_branch: branch, base_branch })
    }).await?
}
```

### 合并策略

```rust
pub async fn merge_task_worktree(...) -> Result<String, String> {
    // 0. worktree 自身有未提交修改 → 拒绝合并
    let wt_status = run_git(&worktree_path, &["status", "--porcelain"])?;
    if !wt_status.stdout.is_empty() {
        return Err("Worktree has uncommitted changes...");
    }

    // 1. 主仓 HEAD == base_branch → 直接 merge --no-ff
    if original_branch == base_branch {
        run_git(&project_path, &["merge", "--no-ff", &branch])?;
    } else {
        // 2. 主仓不在 base：git fetch . <src>:<dst> ff 更新，不动主仓 HEAD
        run_git(&project_path, &["fetch", ".", &format!("{}:{}", branch, base_branch)])?;
    }
}
```

### Worktree Diff 统计

用 merge-base 而非 base_branch，避免把主仓 base 推进后别人的提交算到本任务头上：

```rust
pub async fn worktree_diff_stats(...) -> Result<WorktreeDiffStats, String> {
    // 1. merge-base 而非 base_branch 本身
    let merge_base = run_git(&worktree_path, &["merge-base", &base_branch, "HEAD"])?;

    // 2. 已跟踪改动：--numstat 累加
    let num_out = run_git(&worktree_path, &["diff", "--numstat", &merge_base])?;
    accumulate_numstat(&num_out.stdout, &mut additions, &mut deletions);

    // 3. 未跟踪文件：逐一 --no-index 与空文件比对
    for rel in list_untracked_files(&worktree_path)? {
        let no_index = run_git(&worktree_path,
            &["diff", "--no-index", "--numstat", &empty_path, &abs_str])?;
        accumulate_numstat(&no_index.stdout, &mut additions, &mut deletions);
    }
}
```

## 七、Git 命令完整列表

共 **22 个** Git 相关 Tauri 命令：

| 命令 | 用途 | 超时 |
|------|------|------|
| `git_status` | 获取文件变更状态（--porcelain=v1 -z） | 5s |
| `git_list_branches` | 列出所有分支 | 5s |
| `git_create_branch` | 创建分支 | - |
| `git_checkout_branch` | 切换分支（含远程跟踪） | - |
| `git_log` | 提交历史 | 10s |
| `git_commit_detail` | 单提交详细信息 | - |
| `git_show_diff` | 提交完整 diff | 10s |
| `git_show_file_diff` | 单文件历史 diff | - |
| `git_file_diff` | 工作区文件 diff | 10s |
| `git_stage` / `git_stage_files` / `git_stage_all` | 暂存 | 10s |
| `git_unstage` / `git_unstage_files` / `git_unstage_all` | 取消暂存 | 10s |
| `git_commit` | 提交 | - |
| `git_discard_file` / `git_discard_files` / `git_discard_all` | 丢弃修改 | - |
| `git_push` / `git_pull` | 推/拉 | - |
| `git_remote_counts` | ahead/behind 计数 | - |
| `generate_commit_message` | AI 生成提交信息 | 可配置 |
| `create_task_worktree` / `merge_task_worktree` / `remove_task_worktree` | Worktree 管理 | - |
| `worktree_diff_stats` | Worktree 差异统计 | - |
