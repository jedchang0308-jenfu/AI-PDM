param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [int]$Size = 512
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
  throw "Source file not found: $SourcePath"
}

Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct SIZE
{
    public int cx;
    public int cy;
}

[Flags]
public enum SIIGBF
{
    RESIZETOFIT = 0x00000000,
    BIGGERSIZEOK = 0x00000001,
    MEMORYONLY = 0x00000002,
    ICONONLY = 0x00000004,
    THUMBNAILONLY = 0x00000008,
    INCACHEONLY = 0x00000010,
    CROPTOSQUARE = 0x00000020,
    WIDETHUMBNAILS = 0x00000040,
    ICONBACKGROUND = 0x00000080,
    SCALEUP = 0x00000100
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
public interface IShellItemImageFactory
{
    void GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
}

public static class WindowsShellThumbnailExtractor
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItemImageFactory ppv);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    public static void SavePng(string sourcePath, string outputPath, int size)
    {
        Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        IShellItemImageFactory factory;
        int hr = SHCreateItemFromParsingName(sourcePath, IntPtr.Zero, ref iid, out factory);
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);

        SIZE targetSize = new SIZE { cx = size, cy = size };
        IntPtr hbitmap;
        factory.GetImage(targetSize, SIIGBF.THUMBNAILONLY | SIIGBF.BIGGERSIZEOK | SIIGBF.SCALEUP, out hbitmap);
        if (hbitmap == IntPtr.Zero) throw new Exception("Shell thumbnail provider returned no bitmap.");

        try
        {
            using (Bitmap bitmap = Image.FromHbitmap(hbitmap))
            {
                bitmap.Save(outputPath, ImageFormat.Png);
            }
        }
        finally
        {
            DeleteObject(hbitmap);
            Marshal.ReleaseComObject(factory);
        }
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

[WindowsShellThumbnailExtractor]::SavePng($SourcePath, $OutputPath, $Size)

$file = Get-Item -LiteralPath $OutputPath
[pscustomobject]@{
  outputPath = $file.FullName
  bytes = $file.Length
} | ConvertTo-Json -Compress
