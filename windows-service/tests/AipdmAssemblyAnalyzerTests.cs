using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Reflection;
using SolidWorks.Interop.swdocumentmgr;

internal static class AipdmAssemblyAnalyzerTests
{
    private static int Count;
    private static void Check(bool condition, string name) { if (!condition) throw new Exception("FAILED: " + name); Count++; }
    private static void Reject(Action action, string code) { try { action(); } catch (InvalidDataException error) { Check(error.Message == code, code); return; } throw new Exception("FAILED: expected " + code); }
    private static AipdmAssemblyAnalyzer.Entry Entry(string key, string relative, byte[] bytes)
    {
        string hash; using (SHA256 algorithm = SHA256.Create()) hash = BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        return new AipdmAssemblyAnalyzer.Entry { entryKey = key, relativePath = relative, byteSize = bytes.Length, sha256 = hash };
    }
    private static void VerifyVirtualNativeSeam(string root, AipdmAssemblyAnalyzer.Entry main)
    {
        // The production Load() still requires the signed official interop.
        // Only this test creates the runtime over managed API doubles.
        var runtime = (SolidWorksDocumentManagerRuntime)Activator.CreateInstance(typeof(SolidWorksDocumentManagerRuntime), BindingFlags.Instance | BindingFlags.NonPublic, null, new object[] { typeof(object), "managed-test-only", "managed-test-only", typeof(FakeNativeComponent).Assembly }, null);
        var request = new AipdmAssemblyAnalyzer.Request { root = root, entries = new AipdmAssemblyAnalyzer.Entry[] { main } };
        var parent = new FakeNativeDocument(); var child = new FakeNativeComponent(); var nested = new FakeNativeComponent { Id = 9 };
        child.Type = 2; child.Document.Config.Components = new object[] { nested }; parent.Config.Components = new object[] { child };
        Type scanType = typeof(AipdmAssemblyAnalyzer).GetNestedType("Scan", BindingFlags.NonPublic);
        object scan = Activator.CreateInstance(scanType, true);
        MethodInfo walk = typeof(AipdmAssemblyAnalyzer).GetMethod("Walk", BindingFlags.Static | BindingFlags.NonPublic);
        walk.Invoke(null, new object[] { runtime, new FakeNativeApplication(), request, main, "Default", main.entryKey, main.entryKey, true, false, 0, scan, parent, true, main.entryKey + ":managed-root" });
        var rows = (List<object>)scanType.GetField("Rows", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(scan);
        var issues = (List<object>)scanType.GetField("Issues", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(scan);
        Check(rows.Count == 2 && issues.Count == 0, "native-seam virtual hierarchy has complete reference result");
        var first = (Dictionary<string, object>)rows[0]; var second = (Dictionary<string, object>)rows[1];
        Check((string)first["quantity"] == "1" && (string)second["quantity"] == "1" && (string)second["unit"] == "EA", "native-seam embedded components use saved default quantity");
        Check((string)second["parentKey"] == (string)first["occurrenceKey"], "nested embedded source binds parent occurrence");
        Check((string)first["entryKey"] == main.entryKey && (string)second["virtualOwnerEntryKey"] == main.entryKey, "embedded bytes remain bound to owner manifest entry");
        Check(child.EmbeddedOpenCount == 1 && nested.EmbeddedOpenCount == 1 && child.Document.CloseCount == 1 && nested.Document.CloseCount == 1, "embedded native documents open read-only and close exactly once");
        Check(!((string)first["reference"]).Contains("C:"), "native-seam rows omit original absolute reference");
        Func<List<object>> run = delegate {
            object nextScan = Activator.CreateInstance(scanType, true);
            walk.Invoke(null, new object[] { runtime, new FakeNativeApplication(), request, main, "Default", main.entryKey, main.entryKey, true, false, 0, nextScan, parent, true, main.entryKey + ":managed-root" });
            Check(((List<object>)scanType.GetField("Issues", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(nextScan)).Count == 0, "managed native-seam core case retains complete refs");
            return (List<object>)scanType.GetField("Rows", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(nextScan);
        };
        child.Hidden = true; rows = run();
        Check((bool)((Dictionary<string, object>)rows[0])["hidden"] && (string)((Dictionary<string, object>)rows[0])["disposition"] != "excluded", "hidden display does not exclude material");
        child.Hidden = false; child.Exclusion = 1; rows = run();
        Check((string)((Dictionary<string, object>)rows[0])["disposition"] == "excluded" && (string)((Dictionary<string, object>)rows[1])["disposition"] == "excluded", "excluded assembly excludes its subtree but keeps refs");
        Check((string)((Dictionary<string, object>)rows[0])["quantity"] == "1", "excluded rows never return forbidden zero quantity");
        child.Exclusion = 0; child.Document.Config.Display = 0; int nestedBefore = nested.EmbeddedOpenCount; rows = run();
        Check(rows.Count == 1 && nested.EmbeddedOpenCount > nestedBefore, "hide child BOM display still checks nested references");
        child.Document.Config.Display = 2; rows = run();
        Check(rows.Count == 1 && (string)((Dictionary<string, object>)rows[0])["parentKey"] == main.entryKey, "promote dissolves embedded assembly exactly one BOM level");
        child.Document.Config.Display = 1; child.Suppressed = true; int childBefore = child.EmbeddedOpenCount; rows = run();
        Check(rows.Count == 1 && child.EmbeddedOpenCount == childBefore && (string)((Dictionary<string, object>)rows[0])["disposition"] == "excluded", "suppressed source is retained without loading its document");
        child.Suppressed = false;
        var repeated = new FakeNativeComponent { Id = 8, Type = 2 }; repeated.Document.Config.Components = new object[] { new FakeNativeComponent { Id = 9 } }; parent.Config.Components = new object[] { child, repeated }; rows = run();
        Check(rows.Count == 4 && (string)((Dictionary<string, object>)rows[1])["parentKey"] != (string)((Dictionary<string, object>)rows[3])["parentKey"], "repeated subassembly occurrences retain separate parents");
        nested.Document.Features = new string[] { @"C:\outside\BaseOnly.SLDPRT" };
        object featureScan = Activator.CreateInstance(scanType, true);
        walk.Invoke(null, new object[] { runtime, new FakeNativeApplication(), request, main, "Default", main.entryKey, main.entryKey, true, false, 0, featureScan, parent, true, main.entryKey + ":managed-root" });
        Check((bool)scanType.GetField("Blocked", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(featureScan), "missing nested virtual geometry reference cannot pass containment-only checks");
        Check(((List<object>)scanType.GetField("Rows", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(featureScan)).Count == 4, "feature-reference failure retains independent BOM rows");
        child.Virtual = false;
        try { int error; runtime.OpenVirtualAssemblyDocument(child, out error); throw new Exception("FAILED: external component accessor allowed"); }
        catch (InvalidOperationException error) { Check(error.Message == "ASSEMBLY_EMBEDDED_SOURCE_REQUIRED", "external components cannot enter embedded accessor"); }
    }
    private static int Main()
    {
        string directory = Path.Combine(Path.GetTempPath(), "aipdm-dev129-native-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            foreach (string path in new string[] { "../main.SLDASM", "/main.SLDASM", "C:/main.SLDASM", "a//main.SLDASM", "aux.SLDASM", "main.SLDASM:stream", "a./main.SLDASM", "COM¹.SLDASM" }) Reject(delegate { AipdmAssemblyAnalyzer.SafeRelativePath(path); }, "assembly_manifest_path_invalid");
            Check(AipdmAssemblyAnalyzer.SafeRelativePath("dir\\main.SLDASM") == "dir/main.SLDASM", "Windows path normalization");
            byte[] bytes = Encoding.UTF8.GetBytes("synthetic CAD for boundary tests only"); File.WriteAllBytes(Path.Combine(directory, "main.SLDASM"), bytes);
            var main = Entry("main", "main.SLDASM", bytes); var child = Entry("part", "dir/part.SLDPRT", bytes);
            var request = new AipdmAssemblyAnalyzer.Request { root = directory, entries = new AipdmAssemblyAnalyzer.Entry[] { main }, deliveryConfigurations = new string[0] };
            AipdmAssemblyAnalyzer.VerifyManifest(request); Check(main.absolutePath == Path.Combine(directory, "main.SLDASM"), "manifest path binding");
            string oldKey = Environment.GetEnvironmentVariable("PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY"), oldAlias = Environment.GetEnvironmentVariable("PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY"), oldAlias2 = Environment.GetEnvironmentVariable("SOLIDWORKS_DOCUMENT_MANAGER_KEY");
            try
            {
                Environment.SetEnvironmentVariable("PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY", null); Environment.SetEnvironmentVariable("PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY", null); Environment.SetEnvironmentVariable("SOLIDWORKS_DOCUMENT_MANAGER_KEY", null);
                Dictionary<string, object> result = AipdmAssemblyAnalyzer.Analyze(request); Check((string)result["status"] == "blocked" && (string)result["diagnostic"] == "assembly_document_manager_license_missing", "missing license cannot pass");
            }
            finally { Environment.SetEnvironmentVariable("PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY", oldKey); Environment.SetEnvironmentVariable("PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY", oldAlias); Environment.SetEnvironmentVariable("SOLIDWORKS_DOCUMENT_MANAGER_KEY", oldAlias2); }
            var entries = new AipdmAssemblyAnalyzer.Entry[] { main, child };
            Check(AipdmAssemblyAnalyzer.ResolveReference(main, "dir/part.SLDPRT", entries) == child, "explicit package-relative reference");
            Check(AipdmAssemblyAnalyzer.ResolveReference(main, @"C:\original\dir\part.SLDPRT", entries) == null, "saved absolute path cannot select a same-named file");
            Check(AipdmAssemblyAnalyzer.ResolveReference(main, "part.SLDPRT", entries) == null, "basename cannot guess nested package path");
            Check(AipdmAssemblyAnalyzer.ResolveReference(child, "../main.SLDASM", entries) == null, "reference traversal refuses before file I/O");
            var origins = new Dictionary<string, string>(StringComparer.Ordinal); bool conflict;
            Check(AipdmAssemblyAnalyzer.ResolveComponentReference(main, @"C:\original\dir\part.SLDPRT", entries, origins, out conflict) == child && !conflict, "containment relocation maps a unique complete package path suffix");
            Check(AipdmAssemblyAnalyzer.ResolveComponentReference(main, @"C:\original\dir\part.SLDPRT", entries, origins, out conflict) == child && !conflict, "repeated native instances retain one saved source identity");
            Check(AipdmAssemblyAnalyzer.ResolveComponentReference(main, @"D:\different\dir\part.SLDPRT", entries, origins, out conflict) == null && conflict, "different original paths cannot collapse onto one package entry");
            var unmatched = Entry("other", "elsewhere/part.SLDPRT", bytes);
            Check(AipdmAssemblyAnalyzer.ResolveComponentReference(main, @"C:\source\part.SLDPRT", new AipdmAssemblyAnalyzer.Entry[] {child,unmatched}, new Dictionary<string,string>(), out conflict) == null && conflict, "duplicate basenames under unrelated directories are an explicit ambiguity");
            child.absolutePath = Path.Combine(directory, "dir", "part.SLDPRT"); var directOrigins = new Dictionary<string,string>();
            Check(AipdmAssemblyAnalyzer.ResolveComponentReference(main, child.absolutePath, entries, directOrigins, out conflict) == child, "exact package absolute containment source establishes its identity");
            Check(AipdmAssemblyAnalyzer.ResolveComponentReference(main, @"D:\different\dir\part.SLDPRT", entries, directOrigins, out conflict) == null && conflict, "exact path and a distinct saved alias cannot collapse into one entry");
            Check(AipdmAssemblyAnalyzer.ResolveReference(main, main.absolutePath, entries) == main, "native actual package absolute path binds exact manifest source");
            Check(AipdmAssemblyAnalyzer.SafeReferenceLabel(@"C:\Users\private\secret\part.SLDPRT") == "part.SLDPRT", "absolute original reference is not returned");
            Check(AipdmAssemblyAnalyzer.SafeReferenceLabel(@"\\server\share\part.SLDPRT") == "part.SLDPRT", "UNC reference is not returned");
            string quantity, unit, source;
            var properties = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            AipdmAssemblyAnalyzer.ReadQuantity(properties, out quantity, out unit, out source); Check(quantity == "1" && unit == "EA" && source == "component_instance_count", "default quantity is one per occurrence");
            properties["UNIT_OF_MEASURE"] = "Length"; properties["Length"] = "1.2500"; properties["Unit"] = "m";
            AipdmAssemblyAnalyzer.ReadQuantity(properties, out quantity, out unit, out source); Check(quantity == "1.25" && unit == "m", "saved custom decimal quantity and unit");
            properties.Remove("Unit"); AipdmAssemblyAnalyzer.ReadQuantity(properties, out quantity, out unit, out source); Check(quantity == null && unit == null, "unknown custom unit never invents EA");
            properties["Unit"] = "m"; properties["Length"] = "$PRP:Unsaved"; AipdmAssemblyAnalyzer.ReadQuantity(properties, out quantity, out unit, out source); Check(quantity == null, "unresolved quantity expression remains unknown");
            properties["Length"] = "0"; AipdmAssemblyAnalyzer.ReadQuantity(properties, out quantity, out unit, out source); Check(quantity == null, "zero use cannot be published as positive quantity");
            var graph = new Dictionary<string, HashSet<string>> { { "root", new HashSet<string> { "sub" } }, { "sub", new HashSet<string>() } };
            Check(AipdmAssemblyAnalyzer.UniqueAssemblyRoot(graph) == "root", "nested package auto-selects its unique graph root");
            graph["sub"].Add("root"); Check(AipdmAssemblyAnalyzer.UniqueAssemblyRoot(graph) == null, "cyclic assembly graph cannot choose a root");
            graph["sub"].Clear(); graph["parallel"] = new HashSet<string>(); Check(AipdmAssemblyAnalyzer.UniqueAssemblyRoot(graph) == null, "parallel assembly graphs require selection");
            string originalHash = main.sha256; main.sha256 = new string('0', 64); Reject(delegate { AipdmAssemblyAnalyzer.VerifyManifest(request); }, "assembly_manifest_hash_mismatch"); main.sha256 = originalHash;
            main.byteSize++; Reject(delegate { AipdmAssemblyAnalyzer.VerifyManifest(request); }, "assembly_manifest_size_mismatch"); main.byteSize--;
            request.mainEntryKey = "missing"; Reject(delegate { AipdmAssemblyAnalyzer.Analyze(request); }, "assembly_main_selection_invalid"); request.mainEntryKey = null;
            request.entries = new AipdmAssemblyAnalyzer.Entry[] { main, main }; Reject(delegate { AipdmAssemblyAnalyzer.VerifyManifest(request); }, "assembly_manifest_invalid");
            VerifyVirtualNativeSeam(directory, main);
            Console.WriteLine("{\"status\":\"passed\",\"cases\":" + Count + ",\"nativeCadAcceptance\":false}"); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
        finally { Directory.Delete(directory, true); }
    }
}
