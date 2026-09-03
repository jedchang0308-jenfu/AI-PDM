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

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Xaml

$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

[StructLayout(LayoutKind.Sequential)]
public struct SIZE
{
    public int cx;
    public int cy;
}

[StructLayout(LayoutKind.Sequential)]
public struct BITMAP
{
    public int bmType;
    public int bmWidth;
    public int bmHeight;
    public int bmWidthBytes;
    public ushort bmPlanes;
    public ushort bmBitsPixel;
    public IntPtr bmBits;
}

[StructLayout(LayoutKind.Sequential)]
public struct BITMAPINFOHEADER
{
    public uint biSize;
    public int biWidth;
    public int biHeight;
    public ushort biPlanes;
    public ushort biBitCount;
    public uint biCompression;
    public uint biSizeImage;
    public int biXPelsPerMeter;
    public int biYPelsPerMeter;
    public uint biClrUsed;
    public uint biClrImportant;
}

[StructLayout(LayoutKind.Sequential)]
public struct BITMAPINFO
{
    public BITMAPINFOHEADER bmiHeader;
    public uint bmiColors;
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

    [DllImport("gdi32.dll", CharSet = CharSet.Auto)]
    private static extern int GetObject(IntPtr hObject, int bufferSize, out BITMAP bitmap);

    [DllImport("gdi32.dll")]
    private static extern int GetDIBits(
        IntPtr deviceContext,
        IntPtr bitmap,
        uint startScan,
        uint scanLines,
        [Out] byte[] bits,
        ref BITMAPINFO bitmapInfo,
        uint usage
    );

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr window, IntPtr deviceContext);

    private const uint BI_RGB = 0;
    private const uint DIB_RGB_COLORS = 0;

    public static void SavePng(string sourcePath, string outputPath, int size)
    {
        Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        IShellItemImageFactory factory = null;
        IntPtr hbitmap = IntPtr.Zero;

        try
        {
            int hr = SHCreateItemFromParsingName(sourcePath, IntPtr.Zero, ref iid, out factory);
            if (hr != 0) Marshal.ThrowExceptionForHR(hr);

            SIZE targetSize = new SIZE { cx = size, cy = size };
            try
            {
                factory.GetImage(targetSize, SIIGBF.THUMBNAILONLY | SIIGBF.BIGGERSIZEOK | SIIGBF.SCALEUP, out hbitmap);
            }
            catch (Exception error)
            {
                throw new Exception("Shell GetImage failed: " + error.GetType().FullName + ": " + error.Message, error);
            }
            if (hbitmap == IntPtr.Zero) throw new Exception("Shell thumbnail provider returned no bitmap.");

            BitmapSource source;
            try
            {
                source = CreateBitmapSource(hbitmap);
                source.Freeze();
            }
            catch (Exception error)
            {
                throw new Exception("HBITMAP pixel conversion failed: " + error.GetType().FullName + ": " + error.Message, error);
            }

            try
            {
                PngBitmapEncoder encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(source));
                using (FileStream stream = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    encoder.Save(stream);
                }
            }
            catch (Exception error)
            {
                throw new Exception("PNG encoding failed: " + error.GetType().FullName + ": " + error.Message, error);
            }
        }
        finally
        {
            if (hbitmap != IntPtr.Zero) DeleteObject(hbitmap);
            if (factory != null && Marshal.IsComObject(factory)) Marshal.FinalReleaseComObject(factory);
        }
    }

    private static BitmapSource CreateBitmapSource(IntPtr hbitmap)
    {
        BITMAP nativeBitmap;
        int objectBytes = GetObject(hbitmap, Marshal.SizeOf(typeof(BITMAP)), out nativeBitmap);
        int width = nativeBitmap.bmWidth;
        int height = Math.Abs(nativeBitmap.bmHeight);
        if (objectBytes == 0 || width <= 0 || height <= 0)
        {
            throw new Exception("Shell thumbnail provider returned an invalid HBITMAP.");
        }

        int stride = checked(width * 4);
        byte[] pixels = new byte[checked(stride * height)];
        BITMAPINFO info = new BITMAPINFO();
        info.bmiHeader.biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER));
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = -height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        info.bmiHeader.biSizeImage = (uint)pixels.Length;

        IntPtr deviceContext = GetDC(IntPtr.Zero);
        if (deviceContext == IntPtr.Zero) throw new Exception("Unable to acquire a device context for thumbnail conversion.");
        try
        {
            int rows = GetDIBits(deviceContext, hbitmap, 0, (uint)height, pixels, ref info, DIB_RGB_COLORS);
            if (rows != height)
            {
                throw new Exception(String.Format("Unable to read Shell thumbnail pixels ({0}/{1} rows).", rows, height));
            }
        }
        finally
        {
            ReleaseDC(IntPtr.Zero, deviceContext);
        }

        bool hasAlpha = false;
        for (int offset = 3; offset < pixels.Length; offset += 4)
        {
            if (pixels[offset] != 0)
            {
                hasAlpha = true;
                break;
            }
        }
        if (!hasAlpha)
        {
            for (int offset = 3; offset < pixels.Length; offset += 4) pixels[offset] = 255;
        }

        return BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, stride);
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies PresentationCore, WindowsBase, System.Xaml

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
