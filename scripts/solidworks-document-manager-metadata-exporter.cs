using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using SolidWorks.Interop.swdocumentmgr;

internal static class SolidWorksDocumentManagerMetadataExporter
{
    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Length < 1) return Fail("native_metadata_source_missing");
        string sourcePath = Path.GetFullPath(args[0]);
        if (!File.Exists(sourcePath)) return Fail("native_metadata_source_not_found");
        string licenseKey = ReadLicenseKey();
        if (String.IsNullOrWhiteSpace(licenseKey)) return Fail("native_metadata_license_missing");
        ISwDMApplication app = null;
        ISwDMDocument doc = null;
        try
        {
            Type factoryType = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory");
            if (factoryType == null) return Fail("native_metadata_api_unavailable");
            object factoryObject = Activator.CreateInstance(factoryType);
            ISwDMClassFactory factory = factoryObject as ISwDMClassFactory;
            if (factory == null) return Fail("native_metadata_api_unavailable");
            SwDMApplication rawApp = factory.GetApplication(licenseKey);
            app = rawApp as ISwDMApplication;
            Marshal.ReleaseComObject(factory);
            if (app == null) return Fail("native_metadata_api_unavailable");

            SwDmDocumentType documentType = DocumentTypeFor(sourcePath);
            SwDmDocumentOpenError openError = SwDmDocumentOpenError.swDmDocumentOpenErrorNone;
            SwDMDocument rawDoc = app.GetDocument(sourcePath, documentType, true, out openError);
            doc = rawDoc as ISwDMDocument;
            if (doc == null || openError != SwDmDocumentOpenError.swDmDocumentOpenErrorNone) return Fail("native_metadata_open_failed");

            List<RawProperty> properties = new List<RawProperty>();
            ReadDocumentProperties(doc, properties);
            ReadConfigurationProperties(doc, properties);
            Console.WriteLine(BuildPayload(documentType.ToString(), properties, new List<string>()));
            return 0;
        }
        catch (COMException)
        {
            return Fail("native_metadata_com_error");
        }
        catch
        {
            return Fail("native_metadata_failed");
        }
        finally
        {
            try { if (doc != null) doc.CloseDoc(); } catch { }
            if (doc != null) Marshal.ReleaseComObject(doc);
            if (app != null) Marshal.ReleaseComObject(app);
        }
    }

    private static void ReadDocumentProperties(ISwDMDocument doc, List<RawProperty> output)
    {
        ISwDMDocument3 document3 = doc as ISwDMDocument3;
        if (document3 == null) return;
        object names = null, types = null, linked = null, values = null;
        document3.GetAllCustomPropertyNamesAndValues(out names, out types, out linked, out values);
        AppendProperties(output, "document", names, types, linked, values);
    }

    private static void ReadConfigurationProperties(ISwDMDocument doc, List<RawProperty> output)
    {
        SwDMConfigurationMgr rawManager = doc.ConfigurationManager;
        ISwDMConfigurationMgr manager = rawManager as ISwDMConfigurationMgr;
        if (manager == null) return;
        ISwDMConfigurationMgr2 manager2 = manager as ISwDMConfigurationMgr2;
        object rawNames;
        if (manager2 != null)
        {
            SwDMConfigurationError result;
            rawNames = manager2.GetConfigurationNames2(out result);
        }
        else rawNames = manager.GetConfigurationNames();
        foreach (object item in Enumerate(rawNames))
        {
            string configurationName = Convert.ToString(item) ?? "";
            if (String.IsNullOrWhiteSpace(configurationName)) continue;
            SwDMConfiguration rawConfiguration;
            if (manager2 != null)
            {
                SwDMConfigurationError result;
                rawConfiguration = manager2.GetConfigurationByName2(configurationName, out result);
            }
            else rawConfiguration = manager.GetConfigurationByName(configurationName);
            ISwDMConfiguration4 configuration = rawConfiguration as ISwDMConfiguration4;
            if (configuration == null) continue;
            object names = null, types = null, linked = null, values = null;
            configuration.GetAllCustomPropertyNamesAndValues(out names, out types, out linked, out values);
            AppendProperties(output, "configuration:" + configurationName, names, types, linked, values);
            if (rawConfiguration != null) Marshal.ReleaseComObject(rawConfiguration);
        }
        Marshal.ReleaseComObject(manager);
    }

    private static void AppendProperties(List<RawProperty> output, string scope, object names, object types, object linked, object values)
    {
        object[] nameArray = ToObjectArray(names), typeArray = ToObjectArray(types), linkedArray = ToObjectArray(linked), valueArray = ToObjectArray(values);
        for (int index = 0; index < nameArray.Length; index++)
        {
            output.Add(new RawProperty {
                Scope = scope,
                Name = Convert.ToString(nameArray[index]) ?? "",
                PropertyType = index < typeArray.Length ? Convert.ToString(typeArray[index]) ?? "" : "",
                LinkedExpression = index < linkedArray.Length ? Convert.ToString(linkedArray[index]) ?? "" : "",
                EvaluatedValue = index < valueArray.Length ? Convert.ToString(valueArray[index]) ?? "" : ""
            });
        }
    }

    private static object[] ToObjectArray(object value)
    {
        Array array = value as Array;
        if (array == null) return new object[0];
        object[] result = new object[array.Length];
        int index = 0;
        foreach (object item in array) result[index++] = item;
        return result;
    }

    private static IEnumerable Enumerate(object value)
    {
        Array array = value as Array;
        if (array == null) yield break;
        foreach (object item in array) yield return item;
    }

    private static SwDmDocumentType DocumentTypeFor(string sourcePath)
    {
        string ext = Path.GetExtension(sourcePath).ToLowerInvariant();
        if (ext == ".sldprt") return SwDmDocumentType.swDmDocumentPart;
        if (ext == ".sldasm") return SwDmDocumentType.swDmDocumentAssembly;
        return SwDmDocumentType.swDmDocumentDrawing;
    }

    private static string ReadLicenseKey()
    {
        string[] names = { "PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY", "PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY", "SOLIDWORKS_DOCUMENT_MANAGER_KEY" };
        foreach (string name in names)
        {
            string value = Environment.GetEnvironmentVariable(name);
            if (!String.IsNullOrWhiteSpace(value)) return value.Trim();
        }
        return "";
    }

    private static int Fail(string diagnostic)
    {
        Console.WriteLine(BuildPayload("unknown", new List<RawProperty>(), new List<string> { diagnostic }));
        return 1;
    }

    private static string BuildPayload(string documentType, List<RawProperty> properties, List<string> diagnostics)
    {
        StringBuilder json = new StringBuilder();
        json.Append("{\"schemaVersion\":\"solidworks-native-properties.v1\",\"reader\":\"SolidWorks Document Manager\",\"readerVersion\":\"1.0.0\",\"documentType\":\"").Append(JsonEscape(documentType)).Append("\",\"status\":\"").Append(diagnostics.Count == 0 ? "succeeded" : "failed").Append("\",\"properties\":[");
        for (int index = 0; index < properties.Count; index++)
        {
            if (index > 0) json.Append(",");
            RawProperty property = properties[index];
            json.Append("{\"scope\":\"").Append(JsonEscape(property.Scope)).Append("\",\"name\":\"").Append(JsonEscape(property.Name)).Append("\",\"propertyType\":\"").Append(JsonEscape(property.PropertyType)).Append("\",\"linkedExpression\":\"").Append(JsonEscape(property.LinkedExpression)).Append("\",\"evaluatedValue\":\"").Append(JsonEscape(property.EvaluatedValue)).Append("\"}");
        }
        json.Append("],\"diagnostics\":[");
        for (int index = 0; index < diagnostics.Count; index++) { if (index > 0) json.Append(","); json.Append("\"").Append(JsonEscape(diagnostics[index])).Append("\""); }
        json.Append("]}");
        return json.ToString();
    }

    private static string JsonEscape(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
    }

    private sealed class RawProperty
    {
        public string Scope; public string Name; public string PropertyType; public string LinkedExpression; public string EvaluatedValue;
    }
}
