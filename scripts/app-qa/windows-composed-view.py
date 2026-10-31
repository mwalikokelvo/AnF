"""Check pixels in an isolated AnF QA window, including its native Flutter child.

Unlike a CDP screenshot, PrintWindow includes native sibling windows and does
not accidentally capture another application when the QA window is occluded.
Usage: python windows-composed-view.py <QA-process-id> <output.png>
"""
import ctypes
from ctypes import wintypes
from pathlib import Path
import sys
from PIL import Image

user = ctypes.WinDLL('user32', use_last_error=True)
user.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user.SetForegroundWindow.argtypes = [wintypes.HWND]
user.IsWindowVisible.argtypes = [wintypes.HWND]
gdi = ctypes.WinDLL('gdi32',use_last_error=True)
user.GetWindowDC.argtypes=[wintypes.HWND];user.GetWindowDC.restype=wintypes.HDC
user.ReleaseDC.argtypes=[wintypes.HWND,wintypes.HDC]
user.PrintWindow.argtypes=[wintypes.HWND,wintypes.HDC,wintypes.UINT]
gdi.CreateCompatibleDC.argtypes=[wintypes.HDC];gdi.CreateCompatibleDC.restype=wintypes.HDC
gdi.CreateCompatibleBitmap.argtypes=[wintypes.HDC,ctypes.c_int,ctypes.c_int];gdi.CreateCompatibleBitmap.restype=wintypes.HBITMAP
gdi.SelectObject.argtypes=[wintypes.HDC,wintypes.HGDIOBJ];gdi.SelectObject.restype=wintypes.HGDIOBJ
gdi.DeleteObject.argtypes=[wintypes.HGDIOBJ];gdi.DeleteDC.argtypes=[wintypes.HDC]
class BitmapInfo(ctypes.Structure):
    _fields_=[('size',wintypes.DWORD),('width',wintypes.LONG),('height',wintypes.LONG),('planes',wintypes.WORD),('bits',wintypes.WORD),('compression',wintypes.DWORD),('imageSize',wintypes.DWORD),('x',wintypes.LONG),('y',wintypes.LONG),('used',wintypes.DWORD),('important',wintypes.DWORD)]
gdi.GetDIBits.argtypes=[wintypes.HDC,wintypes.HBITMAP,wintypes.UINT,wintypes.UINT,ctypes.c_void_p,ctypes.POINTER(BitmapInfo),wintypes.UINT]
pid = int(sys.argv[1])
output=Path(sys.argv[2])
output.unlink(missing_ok=True)
hosts, surfaces = [], []

def rectangle(window):
    rect = wintypes.RECT()
    assert user.GetWindowRect(window, ctypes.byref(rect))
    return rect.left, rect.top, rect.right, rect.bottom

def capture_window(window):
    left,top,right,bottom=rectangle(window);width,height=right-left,bottom-top
    dc=user.GetWindowDC(window);memory=gdi.CreateCompatibleDC(dc)
    bitmap=gdi.CreateCompatibleBitmap(dc,width,height);old=gdi.SelectObject(memory,bitmap)
    try:
        assert user.PrintWindow(window,memory,2),'PrintWindow could not capture the QA window'
        info=BitmapInfo();info.size=ctypes.sizeof(BitmapInfo);info.width=width;info.height=-height;info.planes=1;info.bits=32
        buffer=ctypes.create_string_buffer(width*height*4)
        assert gdi.GetDIBits(memory,bitmap,0,height,buffer,ctypes.byref(info),0)==height
        return Image.frombytes('RGB',(width,height),buffer.raw,'raw','BGRX')
    finally:
        gdi.SelectObject(memory,old);gdi.DeleteObject(bitmap);gdi.DeleteDC(memory);user.ReleaseDC(window,dc)

@callback
def find_host(window, _):
    owner = wintypes.DWORD()
    user.GetWindowThreadProcessId(window, ctypes.byref(owner))
    title = ctypes.create_unicode_buffer(256)
    user.GetWindowTextW(window, title, len(title))
    if owner.value == pid and title.value.startswith('Workspace'):
        hosts.append(window)
    return True

@callback
def find_surface(window, _):
    name = ctypes.create_unicode_buffer(256)
    user.GetClassNameW(window, name, len(name))
    if name.value == 'FLUTTER_RUNNER_WIN32_WINDOW' and user.IsWindowVisible(window):
        surfaces.append(window)
    return True

user.EnumWindows(find_host, 0)
assert len(hosts) == 1, 'QA workspace missing or its title was changed by Spotube'
host = hosts[0]
user.EnumChildWindows(host, find_surface, 0)
assert len(surfaces) == 1, 'One visible embedded native music surface is required'
host_rect, surface_rect = rectangle(host), rectangle(surfaces[0])
assert host_rect[0] <= surface_rect[0] < surface_rect[2] <= host_rect[2]
assert host_rect[1] <= surface_rect[1] < surface_rect[3] <= host_rect[3]
composed=capture_window(host)
pixels=composed.crop((surface_rect[0]-host_rect[0],surface_rect[1]-host_rect[1],surface_rect[2]-host_rect[0],surface_rect[3]-host_rect[1]))
colors = pixels.resize((100, 100)).getcolors(10001) or []
assert len(colors) > 50, 'Embedded Flutter is blank or covered by the WebView'
output.parent.mkdir(parents=True, exist_ok=True)
composed.save(output)
print('PASS: composed native music view renders inside AnF; host title and bounds retained.')
