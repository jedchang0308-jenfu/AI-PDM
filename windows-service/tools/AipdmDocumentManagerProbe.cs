using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
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
        Type factory = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory", false);
        if (factory == null) throw new InvalidOperationException("COM_CLASS_MISSING");
        string clsid = factory.GUID.ToString("B");
        string registryKey = "CLSID\\" + clsid + "\\InprocServer32";
        string serverPath;
        using (RegistryKey key = Registry.ClassesRoot.OpenSubKey(registryKey, false))
            serverPath = Convert.ToString(key == null ? null : key.GetValue(null));
        serverPath = Environment.ExpandEnvironmentVariables((serverPath ?? "").Trim().Trim('"'));
        if (!Path.IsPathRooted(serverPath) || !File.Exists(serverPath))
            throw new FileNotFoundException("COM_SERVER_MISSING");
        string interopPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "extractors", "SolidWorks.Interop.swdocumentmgr.dll");
        if (!File.Exists(interopPath)) throw new FileNotFoundException("INTEROP_MISSING");
        Version interopVersion = AssemblyName.GetAssemblyName(interopPath).Version;
        FileVersionInfo serverVersion = FileVersionInfo.GetVersionInfo(serverPath);
        if (interopVersion == null || interopVersion.Major <= 0 || serverVersion.FileMajorPart != interopVersion.Major)
            throw new InvalidDataException("DOCUMENT_MANAGER_MAJOR_MISMATCH");
        return new Dictionary<string, object> {
            { "contractVersion", "ai-pdm.document-manager-runtime.v1" },
            { "clsid", clsid.ToLowerInvariant() },
            { "serverFileName", Path.GetFileName(serverPath) },
            { "serverVersion", serverVersion.FileVersion ?? "" },
            { "serverSha256", Sha256(serverPath) },
            { "interopVersion", interopVersion.ToString() },
            { "interopSha256", Sha256(interopPath) },
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
