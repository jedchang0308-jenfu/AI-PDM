using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Web.Script.Serialization;

/** Opt-in local oracle. Starts one hidden task-owned process, binds only its
 * exact PID moniker, reads a task-owned sample copy, writes Pack and Go to the
 * supplied task directory and exits only that instance. Never attaches via ROT
 * generic ProgID/GetActiveObject and never activates or buys a license. */
internal static class Dev129SolidWorksSampleOracle
{
    [DllImport("ole32.dll")] private static extern int CreateBindCtx(uint reserved, out IBindCtx context);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 128 };
    [STAThread]
    private static int Main(string[] args)
    {
        Process process = null; object application = null; bool bound = false;
        var receipt = new Dictionary<string, object> { { "version", 1 }, { "status", "blocked" }, { "nativeCadAcceptance", false } };
        try
        {
            if (args.Length != 3 || !Path.IsPathRooted(args[0]) || !Path.IsPathRooted(args[1]) || !Path.IsPathRooted(args[2])) throw new InvalidDataException("oracle_arguments_invalid");
            string executable = Path.GetFullPath(args[0]), source = Path.GetFullPath(args[1]), output = Path.GetFullPath(args[2]);
            if (!String.Equals(Path.GetFileName(executable), "SLDWORKS.exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(executable) || !File.Exists(source) || !Directory.Exists(output) || !source.StartsWith(output + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("oracle_isolation_invalid");
            if (Process.GetProcessesByName("SLDWORKS").Length != 0) throw new InvalidDataException("oracle_existing_session_preserved");
            process = Process.Start(new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = output });
            receipt["pid"] = process.Id; receipt["startedAt"] = process.StartTime.ToUniversalTime().ToString("o");
            File.WriteAllText(Path.Combine(output, "oracle-process.json"), Json.Serialize(receipt));
            DateTime deadline = DateTime.UtcNow.AddSeconds(90);
            while (application == null && DateTime.UtcNow < deadline && !process.HasExited) { application = BindExactProcess(process.Id); if (application == null) Thread.Sleep(500); }
            if (application == null) throw new InvalidDataException("oracle_new_instance_not_ready");
            dynamic app = application;
            if ((int)app.GetProcessID() != process.Id) throw new InvalidDataException("oracle_process_identity_mismatch");
            bound = true;
            app.Visible = false; app.UserControl = false;
            while (!(bool)app.StartupProcessCompleted && DateTime.UtcNow < deadline) Thread.Sleep(500);
            if (!(bool)app.StartupProcessCompleted) throw new InvalidDataException("oracle_startup_incomplete");
            receipt["cadVersion"] = Convert.ToString(app.RevisionNumber());
            int error = 0, warning = 0;
            dynamic document = app.OpenDoc6(source, 2, 3, "", ref error, ref warning); // Silent + read-only.
            receipt["openError"] = error; receipt["openWarning"] = warning;
            if (document == null || error != 0) throw new InvalidDataException("oracle_document_open_failed");
            var configurations = new List<object>();
            foreach (object rawName in (Array)document.GetConfigurationNames())
            {
                string name = Convert.ToString(rawName);
                if (!(bool)document.ShowConfiguration2(name)) throw new InvalidDataException("oracle_configuration_switch_failed");
                dynamic config = document.GetConfigurationByName(name); dynamic root = config.GetRootComponent3(true);
                var rows = new List<object>(); Traverse(root, "root", rows, 0);
                configurations.Add(new Dictionary<string, object> { { "name", name }, { "rows", rows } });
            }
            receipt["configurations"] = configurations;
            dynamic extension = document.Extension; dynamic pack = extension.GetPackAndGo();
            pack.IncludeDrawings = false; pack.IncludeSimulationResults = false; pack.IncludeSuppressed = true; pack.FlattenToSingleFolder = false;
            object names = null; if (!(bool)pack.GetDocumentNames(out names)) throw new InvalidDataException("oracle_pack_names_failed");
            receipt["packageSourceNames"] = names;
            string zip = Path.Combine(output, "UJoint-PackAndGo.zip");
            if (File.Exists(zip) || !(bool)pack.SetSaveToName(true, zip)) throw new InvalidDataException("oracle_pack_target_invalid");
            object statuses = extension.SavePackAndGo(pack); receipt["packageSaveStatuses"] = statuses;
            if (!File.Exists(zip) || new FileInfo(zip).Length == 0) throw new InvalidDataException("oracle_pack_save_failed");
            receipt["status"] = "succeeded"; receipt["zip"] = zip;
            // This is an independent oracle; DM parity and isolated package
            // reopening still need separate checks before acceptance is claimed.
            receipt["nativeCadAcceptance"] = false;
            return 0;
        }
        catch (Exception error)
        {
            receipt["diagnostic"] = error is InvalidDataException ? error.Message : "oracle_native_operation_failed";
            receipt["errorType"] = error.GetType().Name; return 1;
        }
        finally
        {
            if (bound && application != null) { try { ((dynamic)application).ExitApp(); } catch { } }
            if (application != null && Marshal.IsComObject(application)) Marshal.ReleaseComObject(application);
            if (process != null) { try { if (!process.HasExited && !process.WaitForExit(10000)) process.Kill(); receipt["processExited"] = process.WaitForExit(10000); } catch { receipt["processExited"] = false; } process.Dispose(); }
            string text = Json.Serialize(receipt); Console.Out.Write(text);
            if (args.Length == 3 && Directory.Exists(args[2])) File.WriteAllText(Path.Combine(args[2], "solidworks-oracle.json"), text);
        }
    }
    private static void Traverse(dynamic parent, string parentName, List<object> rows, int depth)
    {
        if (depth > 64 || rows.Count > 50000) throw new InvalidDataException("oracle_graph_limit");
        Array children = parent.GetChildren() as Array; if (children == null) return;
        foreach (dynamic component in children)
        {
            string name = Convert.ToString(component.Name2);
            rows.Add(new Dictionary<string, object> { { "parent", parentName }, { "name", name }, { "path", Convert.ToString(component.GetPathName()) }, { "configuration", Convert.ToString(component.ReferencedConfiguration) }, { "suppressed", (bool)component.IsSuppressed() }, { "excludeFromBom", (bool)component.ExcludeFromBOM }, { "id", (int)component.GetID() } });
            if (!(bool)component.IsSuppressed()) Traverse(component, name, rows, depth + 1);
        }
    }
    private static object BindExactProcess(int processId)
    {
        IBindCtx context = null; IRunningObjectTable table = null; IEnumMoniker enumerator = null;
        try
        {
            CreateBindCtx(0, out context); context.GetRunningObjectTable(out table); table.EnumRunning(out enumerator);
            IMoniker[] values = new IMoniker[1];
            while (enumerator.Next(1, values, IntPtr.Zero) == 0)
            {
                try { string name; values[0].GetDisplayName(context, null, out name); if (String.Equals(name, "SolidWorks_PID_" + processId, StringComparison.OrdinalIgnoreCase)) { object value; table.GetObject(values[0], out value); return value; } }
                catch (UnauthorizedAccessException) { }
                finally { Marshal.ReleaseComObject(values[0]); }
            }
            return null;
        }
        finally { if (enumerator != null) Marshal.ReleaseComObject(enumerator); if (table != null) Marshal.ReleaseComObject(table); if (context != null) Marshal.ReleaseComObject(context); }
    }
}
