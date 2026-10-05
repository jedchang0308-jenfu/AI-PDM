// AI-PDM bounded adapter; the MIT OpenSWX library is unmodified.
#include <openswx/document.h>
#include <algorithm>
#include <cctype>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>
namespace {
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
