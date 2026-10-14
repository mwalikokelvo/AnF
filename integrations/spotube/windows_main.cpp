#include <flutter/dart_project.h>
#include <flutter/encodable_value.h>
#include <flutter/method_channel.h>
#include <flutter/method_result_functions.h>
#include <flutter/standard_method_codec.h>
#include <windows.h>
#include <memory>
#include <cstdint>
#include <cstdlib>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include "flutter_window.h"

namespace {
constexpr UINT kHostCommand = WM_APP + 17;
void Reply(const std::string& text) {
  const auto line = "ANF_REPLY " + text + "\n";
  DWORD written;
  WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
}
uint64_t EnvironmentNumber(const wchar_t* name) {
  wchar_t buffer[32]{};
  const DWORD length=GetEnvironmentVariableW(name,buffer,32);
  if(!length || length>=32)return 0;
  wchar_t* end=nullptr;
  const auto value=wcstoull(buffer,&end,10);
  return end && *end==0 ? value : 0;
}
}

// This binary only runs as a native child view owned by an AnF window.
int APIENTRY wWinMain(HINSTANCE, HINSTANCE, wchar_t*, int) {
  const auto parent=reinterpret_cast<HWND>(EnvironmentNumber(L"ANF_PARENT_HWND"));
  const auto parent_pid=static_cast<DWORD>(EnvironmentNumber(L"ANF_PARENT_PID"));
  DWORD owner=0;
  GetWindowThreadProcessId(parent,&owner);
  if(!IsWindow(parent) || !parent_pid || owner!=parent_pid)return EXIT_FAILURE;
  HANDLE parent_process=OpenProcess(SYNCHRONIZE,FALSE,parent_pid);
  if(!parent_process)return EXIT_FAILURE;
  std::thread([parent_process](){WaitForSingleObject(parent_process,INFINITE);CloseHandle(parent_process);ExitProcess(0);}).detach();
  CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
  flutter::DartProject project(L"data");
  FlutterWindow window(project);
  if(!window.CreateAndShow(L"AnF Music Hub",{0,0},{900,700}))return EXIT_FAILURE;
  const HWND child=window.GetHandle();
  SetWindowLongPtr(child,GWL_STYLE,WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS);
  SetWindowLongPtr(child,GWL_EXSTYLE,0);
  SetLastError(0);
  if(!SetParent(child,parent) && GetLastError()!=0)return EXIT_FAILURE;
  window.SetQuitOnClose(false);
  using Value=flutter::EncodableValue;
  flutter::MethodChannel<Value> channel(window.AnfEngine()->messenger(),"anf/spotube",&flutter::StandardMethodCodec::GetInstance());
  bool ready=false;
  std::vector<std::string> pauses;
  auto pause=[&channel](const std::string& id){
    channel.InvokeMethod("pause",nullptr,std::make_unique<flutter::MethodResultFunctions<Value>>(
      [id](const Value*){Reply(id+" OK");},
      [id](const std::string&,const std::string&,const Value*){Reply(id+" ERROR");},
      [id](){Reply(id+" ERROR");}));
  };
  channel.SetMethodCallHandler([&](const flutter::MethodCall<Value>& call,std::unique_ptr<flutter::MethodResult<Value>> result){
    if(call.method_name()=="ready"){
      ready=true;for(const auto& id:pauses)pause(id);pauses.clear();result->Success();
    }else if(call.method_name()=="close"){
      ShowWindow(child,SW_HIDE);Reply("CLOSED");result->Success();
    }else result->NotImplemented();
  });
  const DWORD ui_thread=GetCurrentThreadId();
  // Pipe input is bounded. All UI/Flutter calls run on the message-loop thread.
  std::thread([ui_thread](){
    std::string line;char byte;DWORD count;
    while(ReadFile(GetStdHandle(STD_INPUT_HANDLE),&byte,1,&count,nullptr) && count){
      if(byte=='\n'){
        auto command=new std::string(line);line.clear();
        if(!PostThreadMessage(ui_thread,kHostCommand,0,reinterpret_cast<LPARAM>(command)))delete command;
      }else if(line.size()<256)line.push_back(byte);else break;
    }
    PostThreadMessage(ui_thread,WM_QUIT,0,0);
  }).detach();
  MSG message;
  while(GetMessage(&message,nullptr,0,0)>0){
    if(message.message==kHostCommand){
      std::unique_ptr<std::string> text(reinterpret_cast<std::string*>(message.lParam));
      std::istringstream input(*text);std::string command;input>>command;
      if(command=="SHOW"){
        int x,y,width,height;if(input>>x>>y>>width>>height && width>0 && height>0 && width<=16384 && height<=16384 && x>=-16384 && x<=16384 && y>=-16384 && y<=16384){SetWindowPos(child,nullptr,x,y,width,height,SWP_NOZORDER|SWP_SHOWWINDOW|SWP_FRAMECHANGED);}
      }else if(command=="HIDE")ShowWindow(child,SW_HIDE);
      else if(command=="PAUSE"){
        std::string id;input>>id;
        if(!id.empty() && id.size()<=20 && id.find_first_not_of("0123456789")==std::string::npos){if(ready)pause(id);else if(pauses.size()<32)pauses.push_back(id);else Reply(id+" ERROR");}
      }
      continue;
    }
    TranslateMessage(&message);DispatchMessage(&message);
  }
  CoUninitialize();return EXIT_SUCCESS;
}
