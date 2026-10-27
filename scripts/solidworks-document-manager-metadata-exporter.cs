using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

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
        SolidWorksDocumentManagerRuntime runtime = null;
        object app = null;
        object doc = null;
        try
        {
            runtime = SolidWorksDocumentManagerRuntime.Load();
            app = runtime.CreateApplication(licenseKey);
            if (app == null) return Fail("native_metadata_api_unavailable");

            int documentType = DocumentTypeFor(sourcePath);
            int openError = 0;
            doc = runtime.OpenDocument(app, sourcePath, documentType, out openError);
            if (doc == null || openError != 0) return Fail("native_metadata_open_failed");

            List<RawProperty> properties = new List<RawProperty>();
            ReadDocumentProperties(runtime, doc, properties);
            ReadConfigurationProperties(runtime, doc, properties);
            Console.WriteLine(BuildPayload(DocumentTypeName(documentType), properties, new List<string>()));
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
            try { if (runtime != null && doc != null) runtime.CloseDocument(doc); } catch { }
            SolidWorksDocumentManagerRuntime.Release(doc);
            SolidWorksDocumentManagerRuntime.Release(app);
        }
    }

    private static void ReadDocumentProperties(SolidWorksDocumentManagerRuntime runtime, object doc, List<RawProperty> output)
    {
        object names = null, types = null, linked = null, values = null;
        runtime.ReadDocumentProperties(doc, out names, out types, out linked, out values);
        AppendProperties(output, "document", names, types, linked, values);
    }

    private static void ReadConfigurationProperties(SolidWorksDocumentManagerRuntime runtime, object doc, List<RawProperty> output)
    {
        object rawManager = runtime.GetConfigurationManager(doc);
        if (rawManager == null) return;
        try
        {
            int result = 0;
            object rawNames = runtime.GetConfigurationNames(rawManager, out result);
            foreach (object item in Enumerate(rawNames))
            {
                string configurationName = Convert.ToString(item) ?? "";
                if (String.IsNullOrWhiteSpace(configurationName)) continue;
                object rawConfiguration = runtime.GetConfigurationByName(rawManager, configurationName, out result);
                if (rawConfiguration == null) continue;
                try
                {
                    object names = null, types = null, linked = null, values = null;
                    runtime.ReadConfigurationProperties(rawConfiguration, out names, out types, out linked, out values);
                    AppendProperties(output, "configuration:" + configurationName, names, types, linked, values);
                }
                finally
                {
                    SolidWorksDocumentManagerRuntime.Release(rawConfiguration);
                }
            }
        }
        finally
        {
            SolidWorksDocumentManagerRuntime.Release(rawManager);
        }
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

    private static int DocumentTypeFor(string sourcePath)
    {
        string ext = Path.GetExtension(sourcePath).ToLowerInvariant();
        if (ext == ".sldprt") return 1;
        if (ext == ".sldasm") return 2;
        return 3;
    }

    private static string DocumentTypeName(int documentType)
    {
        if (documentType == 1) return "swDmDocumentPart";
        if (documentType == 2) return "swDmDocumentAssembly";
        return "swDmDocumentDrawing";
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
