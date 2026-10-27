using System;
using System.Collections;
using System.IO;
using System.Runtime.InteropServices;

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
            Console.Error.WriteLine("Usage: SolidWorksDocumentManagerPreviewExporter.exe <source.sldprt|sldasm|slddrw> <output.png>");
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

        object app = null;
        object doc = null;

        try
        {
            app = CreateDocumentManagerApplication(licenseKey);
            if (app == null)
            {
                Console.Error.WriteLine("DOCUMENT_MANAGER_APPLICATION_UNAVAILABLE");
                return 70;
            }

            int documentType = DocumentTypeFor(sourcePath);
            if (documentType == 0)
            {
                Console.Error.WriteLine("DOCUMENT_MANAGER_SOURCE_TYPE_UNSUPPORTED");
                return 64;
            }
            int openError = 0;
            doc = ((dynamic)app).GetDocument(sourcePath, documentType, true, out openError);
            if (doc == null || openError != 0)
            {
                Console.Error.WriteLine("DOCUMENT_MANAGER_OPEN_FAILED:" + openError);
                return 71;
            }

            string previewSource;
            byte[] pngBytes = documentType == 3
                ? TryReadFirstSheetPreview(doc, out previewSource)
                : TryReadActiveConfigurationPreview(doc, out previewSource);
            if ((pngBytes == null || pngBytes.Length == 0) && documentType == 3)
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
                    ((dynamic)doc).CloseDoc();
                }
            }
            catch
            {
                // Do not mask the primary export result.
            }

            ReleaseCom(doc);
            ReleaseCom(app);
        }
    }

    private static int DocumentTypeFor(string sourcePath)
    {
        string extension = Path.GetExtension(sourcePath).ToLowerInvariant();
        if (extension == ".sldprt") return 1;
        if (extension == ".sldasm") return 2;
        if (extension == ".slddrw") return 3;
        return 0;
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

    private static object CreateDocumentManagerApplication(string licenseKey)
    {
        Type factoryType = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory");
        if (factoryType == null)
        {
            return null;
        }

        object factoryObject = Activator.CreateInstance(factoryType);
        if (factoryObject == null)
        {
            return null;
        }

        object application = ((dynamic)factoryObject).GetApplication(licenseKey);
        ReleaseCom(factoryObject);
        return application;
    }

    private static byte[] TryReadFirstSheetPreview(object doc, out string previewSource)
    {
        previewSource = "sheet";
        object sheets = ((dynamic)doc).GetSheets();
        foreach (object item in EnumerateObject(sheets))
        {
            if (item == null)
            {
                continue;
            }

            int previewError = 0;
            object bytesObject = ((dynamic)item).GetPreviewPNGBitmapBytes(out previewError);
            byte[] bytes = ConvertVariantByteArray(bytesObject);
            if (previewError == 0 && bytes != null && bytes.Length > 0)
            {
                previewSource = "sheet:" + SafeSheetName(item);
                return bytes;
            }
        }

        return null;
    }

    private static byte[] TryReadActiveConfigurationPreview(object doc, out string previewSource)
    {
        previewSource = "configuration";
        object managerObject = null;
        object configurationObject = null;
        try
        {
            managerObject = ((dynamic)doc).ConfigurationManager;
            if (managerObject == null) return null;
            dynamic manager = managerObject;
            string activeName = Convert.ToString(manager.GetActiveConfigurationName()) ?? "";
            if (String.IsNullOrWhiteSpace(activeName)) return null;
            int configurationError = 0;
            configurationObject = manager.GetConfigurationByName2(activeName, out configurationError);
            if (configurationObject == null || configurationError != 0) return null;
            int previewError = 0;
            object bytesObject = ((dynamic)configurationObject).GetPreviewPNGBitmapBytes(out previewError);
            byte[] bytes = ConvertVariantByteArray(bytesObject);
            if (previewError != 0 || bytes == null || bytes.Length == 0) return null;
            previewSource = "configuration:" + activeName;
            return bytes;
        }
        finally
        {
            ReleaseCom(configurationObject);
            ReleaseCom(managerObject);
        }
    }

    private static byte[] TryReadDocumentPreview(object doc, out string previewSource)
    {
        previewSource = "document";
        int previewError = 0;
        object bytesObject = ((dynamic)doc).GetPreviewPNGBitmapBytes(out previewError);
        byte[] bytes = ConvertVariantByteArray(bytesObject);
        return previewError == 0 ? bytes : null;
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

    private static string SafeSheetName(object sheet)
    {
        try
        {
            return Convert.ToString(((dynamic)sheet).Name) ?? "";
        }
        catch
        {
            return "";
        }
    }

    private static void ReleaseCom(object value)
    {
        if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value);
    }

    private static string JsonEscape(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}
