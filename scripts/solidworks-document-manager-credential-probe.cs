using System;
using System.Runtime.InteropServices;
using SolidWorks.Interop.swdocumentmgr;

internal static class SolidWorksDocumentManagerCredentialProbe
{
    [STAThread]
    private static int Main()
    {
        string key = Environment.GetEnvironmentVariable("PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY") ?? "";
        if (String.IsNullOrWhiteSpace(key)) return Emit("failed", "native_metadata_license_missing");
        ISwDMApplication app = null;
        try
        {
            Type factoryType = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory");
            if (factoryType == null) return Emit("failed", "native_metadata_api_unavailable");
            object factoryObject = Activator.CreateInstance(factoryType);
            ISwDMClassFactory factory = factoryObject as ISwDMClassFactory;
            if (factory == null) return Emit("failed", "native_metadata_api_unavailable");
            SwDMApplication rawApp = factory.GetApplication(key);
            app = rawApp as ISwDMApplication;
            Marshal.ReleaseComObject(factory);
            return app == null ? Emit("failed", "native_metadata_license_invalid") : Emit("succeeded", "native_metadata_probe_passed");
        }
        catch (COMException) { return Emit("failed", "native_metadata_license_invalid"); }
        catch { return Emit("failed", "native_metadata_credential_probe_failed"); }
        finally { if (app != null) Marshal.ReleaseComObject(app); }
    }

    private static int Emit(string status, string diagnostic)
    {
        Console.WriteLine("{\"schemaVersion\":\"drawing-recognition-extractor.v1\",\"adapter\":\"solidworks-credential-probe.v1\",\"adapterVersion\":\"solidworks-document-manager-reader.v1\",\"status\":\"" + status + "\",\"observations\":[],\"diagnostics\":[\"" + diagnostic + "\"]}");
        return status == "succeeded" ? 0 : 1;
    }
}
