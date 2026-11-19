using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Web.Script.Serialization;
using SolidWorks.Interop.sldworks;

/** Build with the installed SOLIDWORKS interop (/link) and System.Web.Extensions.
 * Opens a task-owned sample read-only in a fresh, PID-bound CAD session.
 * The optional --verify-download mode rebuilds a freshly extracted package and
 * records its native BOM. The default mode writes a Pack and Go archive. */
internal static class Dev129SolidWorksSampleOracle
{
    [DllImport("ole32.dll")] private static extern int CreateBindCtx(uint reserved, out IBindCtx context);
    [ComImport, Guid("00000016-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMessageFilter {
        [PreserveSig] int HandleInComingCall(int callType, IntPtr caller, int elapsed, IntPtr info);
        [PreserveSig] int RetryRejectedCall(IntPtr callee, int elapsed, int reason);
        [PreserveSig] int MessagePending(IntPtr callee, int elapsed, int pending);
    }
    private sealed class StartupMessageFilter : IMessageFilter {
        public int HandleInComingCall(int callType, IntPtr caller, int elapsed, IntPtr info) { return 0; }
        public int RetryRejectedCall(IntPtr callee, int elapsed, int reason) { return reason == 2 && elapsed < 15000 ? 250 : -1; }
        public int MessagePending(IntPtr callee, int elapsed, int pending) { return 2; }
    }
    [DllImport("ole32.dll")] private static extern int CoRegisterMessageFilter(IMessageFilter filter, out IMessageFilter previous);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 128 };
    [STAThread]
    private static int Main(string[] args)
    {
        Process process = null; object application = null; bool bound = false; bool preserveSession = false;
        var receipt = new Dictionary<string, object> { { "version", 1 }, { "status", "blocked" }, { "nativeCadAcceptance", false } };
        IMessageFilter previous;
        CoRegisterMessageFilter(new StartupMessageFilter(), out previous);
        try
        {
            bool verifyDownload = args.Length == 4 && args[3] == "--verify-download";
            if ((!verifyDownload && args.Length != 3) || !Path.IsPathRooted(args[0]) || !Path.IsPathRooted(args[1]) || !Path.IsPathRooted(args[2])) throw new InvalidDataException("oracle_arguments_invalid");
            string executable = Path.GetFullPath(args[0]), source = Path.GetFullPath(args[1]), output = Path.GetFullPath(args[2]);
            if (!String.Equals(Path.GetFileName(executable), "SLDWORKS.exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(executable) || !File.Exists(source) || !Directory.Exists(output) || !source.StartsWith(output + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("oracle_isolation_invalid");
            // No document argument is passed to the launcher. The only instance
            // allowed to receive any CAD calls is the newly launched PID.
            process = Process.Start(new ProcessStartInfo(executable, "/b") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = output });
            receipt["pid"] = process.Id; receipt["startedAt"] = process.StartTime.ToUniversalTime().ToString("o");
            File.WriteAllText(Path.Combine(output, "oracle-process.json"), Json.Serialize(receipt));
            DateTime deadline = DateTime.UtcNow.AddSeconds(90);
            receipt["stage"] = "bind_new_process";
            while (application == null && DateTime.UtcNow < deadline && !process.HasExited) { application = BindExactProcess(process.Id); if (application == null) Thread.Sleep(500); }
            if (application == null) {
                if (process.HasExited) receipt["startupExitCode"] = process.ExitCode;
                throw new InvalidDataException("oracle_new_instance_not_ready");
            }
            ISldWorks app = (ISldWorks)application;
            receipt["stage"] = "verify_new_process";
            if ((int)app.GetProcessID() != process.Id) throw new InvalidDataException("oracle_process_identity_mismatch");
            receipt["stage"] = "wait_for_startup";
            while (!(bool)app.StartupProcessCompleted && DateTime.UtcNow < deadline) Thread.Sleep(500);
            if (!(bool)app.StartupProcessCompleted) throw new InvalidDataException("oracle_startup_incomplete");
            if ((int)app.GetDocumentCount() != 0) { preserveSession = true; throw new InvalidDataException("oracle_expected_empty_session"); }
            bound = true;
            app.Visible = false; app.UserControl = false;
            receipt["cadVersion"] = Convert.ToString(app.RevisionNumber());
            if (!(bool)app.SetCurrentWorkingDirectory(Path.GetDirectoryName(source))) throw new InvalidDataException("oracle_working_directory_failed");
            int error = 0, warning = 0;
            receipt["stage"] = "open_assembly";
            IModelDoc2 document = app.OpenDoc6(source, 2, 3, "", ref error, ref warning); // Silent + read-only.
            receipt["openError"] = error; receipt["openWarning"] = warning;
            if (document == null || error != 0) throw new InvalidDataException("oracle_document_open_failed");
            var configurations = new List<object>();
            receipt["stage"] = "rebuild_and_inspect_components";
            receipt["savedActiveConfiguration"] = document.ConfigurationManager.ActiveConfiguration.Name;
            foreach (object rawName in (Array)document.GetConfigurationNames())
            {
                string name = Convert.ToString(rawName);
                receipt["configuration"] = name;
                if (!String.Equals(document.ConfigurationManager.ActiveConfiguration.Name, name, StringComparison.Ordinal)) document.ShowConfiguration2(name);
                if (!String.Equals(document.ConfigurationManager.ActiveConfiguration.Name, name, StringComparison.Ordinal)) throw new InvalidDataException("oracle_configuration_switch_failed");
                IAssemblyDoc assembly = (IAssemblyDoc)document;
                assembly.ResolveAllLightWeightComponents(false);
                if (assembly.GetLightWeightComponentCount() != 0) throw new InvalidDataException("oracle_lightweight_components_unresolved");
                if (!(bool)document.ForceRebuild3(false)) throw new InvalidDataException("oracle_rebuild_failed");
                IConfiguration config = (IConfiguration)document.GetConfigurationByName(name);
                IComponent2 root = config.GetRootComponent3(true);
                var rows = new List<object>(); Traverse(root, "root", rows, 0, verifyDownload ? output : null);
                var configuration = new Dictionary<string, object> { { "name", name }, { "rows", rows }, { "rebuilt", true } };
                if (verifyDownload) {
                    receipt["stage"] = "read_solidworks_bom_table";
                    configuration["nativeBom"] = ReadBom(document, name, Path.GetDirectoryName(executable));
                }
                configurations.Add(configuration);
            }
            receipt["configurations"] = configurations;
            if (verifyDownload) { receipt["status"] = "succeeded"; receipt["downloadOpenedAndRebuilt"] = true; return 0; }
            IModelDocExtension extension = document.Extension; PackAndGo pack = extension.GetPackAndGo();
            pack.IncludeDrawings = false; pack.IncludeSimulationResults = false; pack.IncludeSuppressed = true; pack.FlattenToSingleFolder = false;
            object names = null; if (!(bool)pack.GetDocumentNames(out names)) throw new InvalidDataException("oracle_pack_names_failed");
            receipt["packageSourceNames"] = names;
            string zip = Path.Combine(output, Path.GetFileNameWithoutExtension(source) + "-PackAndGo.zip");
            if (File.Exists(zip) || !(bool)pack.SetSaveToName(true, zip)) throw new InvalidDataException("oracle_pack_target_invalid");
            object statuses = extension.SavePackAndGo(pack); receipt["packageSaveStatuses"] = statuses;
            Array saved = statuses as Array;
            if (saved == null || saved.Length != ((Array)names).Length) throw new InvalidDataException("oracle_pack_status_missing");
            foreach (object code in saved) if (Convert.ToInt32(code) != 0) throw new InvalidDataException("oracle_pack_entry_failed");
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
            receipt["errorType"] = error.GetType().Name; receipt["hresult"] = error.HResult.ToString("X8"); return 1;
        }
        finally
        {
            if (bound && application != null) { try { ((ISldWorks)application).ExitApp(); } catch { } }
            if (application != null && Marshal.IsComObject(application)) Marshal.ReleaseComObject(application);
            IMessageFilter removed; CoRegisterMessageFilter(previous, out removed);
            if (process != null) { try { if (!preserveSession && !process.HasExited && !process.WaitForExit(10000)) process.Kill(); receipt["processExited"] = process.HasExited || (!preserveSession && process.WaitForExit(10000)); } catch { receipt["processExited"] = false; } process.Dispose(); }
            string text = Json.Serialize(receipt); Console.Out.Write(text);
            if (args.Length >= 3 && Directory.Exists(args[2])) File.WriteAllText(Path.Combine(args[2], "solidworks-oracle.json"), text);
        }
    }
    private static List<object> ReadBom(IModelDoc2 document, string configuration, string installDir)
    {
        // Build an in-memory indented BOM with the vendor's standard template.
        // Reading its displayed quantity also captures custom quantity semantics.
        string template = Path.Combine(installDir, "lang", "english", "bom-standard.sldbomtbt");
        IBomTableAnnotation bom = (IBomTableAnnotation)document.Extension.InsertBomTable4(template, 0, 0, 3, configuration, true, 1, false, false);
        if (bom == null) throw new InvalidDataException("oracle_bom_table_missing");
        ITableAnnotation table = (ITableAnnotation)bom;
        int quantityColumn = -1;
        for (int column = 0; column < table.ColumnCount; column++) {
            if (table.GetColumnType2(column, false) == 203) { quantityColumn = column; break; } // swBomTableColumnType_Quantity
        }
        if (quantityColumn < 0) throw new InvalidDataException("oracle_bom_quantity_column_missing");
        var rows = new List<object>();
        for (int row = 0; row < table.RowCount; row++) {
            string itemNumber, partNumber;
            int count = bom.GetComponentsCount2(row, "", out itemNumber, out partNumber);
            if (count == 0) continue;
            var sources = new List<string>();
            foreach (IComponent2 component in (Array)bom.GetComponents2(row, "")) sources.Add(component.Name2);
            rows.Add(new { itemNumber, partNumber, occurrenceCount = count, quantity = table.get_DisplayedText2(row, quantityColumn, false), sources });
        }
        return rows;
    }
    private static void Traverse(IComponent2 parent, string parentName, List<object> rows, int depth, string packageDirectory)
    {
        if (depth > 64 || rows.Count > 50000) throw new InvalidDataException("oracle_graph_limit");
        Array children = parent.GetChildren() as Array; if (children == null) return;
        foreach (IComponent2 component in children)
        {
            string name = Convert.ToString(component.Name2);
            rows.Add(new Dictionary<string, object> { { "parent", parentName }, { "name", name }, { "path", Convert.ToString(component.GetPathName()) }, { "configuration", Convert.ToString(component.ReferencedConfiguration) }, { "suppressed", (bool)component.IsSuppressed() }, { "excludeFromBom", (bool)component.ExcludeFromBOM }, { "id", (int)component.GetID() } });
            if (!(bool)component.IsSuppressed()) {
                if (packageDirectory != null && !(bool)component.IsVirtual) {
                    IModelDoc2 loaded = (IModelDoc2)component.GetModelDoc2();
                    if (loaded == null) throw new InvalidDataException("oracle_component_unresolved");
                    string path = Convert.ToString(loaded.GetPathName());
                    if (!Path.IsPathRooted(path) || !File.Exists(path) || !Path.GetFullPath(path).StartsWith(packageDirectory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("oracle_component_loaded_outside_package");
                }
                Traverse(component, name, rows, depth + 1, packageDirectory);
            }
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
