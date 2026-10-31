"""Exercise the actual embedded Windows executable under a disposable host window.

Pass the generated runner/Release directory. No AnF vault or conversation files
are opened. A fresh Spotube engine may still require provider setup in its UI.
"""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

assert os.name == 'nt', 'Windows is required'
release = Path(sys.argv[1]).resolve()
user = ctypes.WinDLL('user32', use_last_error=True)
user.SetProcessDpiAwarenessContext.argtypes=[ctypes.c_void_p]
user.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # per-monitor v2, like AnF
user.CreateWindowExW.argtypes = [wintypes.DWORD,wintypes.LPCWSTR,wintypes.LPCWSTR,wintypes.DWORD,
    ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,wintypes.HWND,wintypes.HMENU,wintypes.HINSTANCE,ctypes.c_void_p]
user.CreateWindowExW.restype = wintypes.HWND
user.GetWindow.argtypes = [wintypes.HWND,wintypes.UINT]
user.GetWindow.restype = wintypes.HWND
user.GetParent.argtypes = [wintypes.HWND]
user.GetParent.restype = wintypes.HWND
user.IsWindowVisible.argtypes = [wintypes.HWND]
user.GetWindowRect.argtypes = [wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
user.GetClientRect.argtypes = [wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
user.DestroyWindow.argtypes = [wintypes.HWND]
user.GetWindowTextW.argtypes = [wintypes.HWND,wintypes.LPWSTR,ctypes.c_int]
parent = user.CreateWindowExW(0,'STATIC','AnF embedded music smoke test',0x10CF0000,
    80,80,940,760,None,None,None,None)
assert parent, ctypes.WinError(ctypes.get_last_error())
original_parent_rect=wintypes.RECT();user.GetWindowRect(parent,ctypes.byref(original_parent_rect))
child = None
errors = []
lines = queue.Queue()
log_lengths = []
done = threading.Event()

def exercise():
    global child
    try:
        env = {**os.environ,'ANF_PARENT_HWND':str(parent),'ANF_PARENT_PID':str(os.getpid())}
        child = subprocess.Popen([str(release/'spotube.exe')],cwd=release,env=env,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
            creationflags=0x08000000,text=True,encoding='utf-8',errors='replace',bufsize=1)
        def collect():
            for line in child.stdout:
                if line.startswith('ANF_REPLY '): lines.put(line.strip())
                else: log_lengths.append(len(line))
        threading.Thread(target=collect,daemon=True).start()
        def send(text): child.stdin.write(text+'\n'); child.stdin.flush()
        def reply(request):
            deadline=time.monotonic()+60
            while time.monotonic()<deadline:
                if child.poll() is not None: raise AssertionError(f'Spotube exited: {child.returncode}')
                try: line=lines.get(timeout=.3)
                except queue.Empty: continue
                if line.startswith(f'ANF_REPLY {request} '): return line
            raise AssertionError(f'No native acknowledgement for request {request}')
        send('SHOW 12 14 860 640')
        send('CONTROL 1 status')
        status=reply(1)
        assert status.startswith('ANF_REPLY 1 OK '),status
        state=json.loads(status.split(' ',3)[3])
        assert isinstance(state['hasTrack'],bool) and isinstance(state['playing'],bool)
        title=ctypes.create_unicode_buffer(256);user.GetWindowTextW(parent,title,256)
        assert title.value=='AnF embedded music smoke test','Spotube changed the host window title'
        parent_rect=wintypes.RECT();user.GetWindowRect(parent,ctypes.byref(parent_rect))
        assert bytes(parent_rect)==bytes(original_parent_rect),'Spotube moved or resized its host'
        native=user.GetWindow(parent,5)  # GW_CHILD
        assert native and user.GetParent(native)==parent,'Flutter did not attach to the host'
        assert user.IsWindowVisible(native),'Embedded child is not visible'
        rect=wintypes.RECT();assert user.GetWindowRect(native,ctypes.byref(rect))
        assert rect.right-rect.left==860 and rect.bottom-rect.top==640,'Wrong native child bounds'
        view=user.GetWindow(native,5)
        view_rect=wintypes.RECT();user.GetWindowRect(view,ctypes.byref(view_rect))
        assert bytes(view_rect)==bytes(rect),'Flutter surface escaped its embedded wrapper'
        send('CONTROL 2 pause')
        paused=reply(2)
        assert paused.startswith('ANF_REPLY 2 OK '),paused
        assert not json.loads(paused.split(' ',3)[3])['playing']
        send('HIDE')
        deadline=time.monotonic()+5
        while user.IsWindowVisible(native) and time.monotonic()<deadline: time.sleep(.05)
        assert not user.IsWindowVisible(native),'HIDE left the native child visible'
        assert child.poll() is None,'Hiding music terminated the retained engine'
        send('SHOW 18 22 800 600')
        send('CONTROL 3 status');assert reply(3).startswith('ANF_REPLY 3 OK ')
        assert user.IsWindowVisible(native),'Hidden engine could not reopen'
        if len(sys.argv)>2:
            from PIL import ImageGrab
            time.sleep(4)
            assert user.GetWindowRect(native,ctypes.byref(rect))
            capture=Path(sys.argv[2]).resolve();capture.parent.mkdir(parents=True,exist_ok=True)
            ImageGrab.grab(bbox=(rect.left,rect.top,rect.right,rect.bottom)).save(capture)
            print('Native window screenshot saved:',capture,flush=True)
        time.sleep(15)
        send('CONTROL 4 status');assert reply(4).startswith('ANF_REPLY 4 OK ')
        for request_id,theme in [(5,'dark'),(6,'light'),(7,'system')]:
            send(f'CONTROL {request_id} {theme}')
            assert reply(request_id).startswith(f'ANF_REPLY {request_id} OK '),'Theme command was not forwarded'
        send('CONTROL 8 retry');assert reply(8).startswith(('ANF_REPLY 8 OK ','ANF_REPLY 8 ERROR'))
        send('CONTROL 9 unsupported');assert reply(9).startswith('ANF_REPLY 9 ERROR'),'Unknown commands must fail without timing out'
        print('Largest non-protocol output line:',max(log_lengths,default=0),flush=True)
        print('PASS: actual Flutter startup, parent attachment, exact bounds, playback status, pause acknowledgement, hide/retain/reopen.',flush=True)
        print('Streaming/provider login is a separate interactive check.',flush=True)
    except BaseException as error: errors.append(error)
    finally: done.set()

try:
    threading.Thread(target=exercise,daemon=True).start()
    message=wintypes.MSG()
    while not done.is_set():
        while user.PeekMessageW(ctypes.byref(message),None,0,0,1):
            user.TranslateMessage(ctypes.byref(message));user.DispatchMessageW(ctypes.byref(message))
        time.sleep(.01)
    if errors: raise errors[0]
finally:
    if child:
        if child.stdin and not child.stdin.closed: child.stdin.close()
        try: child.wait(timeout=10)
        except subprocess.TimeoutExpired: child.terminate();child.wait(timeout=10)
    user.DestroyWindow(parent)
