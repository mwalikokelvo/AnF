"""Inspect only our disposable CI AnF host's real embedded child, never user windows."""
import ctypes
from ctypes import wintypes
import json
import os
import sys
import time

assert os.name == 'nt'
assert os.environ.get('GITHUB_ACTIONS') == 'true'
assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
host_pid = int(os.environ['ANF_QA_HOST_PID'])
expected = sys.argv[1]
assert expected in ('visible', 'hidden')
user = ctypes.WinDLL('user32', use_last_error=True)
callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
user.EnumChildWindows.argtypes = [wintypes.HWND, callback_type, wintypes.LPARAM]
user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user.GetParent.argtypes = [wintypes.HWND]
user.GetParent.restype = wintypes.HWND
user.IsWindowVisible.argtypes = [wintypes.HWND]
user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]

def pid(hwnd):
    value = wintypes.DWORD()
    user.GetWindowThreadProcessId(hwnd, ctypes.byref(value))
    return value.value

def inspect():
    found = []
    @callback_type
    def child(hwnd, _):
        title = ctypes.create_unicode_buffer(100)
        user.GetWindowTextW(hwnd, title, len(title))
        if title.value != 'AnF Music Hub':
            return True
        parent = user.GetParent(hwnd)
        if not parent or pid(parent) != host_pid:
            return True
        rect, client, origin = wintypes.RECT(), wintypes.RECT(), wintypes.POINT()
        assert user.GetWindowRect(hwnd, ctypes.byref(rect))
        assert user.GetClientRect(parent, ctypes.byref(client))
        assert user.ClientToScreen(parent, ctypes.byref(origin))
        found.append({'hostPid': host_pid, 'childPid': pid(hwnd),
                      'visible': bool(user.IsWindowVisible(hwnd)),
                      'left': rect.left-origin.x, 'top': rect.top-origin.y,
                      'width': rect.right-rect.left, 'height': rect.bottom-rect.top,
                      'clientWidth': client.right-client.left, 'clientHeight': client.bottom-client.top})
        return True
    @callback_type
    def top(hwnd, _):
        if pid(hwnd) == host_pid:
            user.EnumChildWindows(hwnd, child, 0)
        return True
    user.EnumWindows(top, 0)
    assert len(found) <= 1, 'More than one embedded child owned by this QA host'
    return found[0] if found else None

deadline = time.monotonic()+5
state = None
while time.monotonic() < deadline:
    state = inspect()
    if state and state['visible'] == (expected == 'visible'):
        break
    time.sleep(.05)
assert state and state['visible'] == (expected == 'visible'), json.dumps(state)
assert state['childPid'] != host_pid, 'Expected separate real Flutter process'
print(json.dumps(state))
