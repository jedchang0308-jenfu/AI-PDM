using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

internal static class AipdmDocumentManagerProbe
{
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    private static int Main(string[] args)
    {
        if (args.Length != 1 || (args[0] != "verify" && args[0] != "receipt")) return 64;
        try
        {
            Dictionary<string, object> receipt = Inspect();
            string serialized = Json.Serialize(receipt);
            if (args[0] == "receipt")
            {
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "AI-PDM Windows Service");
                Directory.CreateDirectory(directory);
                File.WriteAllText(Path.Combine(directory, "document-manager-runtime.json"), serialized,
                    new System.Text.UTF8Encoding(false));
            }
            Console.Out.Write(serialized);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("DOCUMENT_MANAGER_RUNTIME_INCOMPATIBLE:" + ex.GetType().Name);
            return 72;
        }
    }

    private static Dictionary<string, object> Inspect()
    {
        SolidWorksDocumentManagerRuntime runtime = SolidWorksDocumentManagerRuntime.Load();
        string clsid = runtime.FactoryComType.GUID.ToString("B");
        string serverPath = runtime.NativeServerPath;
        string interopPath = runtime.InteropAssemblyPath;
        FileVersionInfo serverVersion = FileVersionInfo.GetVersionInfo(serverPath);
        FileVersionInfo interopVersion = FileVersionInfo.GetVersionInfo(interopPath);
        if (serverVersion.FileMajorPart <= 0) throw new InvalidDataException("DOCUMENT_MANAGER_VERSION_UNKNOWN");
        return new Dictionary<string, object> {
            { "contractVersion", "ai-pdm.document-manager-runtime.v1" },
            { "clsid", clsid.ToLowerInvariant() },
            { "serverFileName", Path.GetFileName(serverPath) },
            { "serverVersion", serverVersion.FileVersion ?? "" },
            { "serverSha256", Sha256(serverPath) },
            { "interopFileName", Path.GetFileName(interopPath) },
            { "interopVersion", interopVersion.FileVersion ?? "" },
            { "interopSha256", Sha256(interopPath) },
            { "binding", "runtime-loaded-official-interop" },
            { "runtimeMajor", serverVersion.FileMajorPart },
            { "architecture", Environment.Is64BitProcess ? "x64" : "x86" }
        };
    }

    private static string Sha256(string path)
    {
        using (FileStream stream = File.OpenRead(path))
        using (SHA256 sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
}
