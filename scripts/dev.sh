#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev/logs"
EXECUTABLE="$ROOT/src-tauri/target/debug/meletia"
PORT=1437

usage() {
  cat <<'EOF'
Meletia 开发指令

在 meletia/ 根目录执行；工作区根目录需在动作前加 meletia。

用法:
  bash scripts/dev.sh start [meletia]    启动或复用桌面开发实例
  bash scripts/dev.sh stop [meletia]     停止本仓库的开发链路
  bash scripts/dev.sh restart [meletia]  停止后重新启动开发链路
  bash scripts/dev.sh status [meletia]   查看开发进程与 1437 端口
  bash scripts/dev.sh logs [dev|build]   查看最近 120 行日志，默认 dev
  bash scripts/dev.sh build             执行 npm run build，构建前端
  bash scripts/dev.sh list              列出服务及用途（别名 ls）
  bash scripts/dev.sh --help            显示帮助，支持 <动作> --help

工作区示例: bash scripts/dev.sh meletia start
本项目示例: bash scripts/dev.sh start
启动时自动加入 ~/.cargo/bin，开发日志保存在 .dev/logs/dev.log。
已有开发实例会直接复用。通过其他终端启动的实例可能没有此处日志。
build 不打包应用。打包使用 npm run tauri build -- --bundles app,dmg。
EOF
}

cli_error() {
  echo "[meletia] $*；使用 bash scripts/dev.sh --help 查看用法" >&2
  return 2
}

dev_pids() {
  local pid executable arguments
  while read -r pid executable arguments; do
    case "$executable" in
      node|*/node)
        [[ "$arguments" != "$ROOT/node_modules/.bin/tauri dev" ]] || echo "$pid"
        ;;
    esac
  done < <(ps -ww -axo pid=,command=)
}

app_pids() {
  local pid command directory
  while read -r pid command; do
    if [[ "$command" == "$EXECUTABLE" ]]; then
      echo "$pid"
    elif [[ "$command" == target/debug/meletia ]]; then
      directory="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
      [[ "$directory" != "$ROOT/src-tauri" ]] || echo "$pid"
    fi
  done < <(ps -ww -axo pid=,command=)
}

port_pids() {
  lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

is_descendant() {
  local pid="$1" ancestor="$2" parent
  while [[ -n "$pid" && "$pid" != 1 && "$pid" != 0 ]]; do
    [[ "$pid" != "$ancestor" ]] || return 0
    parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    [[ "$parent" != "$pid" ]] || return 1
    pid="$parent"
  done
  return 1
}

owned_by_dev() {
  local pid="$1" owner
  while read -r owner; do
    [[ -z "$owner" ]] || { if is_descendant "$pid" "$owner"; then return 0; fi; }
  done < <(dev_pids)
  return 1
}

check_port() {
  local pid
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    if ! owned_by_dev "$pid"; then
      echo "[meletia] 端口 $PORT 被其他进程占用 (pid=$pid)，请先检查。" >&2
      return 1
    fi
  done < <(port_pids)
}

status() {
  local roots apps ports
  roots="$(dev_pids)"
  apps="$(app_pids)"
  ports="$(port_pids)"
  echo "[meletia] dev: ${roots:-未运行}"
  echo "[meletia] 桌面进程: ${apps:-未运行}"
  echo "[meletia] 端口 $PORT: ${ports:-未监听}"
}

start() {
  local pid attempt packaged
  packaged="$(ps -ww -axo command= | awk '/\/Meletia\.app\/Contents\/MacOS\/[Mm]eletia$/')"
  if [[ -n "$packaged" ]]; then
    echo "[meletia] 打包版正在运行，请先退出再启动开发版。" >&2
    return 1
  fi
  check_port || return 1
  if [[ -n "$(dev_pids)" ]]; then
    echo "[meletia] 复用已有开发链路。"
    status
    return 0
  fi
  if [[ -n "$(app_pids)" ]]; then
    echo "[meletia] 发现未退出的开发窗口，请先退出该窗口。" >&2
    return 1
  fi
  [[ -d "$ROOT/node_modules" ]] || { echo "[meletia] 请先在本项目执行 npm install。" >&2; return 1; }
  mkdir -p "$LOG_DIR"
  nohup bash -c 'cd "$1"; export PATH="$HOME/.cargo/bin:$PATH"; exec npm run tauri dev' \
    _ "$ROOT" >>"$LOG_DIR/dev.log" 2>&1 < /dev/null &
  pid=$!
  echo "[meletia] 正在启动，日志: $LOG_DIR/dev.log"
  for ((attempt = 0; attempt < 120; attempt++)); do
    if [[ -n "$(app_pids)" && -n "$(port_pids)" ]]; then
      check_port || return 1
      status
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      tail -n 30 "$LOG_DIR/dev.log" >&2
      return 1
    fi
    sleep 0.5
  done
  echo "[meletia] 尚在编译，请用 status 和 logs 查看进度。" >&2
  return 1
}

process_tree() {
  local pid="$1" child command
  command="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"
  [[ -n "$command" ]] || return 0
  printf '%s %s\n' "$pid" "$command"
  while read -r child; do
    [[ -z "$child" ]] || process_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
}

stop() {
  local roots processes pid command current attempt
  check_port || return 1
  roots="$(dev_pids)"
  if [[ -z "$roots" ]]; then
    if [[ -n "$(app_pids)" ]]; then
      echo "[meletia] 开发窗口仍在运行，但父进程已退出，请先退出该窗口。" >&2
      return 1
    fi
    echo "[meletia] 当前未运行。"
    return 0
  fi
  processes="$(while read -r pid; do process_tree "$pid"; done <<< "$roots")"
  while read -r pid command; do
    current="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"
    if [[ -n "$current" && "$current" == "$command" ]]; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done <<< "$processes"
  for ((attempt = 0; attempt < 40; attempt++)); do
    if [[ -z "$(dev_pids)" && -z "$(app_pids)" && -z "$(port_pids)" ]]; then
      echo "[meletia] 已停止。"
      return 0
    fi
    sleep 0.25
  done
  echo "[meletia] 仍有进程未退出，请检查 status。" >&2
  return 1
}

logs() {
  local kind="${1:-dev}" file
  file="$LOG_DIR/$kind.log"
  if [[ -f "$file" ]]; then tail -n 120 "$file"
  else echo "[meletia] 暂无日志: $file"; fi
}

build() {
  mkdir -p "$LOG_DIR"
  if ! (cd "$ROOT" && npm run build) >"$LOG_DIR/build.log" 2>&1; then
    tail -n 60 "$LOG_DIR/build.log" >&2
    return 1
  fi
  echo "[meletia] 构建完成，日志: $LOG_DIR/build.log"
}

main() {
  local action="${1:-help}" arg
  for arg in "$@"; do
    case "$arg" in -h|--help) usage; return 0 ;; esac
  done
  shift || true
  case "$action" in
    help)
      [[ $# -le 1 ]] || { cli_error "help 最多接受一个动作"; return 2; }
      case "${1:-help}" in start|stop|restart|status|logs|build|list|ls|help) usage ;; *) cli_error "未知动作: $1" ;; esac
      ;;
    start|stop|restart|status)
      [[ $# -le 1 && "${1:-meletia}" == meletia ]] || { cli_error "$action 只接受可选目标 meletia"; return 2; }
      case "$action" in
        restart) stop && start ;;
        *) "$action" ;;
      esac
      ;;
    logs)
      [[ $# -le 1 ]] || { cli_error "logs 最多接受一个日志类型"; return 2; }
      case "${1:-dev}" in dev|build) logs "$@" ;; *) cli_error "日志类型应为 dev 或 build" ;; esac
      ;;
    build|list|ls)
      [[ $# -eq 0 ]] || { cli_error "$action 不接受目标参数"; return 2; }
      if [[ "$action" == build ]]; then build
      else printf '%-12s %s\n' SERVICE DESCRIPTION meletia '桌面词汇学习应用（Tauri + Vite，端口 1437）'; fi
      ;;
    *) cli_error "未知动作: $action" ;;
  esac
}

main "$@"
