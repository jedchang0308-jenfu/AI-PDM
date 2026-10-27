using System;
using System.Runtime.InteropServices;

internal static class SolidWorksDocumentManagerCredentialProbe
{
    [STAThread]
    private static int Main()
    {
        string key = Environment.GetEnvironmentVariable("PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY") ?? "";
        if (String.IsNullOrWhiteSpace(key)) return Emit("failed", "native_metadata_license_missing");
        object app = null;
        try
        {
            SolidWorksDocumentManagerRuntime runtime = SolidWorksDocumentManagerRuntime.Load();
            app = runtime.CreateApplication(key);
            return app == null ? Emit("failed", "native_metadata_license_invalid") : Emit("succeeded", "native_metadata_probe_passed");
        }
        catch (COMException) { return Emit("failed", "native_metadata_license_invalid"); }
        catch { return Emit("failed", "native_metadata_credential_probe_failed"); }
        finally { SolidWorksDocumentManagerRuntime.Release(app); }
    }

    private static int Emit(string status, string diagnostic)
    {
        Console.WriteLine("{\"schemaVersion\":\"drawing-recognition-extractor.v1\",\"adapter\":\"solidworks-credential-probe.v1\",\"adapterVersion\":\"solidworks-document-manager-reader.v1\",\"status\":\"" + status + "\",\"observations\":[],\"diagnostics\":[\"" + diagnostic + "\"]}");
        return status == "succeeded" ? 0 : 1;
    }
}
