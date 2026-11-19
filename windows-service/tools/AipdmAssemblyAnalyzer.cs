using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

/** Read-only Document Manager analyzer. Every opened document is a verified
 * manifest entry, or an IsVirtual-guarded embedded component of that document.
 * Never calls external Component.GetDocument[2], ReplaceReference or Save.
 * Native reference lookup has package-only search paths; a native result outside
 * the manifest is rejected and is never opened or used as replacement bytes. */
internal static class AipdmAssemblyAnalyzer
{
    private const string ParserVersion = "solidworks-document-manager.assembly.v2";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 128 };
    internal sealed class Request { public string root { get; set; } public Entry[] entries { get; set; } public string mainEntryKey { get; set; } public string[] deliveryConfigurations { get; set; } }
    internal sealed class Entry { public string entryKey { get; set; } public string relativePath { get; set; } public string sha256 { get; set; } public long byteSize { get; set; } internal string absolutePath; }
    private sealed class Scan
    {
        internal readonly List<object> Rows = new List<object>();
        internal readonly List<object> Issues = new List<object>();
        internal readonly HashSet<string> Stack = new HashSet<string>(StringComparer.Ordinal);
        internal readonly HashSet<string> ReferenceVisited = new HashSet<string>(StringComparer.Ordinal);
        internal readonly HashSet<string> ReferenceActiveFiles = new HashSet<string>(StringComparer.Ordinal);
        internal Dictionary<string, string> ComponentOrigins = new Dictionary<string, string>(StringComparer.Ordinal);
        internal int Count;
        internal bool Blocked;
        internal bool Unknown;
        internal void Issue(string code, Entry parent, string reference, bool blocked)
        {
            Issues.Add(new Dictionary<string, object> { { "code", code }, { "parentKey", parent.entryKey }, { "reference", SafeReferenceLabel(reference) } });
            if (blocked) Blocked = true; else Unknown = true;
        }
    }
    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length != 1 || !Path.IsPathRooted(args[0])) throw new InvalidDataException("assembly_request_invalid");
            var info = new FileInfo(args[0]); if (!info.Exists || info.Length > 8 * 1024 * 1024) throw new InvalidDataException("assembly_request_invalid");
            Request request = Json.Deserialize<Request>(File.ReadAllText(args[0], Encoding.UTF8));
            Console.Out.Write(Json.Serialize(Analyze(request)));
            return 0; // A structured blocked/needs_input result is a successfully delivered analysis.
        }
        catch (Exception error)
        {
            string code = error is InvalidDataException ? error.Message : "assembly_native_reader_failed";
            Console.Out.Write(Json.Serialize(Result("blocked", null, new string[0], new string[0], new object[0], code)));
            return 0;
        }
    }
    private static Dictionary<string, object> Result(string status, string main, IList<string> candidates, IList<string> names, IList<object> configurations, string diagnostic)
    {
        return new Dictionary<string, object> { { "version", 1 }, { "parserVersion", ParserVersion }, { "status", status }, { "mainEntryKey", main }, { "mainCandidates", candidates }, { "configurationNames", names }, { "configurations", configurations }, { "diagnostic", diagnostic } };
    }
    internal static string SafeRelativePath(string value)
    {
        string normalized = (value ?? "").Replace('\\', '/').Normalize(NormalizationForm.FormC);
        if (normalized.Length == 0 || normalized.Length > 1024 || normalized.StartsWith("/", StringComparison.Ordinal) || Regex.IsMatch(normalized, "[\\x00-\\x1f\\x7f<>:\"|?*]")) throw new InvalidDataException("assembly_manifest_path_invalid");
        foreach (string part in normalized.Split('/'))
            if (part.Length == 0 || part.Length > 255 || part == "." || part == ".." || part.EndsWith(".", StringComparison.Ordinal) || part.EndsWith(" ", StringComparison.Ordinal) || Regex.IsMatch(part, "^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(\\.|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) throw new InvalidDataException("assembly_manifest_path_invalid");
        return normalized;
    }
    internal static void VerifyManifest(Request request)
    {
        if (request == null || String.IsNullOrWhiteSpace(request.root) || !Path.IsPathRooted(request.root) || request.entries == null || request.entries.Length == 0 || request.entries.Length > 10000) throw new InvalidDataException("assembly_manifest_invalid");
        string root = Path.GetFullPath(request.root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!Directory.Exists(root) || (File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("assembly_staging_root_invalid");
        // Check the entire ancestor chain, not just the final extraction directory.
        for (DirectoryInfo ancestor = Directory.GetParent(root); ancestor != null; ancestor = ancestor.Parent)
            if ((ancestor.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("assembly_staging_root_invalid");
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var keys = new HashSet<string>(StringComparer.Ordinal); long expanded = 0;
        foreach (Entry entry in request.entries)
        {
            if (entry == null || String.IsNullOrWhiteSpace(entry.entryKey) || !keys.Add(entry.entryKey) || entry.byteSize < 0 || !Regex.IsMatch(entry.sha256 ?? "", "^[a-f0-9]{64}$")) throw new InvalidDataException("assembly_manifest_invalid");
            entry.relativePath = SafeRelativePath(entry.relativePath); if (!paths.Add(entry.relativePath)) throw new InvalidDataException("assembly_manifest_alias");
            expanded += entry.byteSize; if (expanded > 2L * 1024 * 1024 * 1024) throw new InvalidDataException("assembly_manifest_limit");
            string current = root;
            foreach (string part in entry.relativePath.Split('/')) { current = Path.Combine(current, part); if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("assembly_manifest_link"); }
            entry.absolutePath = Path.GetFullPath(current);
            if (!entry.absolutePath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("assembly_manifest_path_invalid");
            var info = new FileInfo(entry.absolutePath); if (!info.Exists || info.Length != entry.byteSize) throw new InvalidDataException("assembly_manifest_size_mismatch");
            using (FileStream file = new FileStream(entry.absolutePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (SHA256 hash = SHA256.Create())
                if (BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant() != entry.sha256) throw new InvalidDataException("assembly_manifest_hash_mismatch");
        }
    }
    /** Resolves only explicit package-relative paths. Absolute saved paths are
     * evidence, never a reason to open a same-named file or the original source. */
    internal static Entry ResolveReference(Entry parent, string reference, Entry[] entries)
    {
        if (String.IsNullOrWhiteSpace(reference)) return null;
        if (Path.IsPathRooted(reference)) { foreach (Entry entry in entries) if (entry.absolutePath != null && String.Equals(Path.GetFullPath(reference), entry.absolutePath, StringComparison.OrdinalIgnoreCase)) return entry; return null; }
        if (reference.IndexOf(':') >= 0) return null;
        string value; try { value = SafeRelativePath(reference); } catch { return null; }
        string parentDirectory = Path.GetDirectoryName(parent.relativePath.Replace('/', Path.DirectorySeparatorChar)) ?? "";
        string adjacent = (parentDirectory.Length == 0 ? "" : parentDirectory.Replace('\\', '/') + "/") + value;
        Entry result = null;
        foreach (Entry entry in entries)
            if (String.Equals(entry.relativePath, adjacent, StringComparison.OrdinalIgnoreCase)) { if (result != null) return null; result = entry; }
        if (result != null) return result;
        foreach (Entry entry in entries)
            if (String.Equals(entry.relativePath, value, StringComparison.OrdinalIgnoreCase)) { if (result != null) return null; result = entry; }
        return result;
    }
    internal static string SafeReferenceLabel(string reference)
    {
        string value = (reference ?? "").Replace('\\', '/');
        if (Path.IsPathRooted(reference ?? "") || value.IndexOf(':') >= 0) { int slash = value.LastIndexOf('/'); value = slash < 0 ? "reference" : value.Substring(slash + 1); }
        try { return SafeRelativePath(value); } catch { return "reference"; }
    }
    /** Assembly containment uses the ZIP's explicit safe Windows paths as a
     * relocation map. Never use this map for feature/external geometry coverage.
     * Distinct saved absolute origins cannot collapse into one package entry. */
    internal static Entry ResolveComponentReference(Entry parent, string reference, Entry[] entries, Dictionary<string, string> origins, out bool conflict)
    {
        conflict = false;
        Entry selected = ResolveReference(parent, reference, entries);
        if (selected != null && !Path.IsPathRooted(reference)) return selected;
        if (String.IsNullOrWhiteSpace(reference) || !Path.IsPathRooted(reference)) return null;
        string normalized = reference.Replace('\\', '/').Normalize(NormalizationForm.FormC).ToUpperInvariant();
        if (normalized.Split('/').Length > 128) return null;
        foreach (string segment in normalized.Split('/')) if (segment == "." || segment == "..") return null;
        int longest = -1;
        if (selected == null) foreach (Entry entry in entries)
        {
            string relative = entry.relativePath.Normalize(NormalizationForm.FormC).ToUpperInvariant();
            if (!normalized.EndsWith("/" + relative, StringComparison.Ordinal)) continue;
            int score = relative.Split('/').Length;
            if (score > longest) { selected = entry; longest = score; conflict = false; }
            else if (score == longest) { selected = null; conflict = true; }
        }
        if (selected == null)
        {
            int basenameMatches = 0; string basename = SafeReferenceLabel(reference);
            foreach (Entry entry in entries) if (String.Equals(Path.GetFileName(entry.relativePath), basename, StringComparison.OrdinalIgnoreCase)) basenameMatches++;
            if (basenameMatches > 1) conflict = true;
            return null;
        }
        string previous;
        if (origins.TryGetValue(selected.entryKey, out previous) && previous != normalized) { conflict = true; return null; }
        origins[selected.entryKey] = normalized;
        return selected;
    }
    internal static Dictionary<string, object> Analyze(Request request)
    {
        VerifyManifest(request);
        var candidates = new List<string>(); Entry main = null;
        foreach (Entry entry in request.entries) if (String.Equals(Path.GetExtension(entry.relativePath), ".sldasm", StringComparison.OrdinalIgnoreCase)) { candidates.Add(entry.entryKey); if (entry.entryKey == request.mainEntryKey) main = entry; }
        if (candidates.Count == 0) throw new InvalidDataException("assembly_manifest_main_missing");
        if (!String.IsNullOrWhiteSpace(request.mainEntryKey) && main == null) throw new InvalidDataException("assembly_main_selection_invalid");
        if (main == null && candidates.Count == 1) foreach (Entry entry in request.entries) if (entry.entryKey == candidates[0]) main = entry;
        string key = ReadLicenseKey();
        if (String.IsNullOrWhiteSpace(key)) return Result("blocked", main == null ? null : main.entryKey, candidates, new string[0], new object[0], "assembly_document_manager_license_missing");
        SolidWorksDocumentManagerRuntime runtime = SolidWorksDocumentManagerRuntime.Load(); object app = null, document = null, manager = null;
        try
        {
            app = runtime.CreateApplication(key); key = null;
            if (app == null) return Result("blocked", main == null ? null : main.entryKey, candidates, new string[0], new object[0], "assembly_document_manager_license_invalid");
            if (main == null) main = FindMain(runtime, app, request, candidates);
            if (main == null) return Result("needs_input", null, candidates, new string[0], new object[0], "assembly_main_selection_required");
            document = Open(runtime, app, main); manager = runtime.GetConfigurationManager(document); int error;
            var names = Strings(runtime.GetConfigurationNames(manager, out error));
            if (error != 0 || names.Count == 0) return Result("needs_input", main.entryKey, candidates, names, new object[0], "assembly_configuration_unavailable");
            var selected = new List<string>();
            foreach (string name in request.deliveryConfigurations ?? new string[0]) { if (!names.Contains(name)) return Result("needs_input", main.entryKey, candidates, names, new object[0], "assembly_configuration_selection_invalid"); if (!selected.Contains(name)) selected.Add(name); }
            if (selected.Count == 0) { string active = ""; try { active = runtime.GetActiveConfigurationName(manager); } catch { } if (!names.Contains(active)) return Result("needs_input", main.entryKey, candidates, names, new object[0], "assembly_active_configuration_unknown"); selected.Add(active); }
            runtime.CloseDocument(document); SolidWorksDocumentManagerRuntime.Release(manager); manager = null; SolidWorksDocumentManagerRuntime.Release(document); document = null;
            var configurations = new List<object>(); bool blocked = false, unknown = false;
            var componentOrigins = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string name in selected)
            {
                Scan scan = new Scan(); scan.ComponentOrigins = componentOrigins; Walk(runtime, app, request, main, name, main.entryKey, main.entryKey, true, false, 0, scan);
                configurations.Add(new Dictionary<string, object> { { "name", name }, { "references", new Dictionary<string, object> { { "status", scan.Blocked ? "blocked" : scan.Unknown ? "unknown" : "passed" }, { "issues", scan.Issues } } }, { "bom", new Dictionary<string, object> { { "rows", scan.Rows } } } });
                blocked |= scan.Blocked; unknown |= scan.Unknown;
            }
            return Result(blocked ? "blocked" : unknown ? "needs_input" : "complete", main.entryKey, candidates, names, configurations, unknown ? "assembly_native_capability_unverified" : null);
        }
        finally
        {
            if (document != null) { try { runtime.CloseDocument(document); } catch { } }
            SolidWorksDocumentManagerRuntime.Release(manager); SolidWorksDocumentManagerRuntime.Release(document); SolidWorksDocumentManagerRuntime.Release(app);
        }
    }
    private static object Open(SolidWorksDocumentManagerRuntime runtime, object app, Entry entry)
    {
        int type = String.Equals(Path.GetExtension(entry.relativePath), ".sldasm", StringComparison.OrdinalIgnoreCase) ? 2 : 1; int error;
        object document = runtime.OpenDocument(app, entry.absolutePath, type, out error);
        if (document == null || error != 0) { SolidWorksDocumentManagerRuntime.Release(document); throw new InvalidDataException("assembly_document_open_failed"); }
        string opened = Convert.ToString(runtime.AssemblyProperty("ISwDMDocument", document, "FullName"));
        if (!String.Equals(Path.GetFullPath(opened), entry.absolutePath, StringComparison.OrdinalIgnoreCase)) { runtime.CloseDocument(document); SolidWorksDocumentManagerRuntime.Release(document); throw new InvalidDataException("assembly_document_source_mismatch"); }
        return document;
    }
    internal static string UniqueAssemblyRoot(Dictionary<string, HashSet<string>> graph)
    {
        var incoming = new HashSet<string>(StringComparer.Ordinal);
        foreach (var pair in graph) foreach (string child in pair.Value) { if (!graph.ContainsKey(child)) return null; incoming.Add(child); }
        string root = null;
        foreach (string candidate in graph.Keys) if (!incoming.Contains(candidate)) { if (root != null) return null; root = candidate; }
        if (root == null) return null;
        // The unique root must reach every assembly, with no component cycles.
        var completed = new HashSet<string>(StringComparer.Ordinal); var active = new HashSet<string>(StringComparer.Ordinal);
        return VisitGraph(root, graph, active, completed) && completed.Count == graph.Count ? root : null;
    }
    private static bool VisitGraph(string node, Dictionary<string, HashSet<string>> graph, HashSet<string> active, HashSet<string> completed)
    {
        if (completed.Contains(node)) return true; if (active.Count > 64 || !active.Add(node)) return false;
        foreach (string child in graph[node]) if (!VisitGraph(child, graph, active, completed)) return false;
        active.Remove(node); completed.Add(node); return true;
    }
    private static Entry FindMain(SolidWorksDocumentManagerRuntime runtime, object app, Request request, List<string> candidates)
    {
        var graph = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var origins = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (string key in candidates) graph[key] = new HashSet<string>(StringComparer.Ordinal);
        foreach (Entry entry in request.entries)
        {
            if (!graph.ContainsKey(entry.entryKey)) continue;
            object document = null;
            try
            {
                document = Open(runtime, app, entry); int count = 0;
                if (!CollectAssemblyEdges(runtime, document, entry, request.entries, graph[entry.entryKey], origins, 0, ref count)) return null;
            }
            catch { return null; }
            finally { if (document != null) { try { runtime.CloseDocument(document); } catch { } } SolidWorksDocumentManagerRuntime.Release(document); }
        }
        string root = UniqueAssemblyRoot(graph); foreach (Entry entry in request.entries) if (entry.entryKey == root) return entry; return null;
    }
    private static bool CollectAssemblyEdges(SolidWorksDocumentManagerRuntime runtime, object document, Entry owner, Entry[] entries, HashSet<string> edges, Dictionary<string, string> origins, int depth, ref int count)
    {
        if (depth > 64 || count > 50000) return false;
        object manager = null;
        try
        {
            manager = runtime.GetConfigurationManager(document); int error;
            var names = Strings(runtime.GetConfigurationNames(manager, out error)); if (error != 0 || names.Count == 0) return false;
            foreach (string name in names)
            {
                object configuration = runtime.GetConfigurationByName(manager, name, out error);
                if (configuration == null || error != 0) { SolidWorksDocumentManagerRuntime.Release(configuration); return false; }
                try
                {
                    Array components = runtime.AssemblyInvoke("ISwDMConfiguration2", configuration, "GetComponents") as Array; if (components == null) return false;
                    foreach (object component in components)
                    {
                        object embedded = null;
                        try
                        {
                            if (++count > 50000) return false;
                            bool isVirtual = Convert.ToBoolean(runtime.AssemblyProperty("ISwDMComponent3", component, "IsVirtual"));
                            if (isVirtual)
                            {
                                if (Convert.ToInt32(runtime.AssemblyProperty("ISwDMComponent2", component, "DocumentType")) == 2)
                                {
                                    embedded = runtime.OpenVirtualAssemblyDocument(component, out error);
                                    if (embedded == null || error != 0 || !CollectAssemblyEdges(runtime, embedded, owner, entries, edges, origins, depth + 1, ref count)) return false;
                                }
                            }
                            else
                            {
                                string reference = Convert.ToString(runtime.AssemblyProperty("ISwDMComponent6", component, "PathName"));
                                if (String.Equals(Path.GetExtension(reference), ".sldasm", StringComparison.OrdinalIgnoreCase)) { bool conflict; Entry child = ResolveComponentReference(owner, reference, entries, origins, out conflict); if (child == null) return false; edges.Add(child.entryKey); }
                            }
                        }
                        finally { if (embedded != null) { try { runtime.CloseDocument(embedded); } catch { } SolidWorksDocumentManagerRuntime.Release(embedded); } SolidWorksDocumentManagerRuntime.Release(component); }
                    }
                }
                finally { SolidWorksDocumentManagerRuntime.Release(configuration); }
            }
            return true;
        }
        finally { SolidWorksDocumentManagerRuntime.Release(manager); }
    }
    private static void CheckExternalReferences(SolidWorksDocumentManagerRuntime runtime, object app, Request request, object document, Entry parent, string name, Scan scan, int depth, string embeddedIdentity = null, bool embeddedAssembly = false)
    {
        if (!scan.ReferenceVisited.Add((embeddedIdentity ?? parent.entryKey) + "\n" + name)) return;
        if (depth > 64 || scan.ReferenceVisited.Count > 10000) { scan.Issue("assembly_reference_graph_limit", parent, name, false); return; }
        object option = null, search = null;
        string activeFileKey = embeddedIdentity ?? parent.entryKey;
        scan.ReferenceActiveFiles.Add(activeFileKey);
        try
        {
            int version = Convert.ToInt32(runtime.AssemblyInvoke("ISwDMDocument", document, "GetVersion"));
            // Imported feature references are not reliably reported for older saved files.
            if (version < 13000) scan.Issue("assembly_legacy_import_reference_coverage_unknown", parent, name, false);
            search = runtime.AssemblyInvoke("ISwDMApplication", app, "GetSearchOptionObject");
            runtime.AssemblyInvoke("ISwDMSearchOption", search, "ClearAllSearchPaths");
            runtime.AssemblyInvoke("ISwDMSearchOption", search, "AddSearchPath", Path.GetFullPath(request.root));
            string parentDirectory = Path.GetDirectoryName(parent.absolutePath);
            if (!String.Equals(parentDirectory, Path.GetFullPath(request.root), StringComparison.OrdinalIgnoreCase)) runtime.AssemblyInvoke("ISwDMSearchOption", search, "AddSearchPath", parentDirectory);
            // Component containment (filter 16) is checked separately through
            // GetComponents + native IsSuppressed. Geometry still independently
            // covers derived/mirrored/in-context (32) and assembly-in-part (128).
            // Do not enable root-assembly or recursive directory searches.
            runtime.AssemblySetProperty("ISwDMSearchOption", search, "SearchFilters", 2 | 8 | 32 | 128);
            option = runtime.AssemblyInvoke("ISwDMApplication4", app, "GetExternalReferenceOptionObject2");
            runtime.AssemblySetProperty("ISwDMExternalReferenceOption2", option, "Configuration", name);
            runtime.AssemblySetProperty("ISwDMExternalReferenceOption2", option, "SearchOption", search);
            // Option2 also exposes the original native option interface. This
            // controls suppressed feature references; component suppression is
            // still read from the exact selected configuration below.
            runtime.AssemblySetProperty("ISwDMExternalReferenceOption", option, "NeedSuppress", false);
            int count = Convert.ToInt32(runtime.AssemblyInvoke("ISwDMDocument27", document, "GetExternalFeatureReferences3", option));
            var references = Strings(runtime.AssemblyProperty("ISwDMExternalReferenceOption2", option, "ExternalReferences"));
            var configurations = Strings(runtime.AssemblyProperty("ISwDMExternalReferenceOption2", option, "ReferencedConfigurations"));
            if (count < 0 || count != references.Count || (count > 0 && configurations.Count != count)) { scan.Issue("assembly_external_reference_result_incomplete", parent, name, false); return; }
            // Embedded components are owned by the parent bytes, not missing ZIP
            // files. Their own references are checked when the native tree walks
            // the IsVirtual-guarded embedded document below.
            var virtualPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var componentSuppression = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            object manager = null, config = null;
            try
            {
                manager = runtime.GetConfigurationManager(document); int configError;
                config = runtime.GetConfigurationByName(manager, name, out configError);
                if (config != null && configError == 0 && (embeddedIdentity != null ? embeddedAssembly : String.Equals(Path.GetExtension(parent.relativePath), ".sldasm", StringComparison.OrdinalIgnoreCase)))
                {
                    Array components = runtime.AssemblyInvoke("ISwDMConfiguration2", config, "GetComponents") as Array;
                    if (components != null) foreach (object component in components) {
                        try {
                            string componentPath = Convert.ToString(runtime.AssemblyProperty("ISwDMComponent6", component, "PathName"));
                            if (Convert.ToBoolean(runtime.AssemblyProperty("ISwDMComponent3", component, "IsVirtual"))) virtualPaths.Add(componentPath);
                            string identity = NativeReferenceKey(componentPath);
                            bool suppressed = Convert.ToBoolean(runtime.AssemblyInvoke("ISwDMComponent", component, "IsSuppressed"));
                            bool previous; componentSuppression[identity] = suppressed && (!componentSuppression.TryGetValue(identity, out previous) || previous);
                        } finally { SolidWorksDocumentManagerRuntime.Release(component); }
                    }
                }
            }
            finally { SolidWorksDocumentManagerRuntime.Release(config); SolidWorksDocumentManagerRuntime.Release(manager); }
            for (int i = 0; i < references.Count; i++)
            {
                if (virtualPaths.Contains(references[i])) continue;
                // Vendor guidance associates returned references with native
                // Component.PathName + IsSuppressed. Use the full native path,
                // never a basename, and retain a path if any occurrence needs it.
                bool suppressedComponent;
                if (componentSuppression.TryGetValue(NativeReferenceKey(references[i]), out suppressedComponent) && suppressedComponent) continue;
                Entry target = ResolveReference(parent, references[i], request.entries);
                if (target == null) { scan.Issue("assembly_external_reference_outside_package", parent, references[i], true); continue; }
                string configuration = configurations[i];
                if (String.IsNullOrWhiteSpace(configuration)) { scan.Issue("assembly_external_reference_configuration_unknown", parent, target.relativePath, false); continue; }
                string identity = target.entryKey + "\n" + configuration; if (scan.ReferenceVisited.Contains(identity)) continue;
                if (scan.ReferenceActiveFiles.Contains(target.entryKey)) { scan.Issue("assembly_external_reference_configuration_cycle", parent, target.relativePath, false); continue; }
                object referenced = null;
                try { referenced = Open(runtime, app, target); CheckExternalReferences(runtime, app, request, referenced, target, configuration, scan, depth + 1); }
                finally { if (referenced != null) { try { runtime.CloseDocument(referenced); } catch { } } SolidWorksDocumentManagerRuntime.Release(referenced); }
            }
        }
        catch { scan.Issue("assembly_external_reference_reader_unavailable", parent, name, false); }
        finally { scan.ReferenceActiveFiles.Remove(activeFileKey); SolidWorksDocumentManagerRuntime.Release(option); SolidWorksDocumentManagerRuntime.Release(search); }
    }
    internal static void ReadQuantity(Dictionary<string, string> properties, out string quantity, out string unit, out string source)
    {
        quantity = null; unit = null; source = "native_custom_quantity_unknown";
        string selector; properties.TryGetValue("UNIT_OF_MEASURE", out selector);
        if (String.IsNullOrWhiteSpace(selector)) { quantity = "1"; unit = "EA"; source = "component_instance_count"; return; }
        string value; if (!properties.TryGetValue(selector, out value)) value = selector;
        string selectedUnit = Property(properties, new string[] { "Unit", "BOM Unit", "單位" });
        decimal amount;
        if (!String.IsNullOrWhiteSpace(selectedUnit) && Regex.IsMatch(value ?? "", "^(0|[1-9][0-9]{0,23})(\\.[0-9]{1,12})?$") && Decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount) && amount > 0)
        {
            quantity = amount.ToString("0.############", CultureInfo.InvariantCulture); unit = selectedUnit; source = "saved_custom_property:" + SafeReferenceLabel(selector);
        }
    }
    private static void Walk(SolidWorksDocumentManagerRuntime runtime, object app, Request request, Entry parent, string configurationName, string occurrence, string bomParent, bool emitRows, bool ancestorExcluded, int depth, Scan scan, object suppliedDocument = null, bool suppliedAssembly = false, string embeddedIdentity = null)
    {
        if (depth > 64 || scan.Count > 50000) { scan.Issue("assembly_graph_limit", parent, configurationName, false); return; }
        string source = (embeddedIdentity ?? parent.entryKey) + "\n" + configurationName;
        if (!scan.Stack.Add(source)) { scan.Issue("assembly_reference_cycle", parent, configurationName, true); return; }
        object document = null, manager = null, configuration = null;
        try
        {
            document = suppliedDocument ?? Open(runtime, app, parent); manager = runtime.GetConfigurationManager(document); int error;
            configuration = runtime.GetConfigurationByName(manager, configurationName, out error);
            if (error != 0 || configuration == null) { scan.Issue("assembly_child_configuration_missing", parent, configurationName, true); return; }
            CheckExternalReferences(runtime, app, request, document, parent, configurationName, scan, depth, embeddedIdentity, suppliedAssembly);
            if (!(suppliedDocument != null ? suppliedAssembly : String.Equals(Path.GetExtension(parent.relativePath), ".sldasm", StringComparison.OrdinalIgnoreCase))) return;
            Array components = runtime.AssemblyInvoke("ISwDMConfiguration2", configuration, "GetComponents") as Array;
            if (components == null) { scan.Issue("assembly_components_unavailable", parent, configurationName, false); return; }
            var occurrenceIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (object component in components)
            {
                object virtualDocument = null;
                string componentStage = "metadata";
                try
                {
                    if (++scan.Count > 50000) { scan.Issue("assembly_graph_limit", parent, configurationName, false); return; }
                    string name = Convert.ToString(runtime.AssemblyProperty("ISwDMComponent11", component, "Name3"));
                    string childConfiguration = Convert.ToString(runtime.AssemblyProperty("ISwDMComponent", component, "ConfigurationName"));
                    string reference = Convert.ToString(runtime.AssemblyProperty("ISwDMComponent6", component, "PathName"));
                    bool suppressed = Convert.ToBoolean(runtime.AssemblyInvoke("ISwDMComponent", component, "IsSuppressed"));
                    bool hidden = Convert.ToBoolean(runtime.AssemblyInvoke("ISwDMComponent", component, "IsHidden"));
                    bool virtualComponent = Convert.ToBoolean(runtime.AssemblyProperty("ISwDMComponent3", component, "IsVirtual"));
                    int exclusion = Convert.ToInt32(runtime.AssemblyProperty("ISwDMComponent5", component, "ExcludeFromBOM"));
                    int id = Convert.ToInt32(runtime.AssemblyInvoke("ISwDMComponent9", component, "GetID"));
                    string occurrenceKey = occurrence + "/" + id.ToString(CultureInfo.InvariantCulture);
                    if (!occurrenceIds.Add(occurrenceKey)) { scan.Issue("assembly_component_identity_ambiguous", parent, SafeReferenceLabel(name), false); continue; }
                    bool aliasConflict = false;
                    Entry child = virtualComponent ? parent : ResolveComponentReference(parent, reference, request.entries, scan.ComponentOrigins, out aliasConflict);
                    if (aliasConflict)
                    {
                        int matchingNames = 0; foreach (Entry candidate in request.entries) if (String.Equals(Path.GetFileName(candidate.relativePath), SafeReferenceLabel(reference), StringComparison.OrdinalIgnoreCase)) matchingNames++;
                        scan.Issue(matchingNames > 1 ? "assembly_component_reference_ambiguous" : "assembly_component_source_alias_conflict", parent, reference, true);
                    }
                    bool childIsAssembly = virtualComponent ? Convert.ToInt32(runtime.AssemblyProperty("ISwDMComponent2", component, "DocumentType")) == 2 : child != null && String.Equals(Path.GetExtension(child.relativePath), ".sldasm", StringComparison.OrdinalIgnoreCase);
                    bool excluded = ancestorExcluded || suppressed || exclusion == 1;
                    int display = 1; Dictionary<string, string> properties = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    if (!suppressed && child != null)
                    {
                        object childDocument = null, childManager = null, childConfig = null;
                        try
                        {
                            componentStage = "open"; int childError;
                            if (virtualComponent) { childDocument = runtime.OpenVirtualAssemblyDocument(component, out childError); virtualDocument = childDocument; if (childDocument == null || childError != 0) throw new InvalidDataException("assembly_virtual_document_open_failed"); }
                            else childDocument = Open(runtime, app, child);
                            componentStage = "configuration"; childManager = runtime.GetConfigurationManager(childDocument);
                            childConfig = runtime.GetConfigurationByName(childManager, childConfiguration, out childError);
                            if (childConfig == null || childError != 0) scan.Issue("assembly_child_configuration_missing", parent, reference, true);
                            else { componentStage = "display"; if (childIsAssembly) display = Convert.ToInt32(runtime.AssemblyProperty("ISwDMConfiguration15", childConfig, "ShowChildComponentsInBOM2")); componentStage = "properties"; ReadProperties(runtime, childDocument, childConfig, properties); }
                        }
                        finally { SolidWorksDocumentManagerRuntime.Release(childConfig); SolidWorksDocumentManagerRuntime.Release(childManager); if (!virtualComponent && childDocument != null) { try { runtime.CloseDocument(childDocument); } catch { } SolidWorksDocumentManagerRuntime.Release(childDocument); } }
                    }
                    if (!suppressed && child == null && !aliasConflict)
                    {
                        bool namedCandidate = false; string basename = SafeReferenceLabel(reference);
                        foreach (Entry candidate in request.entries) if (String.Equals(Path.GetFileName(candidate.relativePath), basename, StringComparison.OrdinalIgnoreCase)) namedCandidate = true;
                        scan.Issue(namedCandidate ? "assembly_reference_mapping_unknown" : "assembly_reference_missing", parent, reference, !namedCandidate);
                    }
                    if (exclusion < 0 || display < 0 || display > 2) scan.Issue("assembly_bom_behavior_unknown", parent, reference, false);
                    string partNumber = Property(properties, new string[] { "PartNumber", "Part Number", "料號" });
                    string drawingNumber = Property(properties, new string[] { "DrawingNumber", "Drawing Number", "圖號" });
                    string quantity = null, unit = null, quantitySource = "unresolved_source";
                    if (child != null && properties.ContainsKey("__properties_read")) ReadQuantity(properties, out quantity, out unit, out quantitySource);
                    if (emitRows && display != 2) scan.Rows.Add(new Dictionary<string, object> {
                        { "parentKey", bomParent }, { "entryKey", child == null ? null : child.entryKey }, { "occurrenceKey", occurrenceKey }, { "configuration", childConfiguration },
                        { "componentName", SafeReferenceLabel(name) },
                        { "cadPartNumber", partNumber }, { "drawingNumber", drawingNumber }, { "quantity", quantity }, { "unit", unit },
                        { "disposition", excluded ? "excluded" : quantity == null ? "quantity_unknown" : partNumber == null ? "needs_number" : "needs_record" }, { "quantitySource", quantitySource }, { "baseOccurrenceQuantity", "1" },
                        { "suppressed", suppressed }, { "hidden", hidden }, { "virtual", virtualComponent }, { "virtualEntryKey", virtualComponent ? occurrenceKey : null }, { "virtualOwnerEntryKey", virtualComponent ? parent.entryKey : null },
                        { "excludeFromBom", exclusion }, { "childDisplay", display == 2 ? "promote" : display == 0 ? "hide" : "show" }, { "reference", virtualComponent ? SafeReferenceLabel(name) : child == null ? SafeReferenceLabel(reference) : child.relativePath }
                    });
                    if (!suppressed && child != null && !String.IsNullOrWhiteSpace(childConfiguration)) Walk(runtime, app, request, child, childConfiguration, occurrenceKey, display == 2 ? bomParent : occurrenceKey, emitRows && display != 0, excluded, depth + 1, scan, virtualDocument, childIsAssembly, virtualComponent ? occurrenceKey : null);
                }
                catch (Exception componentError) { scan.Issue("assembly_component_reader_failed_" + componentStage + "_" + NativeErrorCode(componentError), parent, "component", false); }
                finally { if (virtualDocument != null) { try { runtime.CloseDocument(virtualDocument); } catch { } SolidWorksDocumentManagerRuntime.Release(virtualDocument); } SolidWorksDocumentManagerRuntime.Release(component); }
            }
        }
        catch { scan.Issue("assembly_document_reader_failed", parent, configurationName, false); }
        finally
        {
            SolidWorksDocumentManagerRuntime.Release(configuration); SolidWorksDocumentManagerRuntime.Release(manager);
            if (document != null && suppliedDocument == null) { try { runtime.CloseDocument(document); } catch { } SolidWorksDocumentManagerRuntime.Release(document); }
            scan.Stack.Remove(source);
        }
    }
    private static List<string> Strings(object value) { var result = new List<string>(); Array values = value as Array; if (values != null) foreach (object item in values) result.Add(Convert.ToString(item)); return result; }
    private static string NativeReferenceKey(string value) { return (value ?? "").Replace('\\', '/').Normalize(NormalizationForm.FormC).ToUpperInvariant(); }
    private static string NativeErrorCode(Exception error) { while (error.InnerException != null) error = error.InnerException; return error.GetType().Name + "_" + error.HResult.ToString("X8", CultureInfo.InvariantCulture); }
    private static string Property(Dictionary<string, string> values, string[] names) { foreach (string name in names) { string value; if (values.TryGetValue(name, out value) && !String.IsNullOrWhiteSpace(value)) return value; } return null; }
    private static void ReadProperties(SolidWorksDocumentManagerRuntime runtime, object document, object configuration, Dictionary<string, string> output)
    {
        object names, types, linked, values; runtime.ReadDocumentProperties(document, out names, out types, out linked, out values); AppendProperties(names, linked, values, output);
        runtime.ReadConfigurationProperties(configuration, out names, out types, out linked, out values); AppendProperties(names, linked, values, output);
        // UNIT_OF_MEASURE is protected/hidden in some SOLIDWORKS versions.
        // Read it explicitly as well as enumerating the public property sets.
        string uom = runtime.ReadAssemblyPropertyValue("ISwDMDocument", document, "UNIT_OF_MEASURE");
        string configUom = runtime.ReadAssemblyPropertyValue("ISwDMConfiguration", configuration, "UNIT_OF_MEASURE");
        if (!String.IsNullOrWhiteSpace(uom)) output["UNIT_OF_MEASURE"] = uom;
        if (!String.IsNullOrWhiteSpace(configUom)) output["UNIT_OF_MEASURE"] = configUom;
        output["__properties_read"] = "true";
    }
    private static void AppendProperties(object rawNames, object rawLinked, object rawValues, Dictionary<string, string> output)
    {
        var names = Strings(rawNames); var linked = Strings(rawLinked); var values = Strings(rawValues);
        for (int i = 0; i < names.Count; i++) if (i < values.Count && (i >= linked.Count || String.IsNullOrWhiteSpace(linked[i]) || linked[i] == values[i])) output[names[i]] = values[i];
    }
    private static string ReadLicenseKey()
    {
        foreach (string name in new string[] { "PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY", "PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY", "SOLIDWORKS_DOCUMENT_MANAGER_KEY" }) { string key = Environment.GetEnvironmentVariable(name); if (!String.IsNullOrWhiteSpace(key)) return key.Trim(); }
        return null;
    }
}
