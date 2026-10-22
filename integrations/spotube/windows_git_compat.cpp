#include <windows.h>
#include <shellapi.h>
#include <string>
#include <vector>

static std::wstring quote(const std::wstring& value) {
  std::wstring out=L"\""; size_t slashes=0;
  for(wchar_t ch:value) {
    if(ch==L'\\') {++slashes;continue;}
    if(ch==L'"')out.append(slashes*2+1,L'\\');else out.append(slashes,L'\\');
    slashes=0;out+=ch;
  }
  out.append(slashes*2,L'\\');out+=L'"';return out;
}
int wmain(int argc,wchar_t** argv) {
  wchar_t original[32768]{};
  const DWORD size=GetEnvironmentVariableW(L"ANF_BUILD_REAL_GIT",original,32768);
  if(!size || size>=32768)return 127;
  std::wstring command=quote(original);
  for(int index=1;index<argc;++index) {
    std::wstring argument=argv[index];
    // Dart 3.9 supplies backslashes here; Git's repository-identity check
    // compares the unnormalized argument to a forward-slash working path.
    if(argument.rfind(L"--git-dir=",0)==0)for(auto& ch:argument)if(ch==L'\\')ch=L'/';
    command+=L' ';command+=quote(argument);
  }
  STARTUPINFOW startup{};startup.cb=sizeof(startup);
  startup.dwFlags=STARTF_USESTDHANDLES;
  startup.hStdInput=GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput=GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError=GetStdHandle(STD_ERROR_HANDLE);
  PROCESS_INFORMATION process{};
  if(!CreateProcessW(original,command.data(),nullptr,nullptr,TRUE,0,nullptr,nullptr,&startup,&process))return 127;
  WaitForSingleObject(process.hProcess,INFINITE);
  DWORD result=1;GetExitCodeProcess(process.hProcess,&result);
  CloseHandle(process.hThread);CloseHandle(process.hProcess);return static_cast<int>(result);
}
