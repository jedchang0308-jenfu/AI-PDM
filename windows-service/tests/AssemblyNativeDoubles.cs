// Managed doubles for the native API seam. Compiled only by -Test; these do not
// load a DM license, register COM objects, or establish genuine CAD acceptance.
using System;
using System.Collections.Generic;
namespace SolidWorks.Interop.swdocumentmgr
{
    internal enum FakeError { None = 0 }
    internal interface ISwDMDocument { object ConfigurationManager { get; } void CloseDoc(); int GetVersion(); object GetCustomPropertyNames(); string GetCustomProperty(string name, out FakeError type); }
    internal interface ISwDMDocument3 { void GetAllCustomPropertyNamesAndValues(out object names, out object types, out object linked, out object values); }
    internal interface ISwDMDocument27 { int GetExternalFeatureReferences3(object option); }
    internal interface ISwDMConfigurationMgr2 { object GetConfigurationNames2(out FakeError error); object GetConfigurationByName2(string name, out FakeError error); }
    internal interface ISwDMConfiguration { object GetCustomPropertyNames(); string GetCustomProperty(string name, out FakeError type); }
    internal interface ISwDMConfiguration2 { object GetComponents(); }
    internal interface ISwDMConfiguration4 { void GetAllCustomPropertyNamesAndValues(out object names, out object types, out object linked, out object values); }
    internal interface ISwDMConfiguration15 { int ShowChildComponentsInBOM2 { get; } }
    internal interface ISwDMComponent { string ConfigurationName { get; } bool IsSuppressed(); bool IsHidden(); }
    internal interface ISwDMComponent2 { int DocumentType { get; } }
    internal interface ISwDMComponent3 { bool IsVirtual { get; } object GetDocument(bool readOnly, out FakeError error); }
    internal interface ISwDMComponent5 { int ExcludeFromBOM { get; } }
    internal interface ISwDMComponent6 { string PathName { get; } }
    internal interface ISwDMComponent9 { int GetID(); }
    internal interface ISwDMComponent11 { string Name3 { get; } }
    internal interface ISwDMApplication { object GetSearchOptionObject(); }
    internal interface ISwDMApplication4 { object GetExternalReferenceOptionObject2(); }
    internal interface ISwDMSearchOption { void ClearAllSearchPaths(); void AddSearchPath(string path); int SearchFilters { get; set; } }
    internal interface ISwDMExternalReferenceOption2 { string Configuration { get; set; } object SearchOption { get; set; } object ExternalReferences { get; } object ReferencedConfigurations { get; } }
    internal interface ISwDMExternalReferenceOption { bool NeedSuppress { get; set; } }
    internal sealed class FakeNativeApplication : ISwDMApplication, ISwDMApplication4
    {
        public object GetSearchOptionObject() { return new FakeSearch(); }
        public object GetExternalReferenceOptionObject2() { return new FakeReferences(); }
    }
    internal sealed class FakeSearch : ISwDMSearchOption
    {
        public int SearchFilters { get; set; }
        public readonly List<string> Paths = new List<string>();
        public void ClearAllSearchPaths() { Paths.Clear(); }
        public void AddSearchPath(string path) { Paths.Add(path); }
    }
    internal sealed class FakeReferences : ISwDMExternalReferenceOption2, ISwDMExternalReferenceOption
    {
        internal string[] Sources = new string[0], Configurations = new string[0];
        public string Configuration { get; set; }
        public bool NeedSuppress { get; set; }
        public object SearchOption { get; set; }
        public object ExternalReferences { get { return Sources; } }
        public object ReferencedConfigurations { get { return Configurations; } }
    }
    internal sealed class FakeNativeDocument : ISwDMDocument, ISwDMDocument3, ISwDMDocument27
    {
        internal readonly FakeNativeConfiguration Config = new FakeNativeConfiguration();
        internal int CloseCount;
        internal string[] Features = new string[0];
        public object ConfigurationManager { get { return new FakeManager(Config); } }
        public void CloseDoc() { CloseCount++; }
        public int GetVersion() { return 18000; }
        public object GetCustomPropertyNames() { return new string[0]; }
        public string GetCustomProperty(string name, out FakeError type) { type = FakeError.None; return ""; }
        public int GetExternalFeatureReferences3(object option) {
            var selected = (FakeReferences)option; var search = (FakeSearch)selected.SearchOption;
            if ((search.SearchFilters & 32) == 0) throw new InvalidOperationException("FEATURE_REFERENCE_COVERAGE_REQUIRED");
            selected.Sources = Features; selected.Configurations = new string[Features.Length];
            for (int i = 0; i < Features.Length; i++) selected.Configurations[i] = "Default";
            return Features.Length;
        }
        public void GetAllCustomPropertyNamesAndValues(out object names, out object types, out object linked, out object values) { names = types = linked = values = new object[0]; }
    }
    internal sealed class FakeManager : ISwDMConfigurationMgr2
    {
        private readonly FakeNativeConfiguration configuration;
        internal FakeManager(FakeNativeConfiguration value) { configuration = value; }
        public object GetConfigurationNames2(out FakeError error) { error = FakeError.None; return new string[] { "Default" }; }
        public object GetConfigurationByName2(string name, out FakeError error) { error = FakeError.None; return name == "Default" ? configuration : null; }
    }
    internal sealed class FakeNativeConfiguration : ISwDMConfiguration, ISwDMConfiguration2, ISwDMConfiguration4, ISwDMConfiguration15
    {
        internal object[] Components = new object[0];
        internal int Display = 1;
        public int ShowChildComponentsInBOM2 { get { return Display; } }
        public object GetCustomPropertyNames() { return new string[0]; }
        public string GetCustomProperty(string name, out FakeError type) { type = FakeError.None; return ""; }
        public object GetComponents() { return Components; }
        public void GetAllCustomPropertyNamesAndValues(out object names, out object types, out object linked, out object values) { names = types = linked = values = new object[0]; }
    }
    internal sealed class FakeNativeComponent : ISwDMComponent, ISwDMComponent2, ISwDMComponent3, ISwDMComponent5, ISwDMComponent6, ISwDMComponent9, ISwDMComponent11
    {
        internal bool Virtual = true, Suppressed, Hidden;
        internal int Id = 7, Type = 1, Exclusion;
        internal string Reference = @"C:\original\embedded^assembly.sldprt";
        internal readonly FakeNativeDocument Document = new FakeNativeDocument();
        internal int EmbeddedOpenCount;
        public string ConfigurationName { get { return "Default"; } }
        public bool IsSuppressed() { return Suppressed; }
        public bool IsHidden() { return Hidden; }
        public int DocumentType { get { return Type; } }
        public bool IsVirtual { get { return Virtual; } }
        public object GetDocument(bool readOnly, out FakeError error) { if (!Virtual || !readOnly) throw new InvalidOperationException("EXTERNAL_LOOKUP_FORBIDDEN"); EmbeddedOpenCount++; error = FakeError.None; return Document; }
        public int ExcludeFromBOM { get { return Exclusion; } }
        public string PathName { get { return Reference; } }
        public int GetID() { return Id; }
        public string Name3 { get { return "embedded^assembly"; } }
    }
}
