cmake_minimum_required(VERSION 3.25)
project(aipdm_openswx_feasibility LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_package(ZLIB REQUIRED)
find_package(pugixml CONFIG REQUIRED)
set(VENDOR "${CMAKE_CURRENT_SOURCE_DIR}/vendor/libopenswx")
add_library(aipdm_openswx STATIC
  "${VENDOR}/src/document.cc"
  "${VENDOR}/src/internal/decompressor.cc"
  "${VENDOR}/src/internal/modern_parser.cc"
  "${VENDOR}/src/internal/ole2_parser.cc"
  "${VENDOR}/src/internal/xml_readers.cc"
  "${VENDOR}/src/internal/sheet_name_reader.cc")
target_include_directories(aipdm_openswx PUBLIC "${VENDOR}/include" PRIVATE "${VENDOR}/src")
target_link_libraries(aipdm_openswx PRIVATE ZLIB::ZLIB pugixml::pugixml)
add_executable(aipdm-openswx-reader reader.cc)
target_link_libraries(aipdm-openswx-reader PRIVATE aipdm_openswx)
target_compile_options(aipdm-openswx-reader PRIVATE -Wall -Wextra -Wpedantic)
