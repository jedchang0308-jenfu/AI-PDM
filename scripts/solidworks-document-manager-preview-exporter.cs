using System;
using System.Collections;
using System.IO;
using System.Runtime.InteropServices;
using SolidWorks.Interop.swdocumentmgr;

internal static class SolidWorksDocumentManagerPreviewExporter
{
    private static readonly string[] LicenseEnvironmentNames = new[]
    {
        "PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY",
        "PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY",
        "SOLIDWORKS_DOCUMENT_MANAGER_KEY"
    };

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: SolidWorksDocumentManagerPreviewExporter.exe <source.slddrw> <output.png>");
            return 64;
        }

        string sourcePath = Path.GetFullPath(args[0]);
        string outputPath = Path.GetFullPath(args[1]);
        if (!File.Exists(sourcePath))
        {
            Console.Error.WriteLine("SOURCE_FILE_NOT_FOUND");
            return 66;
        }

        string licenseKey = ReadLicenseKey();
        if (String.IsNullOrWhiteSpace(licenseKey))
        {
            Console.Error.WriteLine("DOCUMENT_MANAGER_LICENSE_KEY_MISSING");
            return 65;
        }

        ISwDMApplication app = null;
        ISwDMDocument doc = null;

        try
        {
            app = CreateDocumentManagerApplication(licenseKey);
            if (app == null)
            {
                Console.Error.WriteLine("DOCUMENT_MANAGER_APPLICATION_UNAVAILABLE");
                return 70;
            }

            SwDmDocumentOpenError openError = SwDmDocumentOpenError.swDmDocumentOpenErrorNone;
            SwDMDocument rawDoc = app.GetDocument(sourcePath, SwDmDocumentType.swDmDocumentDrawing, true, out openError);
            doc = rawDoc as ISwDMDocument;
            if (doc == null || openError != SwDmDocumentOpenError.swDmDocumentOpenErrorNone)
            {
                Console.Error.WriteLine("DOCUMENT_MANAGER_OPEN_FAILED:" + openError);
                return 71;
            }

            string previewSource;
            byte[] pngBytes = TryReadFirstSheetPreview(doc, out previewSource);
            if (pngBytes == null || pngBytes.Length == 0)
            {
                pngBytes = TryReadDocumentPreview(doc, out previewSource);
            }

            if (pngBytes == null || pngBytes.Length == 0)
            {
                Console.Error.WriteLine("DOCUMENT_MANAGER_PREVIEW_NOT_AVAILABLE");
                return 72;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
            File.WriteAllBytes(outputPath, pngBytes);
            Console.WriteLine("{\"ok\":true,\"source\":\"" + JsonEscape(previewSource) + "\",\"bytes\":" + pngBytes.Length + "}");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.GetType().FullName + ":" + ex.Message);
            return 1;
        }
        finally
        {
            try
            {
                if (doc != null)
                {
                    doc.CloseDoc();
                }
            }
            catch
            {
                // Do not mask the primary export result.
            }

            if (doc != null)
            {
                Marshal.ReleaseComObject(doc);
            }

            if (app != null)
            {
                Marshal.ReleaseComObject(app);
            }
        }
    }

    private static string ReadLicenseKey()
    {
        foreach (string name in LicenseEnvironmentNames)
        {
            string value = Environment.GetEnvironmentVariable(name);
            if (!String.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return "";
    }

    private static ISwDMApplication CreateDocumentManagerApplication(string licenseKey)
    {
        Type factoryType = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory");
        if (factoryType == null)
        {
            return null;
        }

        object factoryObject = Activator.CreateInstance(factoryType);
        ISwDMClassFactory factory = factoryObject as ISwDMClassFactory;
        if (factory == null)
        {
            return null;
        }

        SwDMApplication rawApplication = factory.GetApplication(licenseKey);
        ISwDMApplication application = rawApplication as ISwDMApplication;
        Marshal.ReleaseComObject(factory);
        return application;
    }

    private static byte[] TryReadFirstSheetPreview(ISwDMDocument doc, out string previewSource)
    {
        previewSource = "sheet";
        ISwDMDocument10 doc10 = doc as ISwDMDocument10;
        if (doc10 == null)
        {
            return null;
        }

        object sheets = doc10.GetSheets();
        foreach (object item in EnumerateObject(sheets))
        {
            ISwDMSheet2 sheet = item as ISwDMSheet2;
            if (sheet == null)
            {
                continue;
            }

            SwDmPreviewError previewError = SwDmPreviewError.swDmPreviewErrorNone;
            object bytesObject = sheet.GetPreviewPNGBitmapBytes(out previewError);
            byte[] bytes = ConvertVariantByteArray(bytesObject);
            if (previewError == SwDmPreviewError.swDmPreviewErrorNone && bytes != null && bytes.Length > 0)
            {
                previewSource = "sheet:" + SafeSheetName(sheet);
                return bytes;
            }
        }

        return null;
    }

    private static byte[] TryReadDocumentPreview(ISwDMDocument doc, out string previewSource)
    {
        previewSource = "document";
        ISwDMDocument11 doc11 = doc as ISwDMDocument11;
        if (doc11 == null)
        {
            return null;
        }

        SwDmPreviewError previewError = SwDmPreviewError.swDmPreviewErrorNone;
        object bytesObject = doc11.GetPreviewPNGBitmapBytes(out previewError);
        byte[] bytes = ConvertVariantByteArray(bytesObject);
        return previewError == SwDmPreviewError.swDmPreviewErrorNone ? bytes : null;
    }

    private static IEnumerable EnumerateObject(object value)
    {
        if (value == null)
        {
            yield break;
        }

        Array array = value as Array;
        if (array != null)
        {
            foreach (object item in array)
            {
                yield return item;
            }
            yield break;
        }

        yield return value;
    }

    private static byte[] ConvertVariantByteArray(object value)
    {
        if (value == null)
        {
            return null;
        }

        byte[] direct = value as byte[];
        if (direct != null)
        {
            return direct;
        }

        Array array = value as Array;
        if (array == null)
        {
            return null;
        }

        byte[] bytes = new byte[array.Length];
        int index = 0;
        foreach (object item in array)
        {
            bytes[index] = Convert.ToByte(item);
            index += 1;
        }

        return bytes;
    }

    private static string SafeSheetName(ISwDMSheet2 sheet)
    {
        try
        {
            return sheet.Name ?? "";
        }
        catch
        {
            return "";
        }
    }

    private static string JsonEscape(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}
