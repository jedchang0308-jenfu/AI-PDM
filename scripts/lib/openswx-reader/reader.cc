// AI-PDM bounded adapter; the MIT OpenSWX library is unmodified.
#include <openswx/document.h>
#include <algorithm>
#include <cctype>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>
#if defined(__linux__) && defined(__x86_64__)
#include <cerrno>
#include <climits>
#include <cstdlib>
#include <cstddef>
#include <vector>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>
#endif
namespace {
bool Isolate() {
#if defined(__linux__) && defined(__x86_64__)
  // Fixed ABI. x32 syscalls are rejected as well as other architectures.
  if (syscall(SYS_close_range, 3U, UINT_MAX, 0U) != 0 || clearenv() != 0) return false;
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) return false;
  std::vector<sock_filter> filter = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(seccomp_data, nr)),
    BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM)
  };
  const int denied[] = { SYS_socket, SYS_socketpair, SYS_connect, SYS_bind, SYS_listen,
    SYS_accept, SYS_accept4, SYS_sendto, SYS_sendmsg, SYS_sendmmsg, SYS_recvfrom, SYS_recvmsg,
    SYS_recvmmsg, SYS_shutdown, SYS_getsockopt, SYS_setsockopt, SYS_getsockname, SYS_getpeername,
    SYS_io_uring_setup, SYS_io_uring_enter, SYS_io_uring_register, SYS_ptrace,
    SYS_process_vm_readv, SYS_process_vm_writev, SYS_fork, SYS_vfork, SYS_clone, SYS_clone3,
    SYS_execve, SYS_execveat, SYS_setsid, SYS_setpgid, SYS_unshare, SYS_setns, SYS_mount,
    SYS_umount2, SYS_bpf, SYS_keyctl, SYS_add_key, SYS_request_key, SYS_pidfd_getfd };
  for (int nr : denied) {
    filter.push_back(BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, static_cast<unsigned int>(nr), 0, 1));
    filter.push_back(BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM));
  }
  filter.push_back(BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW));
  const sock_fprog program = { static_cast<unsigned short>(filter.size()), filter.data() };
  return prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program) == 0;
#else
  return false;
#endif
}
bool IsolationSelfTest() {
#if defined(__linux__) && defined(__x86_64__)
  for (auto spec : {std::pair{AF_INET, SOCK_STREAM}, std::pair{AF_INET, SOCK_DGRAM}, std::pair{AF_UNIX, SOCK_STREAM}}) {
    errno = 0; if (socket(spec.first, spec.second, 0) != -1 || errno != EPERM) return false;
  }
  errno = 0; if (syscall(SYS_socket, AF_INET, SOCK_STREAM, 0) != -1 || errno != EPERM) return false;
  int pair[2]; errno = 0; if (socketpair(AF_UNIX, SOCK_STREAM, 0, pair) != -1 || errno != EPERM) return false;
  errno = 0; if (syscall(SYS_connect, -1, nullptr, 0) != -1 || errno != EPERM) return false;
  return true;
#else
  return false;
#endif
}
std::string Json(const std::string& value) {
  std::string out = "\"";
  constexpr char hex[] = "0123456789abcdef";
  for (unsigned char ch : value) {
    if (ch == '"' || ch == '\\') { out += '\\'; out += ch; }
    else if (ch < 32) { out += "\\u00"; out += hex[ch >> 4]; out += hex[ch & 15]; }
    else out += ch;
  }
  return out + '"';
}
void Properties(std::ostringstream& out, const std::map<std::string, std::string>& values) {
  out << '{'; bool first = true;
  for (const auto& [name, value] : values) {
    if (!first) out << ',';
    first = false; out << Json(name) << ':' << Json(value);
  }
  out << '}';
}
int Fail(const char* code, int exit_code) {
  std::cout << "{\"schemaVersion\":\"aipdm.openswx-public-api.v1\",\"status\":\"failed\",\"diagnostics\":["
            << Json(code) << "]}\n";
  return exit_code;
}
}
int main(int argc, char** argv) {
  if (!Isolate() || !IsolationSelfTest()) return Fail("PARSER_ISOLATION_UNAVAILABLE", 126);
  if (argc == 2 && std::string(argv[1]) == "--isolation-self-test") {
    std::cout << "{\"schemaVersion\":\"child_network_syscalls_denied.v1\",\"status\":\"verified\"}\n";
    return 0;
  }
  if (argc != 2) return Fail("input_argument_invalid", 2);
  try {
    const std::filesystem::path input(argv[1]);
    if (std::filesystem::is_symlink(input) || !std::filesystem::is_regular_file(input))
      return Fail("input_not_regular_file", 2);
    const auto bytes = std::filesystem::file_size(input);
    if (bytes == 0 || bytes > 256ULL * 1024 * 1024) return Fail("input_size_out_of_bounds", 2);
    auto extension = input.extension().string();
    std::transform(extension.begin(), extension.end(), extension.begin(),
                   [](unsigned char ch) { return std::tolower(ch); });
    if (extension != ".sldprt" && extension != ".sldasm" && extension != ".slddrw")
      return Fail("input_extension_unsupported", 2);
    auto result = openswx::SwxDocument::Open(input);
    if (!result.ok()) return Fail("library_open_rejected", 10);
    const auto& doc = result.value().doc();
    const char* type = doc.type == openswx::DocumentType::kPart ? "part"
        : doc.type == openswx::DocumentType::kAssembly ? "assembly" : "drawing";
    std::ostringstream out;
    out << "{\"schemaVersion\":\"aipdm.openswx-public-api.v1\",\"status\":\"opened\",\"documentType\":"
        << Json(type) << ",\"version\":" << doc.version << ",\"globalProperties\":";
    Properties(out, doc.global_properties);
    out << ",\"configurations\":[";
    bool first = true;
    for (const auto& config : doc.configurations) {
      if (!first) out << ',';
      first = false;
      out << "{\"name\":" << Json(config.name) << ",\"index\":" << config.index << ",\"effectiveProperties\":";
      Properties(out, config.properties); out << '}';
    }
    out << "],\"sheetCount\":" << doc.sheets.size() << '}';
    const auto payload = out.str();
    if (payload.size() > 2 * 1024 * 1024) return Fail("output_limit_exceeded", 11);
    std::cout << payload << '\n';
    return 0;
  } catch (...) { return Fail("reader_exception", 12); }
}
