# -*- coding: utf-8 -*-
"""本地学习服务器：托管网页版 + 收每日学习报告 + 提供 AI 安排计划。

双击项目根目录的「启动学习.bat」即可：启动后自动用 Chrome 打开
http://127.0.0.1:8901/

接口：
  GET  /api/plan    读取 webapp/data/ai_plan.json（AI 每轮写好的安排，可为空）
  POST /api/report  追加保存当日学习报告到 webapp/data/reports/日期.json
  GET  /api/state   读取唯一进度账本 webapp/data/state.json（没有则 404）
  POST /api/state   保存唯一进度账本（整份覆盖）
"""
import json
import os
import subprocess
import threading
import webbrowser
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
REPORTS = os.path.join(ROOT, 'data', 'reports')
PLAN = os.path.join(ROOT, 'data', 'ai_plan.json')
STATE = os.path.join(ROOT, 'data', 'state.json')
PORT = 8901


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')   # 本地工具：永远拿最新文件
        super().end_headers()

    def log_message(self, *args):  # 静默访问日志
        pass

    def _send(self, code, body: bytes):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/plan':
            if os.path.exists(PLAN):
                with open(PLAN, 'rb') as f:
                    self._send(200, f.read())
            else:
                self._send(200, b'{}')
            return
        if path == '/api/state':
            if os.path.exists(STATE):
                with open(STATE, 'rb') as f:
                    self._send(200, f.read())
            else:
                self._send(404, b'{"error":"no state"}')
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        if path not in ('/api/report', '/api/state'):
            self._send(404, b'{"error":"not found"}')
            return
        try:
            n = int(self.headers.get('Content-Length', 0) or 0)
            data = self.rfile.read(n) if n else b'{}'
        except Exception:
            self._send(400, b'{"error":"bad request"}')
            return
        if path == '/api/state':
            try:
                data_obj = json.loads(data.decode('utf-8'))   # 只验合法性
            except Exception:
                self._send(400, b'{"error":"bad json"}')
                return
            if n > 20 * 1024 * 1024:
                self._send(413, b'{"error":"too large"}')
                return
            # rev 强制校验：旧版本页面（无 rev）或旧快照（rev 更小）一律拒绝，
            # 防止陈旧内存覆盖新进度（客户端 rev 更大才会被接受）
            stored_rev = 0
            if os.path.exists(STATE):
                try:
                    with open(STATE, encoding='utf-8') as f:
                        stored_rev = int(json.load(f).get('rev', 0) or 0)
                except Exception:
                    stored_rev = 0
            if int(data_obj.get('rev', 0) or 0) < stored_rev:
                self._send(409, b'{"error":"stale rev"}')
                return
            with open(STATE, 'wb') as f:
                f.write(data)
            self._send(200, b'{"ok":true}')
            return
        try:
            data = json.loads(data.decode('utf-8')) if data else {}
        except Exception:
            self._send(400, b'{"error":"bad json"}')
            return
        os.makedirs(REPORTS, exist_ok=True)
        day = data.get('date') or date.today().isoformat()
        path = os.path.join(REPORTS, f'{day}.json')
        merged = []
        if os.path.exists(path):
            try:
                with open(path, encoding='utf-8') as f:
                    old = json.load(f)
                merged = old if isinstance(old, list) else [old]
            except Exception:
                merged = []
        merged.append(data)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(merged, f, ensure_ascii=False, indent=1)
        self._send(200, b'{"ok":true}')


def open_browser(url):
    """优先用 Chrome 打开，装了 Chrome 就用它；否则退回默认浏览器。"""
    try:
        subprocess.run(['cmd', '/c', 'start', 'chrome', url],
                       check=False, timeout=6,
                       creationflags=subprocess.CREATE_NO_WINDOW)
        return
    except Exception:
        pass
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()


def main():
    url = f'http://127.0.0.1:{PORT}/'
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print('=' * 46)
    print('  学习服务已启动')
    print(f'  地址: {url}')
    print('  关闭本窗口即停止服务')
    print('=' * 46)
    threading.Timer(0.8, lambda: open_browser(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
