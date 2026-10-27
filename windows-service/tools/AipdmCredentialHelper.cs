using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

internal static class AipdmCredentialHelper
{
    private const string MutexName = "Global\\AipdmWindowsParsing";

    private static string CredentialPath()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "AI-PDM Windows Service", "credential.bin");
    }

    private static int Main(string[] args)
    {
        if (args.Length != 1)
        {
            Console.Error.WriteLine("USAGE_INVALID");
            return 64;
        }
        if (args[0] == "read") return ReadCredential();
        if (args[0] == "mutex") return HoldMutex();
        if (args[0] == "status") return File.Exists(CredentialPath()) ? 0 : 66;
        Console.Error.WriteLine("COMMAND_INVALID");
        return 64;
    }

    private static int ReadCredential()
    {
        string path = CredentialPath();
        if (!File.Exists(path)) return 66;
        try
        {
            byte[] protectedBytes = File.ReadAllBytes(path);
            byte[] clearBytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.LocalMachine);
            Console.Out.Write(Encoding.UTF8.GetString(clearBytes));
            Array.Clear(clearBytes, 0, clearBytes.Length);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("CREDENTIAL_UNPROTECT_FAILED:" + ex.GetType().Name);
            return 74;
        }
    }

    private static int HoldMutex()
    {
        bool created;
        using (Mutex mutex = new Mutex(true, MutexName, out created))
        {
            if (!created) return 75;
            Console.Out.WriteLine("LOCKED");
            Console.Out.Flush();
            while (Console.In.Read() != -1) { }
        }
        return 0;
    }
}
