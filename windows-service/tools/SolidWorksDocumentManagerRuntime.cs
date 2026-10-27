using Microsoft.Win32;
using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

internal sealed class SolidWorksDocumentManagerRuntime
{
    private const string FactoryProgId = "SwDocumentMgr.SwDMClassFactory";
    private const string InteropAssemblyFileName = "SolidWorks.Interop.swdocumentmgr.dll";
    private const string InteropAssemblyName = "SolidWorks.Interop.swdocumentmgr";
    private const string InteropPublicKeyToken = "e52dfa2d3a1e978a";
    private const string InteropNamespace = "SolidWorks.Interop.swdocumentmgr.";

    private readonly Assembly interopAssembly;

    private SolidWorksDocumentManagerRuntime(
        Type factoryComType,
        string nativeServerPath,
        string interopAssemblyPath,
        Assembly interopAssembly)
    {
        FactoryComType = factoryComType;
        NativeServerPath = nativeServerPath;
        InteropAssemblyPath = interopAssemblyPath;
        this.interopAssembly = interopAssembly;
    }

    internal Type FactoryComType { get; private set; }
    internal string NativeServerPath { get; private set; }
    internal string InteropAssemblyPath { get; private set; }
    internal AssemblyName LoadedInteropAssemblyName { get { return interopAssembly.GetName(); } }

    internal static SolidWorksDocumentManagerRuntime Load()
    {
        Type factoryType = Type.GetTypeFromProgID(FactoryProgId, false);
        if (factoryType == null) throw new InvalidOperationException("COM_CLASS_MISSING");

        string registryKey = "CLSID\\" + factoryType.GUID.ToString("B") + "\\InprocServer32";
        string nativeServerPath;
        using (RegistryKey key = Registry.ClassesRoot.OpenSubKey(registryKey, false))
            nativeServerPath = Convert.ToString(key == null ? null : key.GetValue(null));
        nativeServerPath = Environment.ExpandEnvironmentVariables((nativeServerPath ?? "").Trim().Trim('"'));
        if (!Path.IsPathRooted(nativeServerPath) || !File.Exists(nativeServerPath))
            throw new FileNotFoundException("COM_SERVER_MISSING");

        string interopPath = Path.Combine(Path.GetDirectoryName(nativeServerPath) ?? "", InteropAssemblyFileName);
        if (!File.Exists(interopPath)) throw new FileNotFoundException("OFFICIAL_INTEROP_MISSING");
        AssemblyName name = AssemblyName.GetAssemblyName(interopPath);
        byte[] tokenBytes = name.GetPublicKeyToken() ?? new byte[0];
        string token = BitConverter.ToString(tokenBytes).Replace("-", "").ToLowerInvariant();
        if (!String.Equals(name.Name, InteropAssemblyName, StringComparison.Ordinal) ||
            !String.Equals(token, InteropPublicKeyToken, StringComparison.Ordinal))
            throw new InvalidDataException("OFFICIAL_INTEROP_IDENTITY_INVALID");

        Assembly assembly = Assembly.LoadFrom(interopPath);
        ValidateRequiredInteropContract(assembly);
        Type factoryInterface = RequireInterfaceType(assembly, "ISwDMClassFactory");
        object factoryObject = Activator.CreateInstance(factoryType);
        if (factoryObject == null) throw new InvalidOperationException("COM_ACTIVATION_FAILED");
        try
        {
            if (!factoryInterface.IsInstanceOfType(factoryObject))
                throw new InvalidCastException("DOCUMENT_MANAGER_FACTORY_INTERFACE_UNAVAILABLE");
        }
        finally
        {
            Release(factoryObject);
        }

        return new SolidWorksDocumentManagerRuntime(factoryType, nativeServerPath, interopPath, assembly);
    }

    private static void ValidateRequiredInteropContract(Assembly assembly)
    {
        RequireMethod(assembly, "ISwDMClassFactory", "GetApplication", 1);
        RequireMethod(assembly, "ISwDMApplication", "GetDocument", 4);
        RequireProperty(assembly, "ISwDMDocument", "ConfigurationManager");
        RequireMethod(assembly, "ISwDMDocument3", "GetAllCustomPropertyNamesAndValues", 4);
        RequireMethod(assembly, "ISwDMDocument10", "GetSheets", 0);
        RequireMethod(assembly, "ISwDMDocument11", "GetPreviewPNGBitmapBytes", 1);
        RequireMethod(assembly, "ISwDMConfigurationMgr", "GetActiveConfigurationName", 0);
        RequireMethod(assembly, "ISwDMConfigurationMgr2", "GetConfigurationNames2", 1);
        RequireMethod(assembly, "ISwDMConfigurationMgr2", "GetConfigurationByName2", 2);
        RequireMethod(assembly, "ISwDMConfiguration4", "GetAllCustomPropertyNamesAndValues", 4);
        RequireMethod(assembly, "ISwDMConfiguration9", "GetPreviewPNGBitmapBytes", 1);
        RequireProperty(assembly, "ISwDMSheet", "Name");
        RequireMethod(assembly, "ISwDMSheet2", "GetPreviewPNGBitmapBytes", 1);
    }

    private static Type RequireInterfaceType(Assembly assembly, string interfaceName)
    {
        return assembly.GetType(InteropNamespace + interfaceName, true);
    }

    private static MethodInfo RequireMethod(Assembly assembly, string interfaceName, string methodName, int parameterCount)
    {
        Type type = RequireInterfaceType(assembly, interfaceName);
        foreach (MethodInfo method in type.GetMethods())
            if (method.Name == methodName && method.GetParameters().Length == parameterCount) return method;
        throw new MissingMethodException(type.FullName, methodName);
    }

    private static PropertyInfo RequireProperty(Assembly assembly, string interfaceName, string propertyName)
    {
        Type type = RequireInterfaceType(assembly, interfaceName);
        PropertyInfo property = type.GetProperty(propertyName);
        if (property == null) throw new MissingMemberException(type.FullName, propertyName);
        return property;
    }

    internal object CreateApplication(string licenseKey)
    {
        object factory = Activator.CreateInstance(FactoryComType);
        if (factory == null) throw new InvalidOperationException("COM_ACTIVATION_FAILED");
        try
        {
            return Invoke("ISwDMClassFactory", factory, "GetApplication", new object[] { licenseKey });
        }
        finally
        {
            Release(factory);
        }
    }

    internal object OpenDocument(object application, string sourcePath, int documentType, out int openError)
    {
        MethodInfo method = RequireMethod("ISwDMApplication", application, "GetDocument", 4);
        ParameterInfo[] parameters = method.GetParameters();
        object[] args = {
            sourcePath,
            Enum.ToObject(parameters[1].ParameterType, documentType),
            true,
            Enum.ToObject(parameters[3].ParameterType.GetElementType(), 0)
        };
        object document = method.Invoke(application, args);
        openError = Convert.ToInt32(args[3]);
        return document;
    }

    internal void ReadDocumentProperties(object document, out object names, out object types, out object linked, out object values)
    {
        InvokeFourOut("ISwDMDocument3", document, "GetAllCustomPropertyNamesAndValues",
            out names, out types, out linked, out values);
    }

    internal void ReadConfigurationProperties(object configuration, out object names, out object types, out object linked, out object values)
    {
        InvokeFourOut("ISwDMConfiguration4", configuration, "GetAllCustomPropertyNamesAndValues",
            out names, out types, out linked, out values);
    }

    internal object GetConfigurationManager(object document)
    {
        return RequireProperty("ISwDMDocument", document, "ConfigurationManager").GetValue(document, null);
    }

    internal object GetConfigurationNames(object manager, out int error)
    {
        return InvokeSingleEnumOut("ISwDMConfigurationMgr2", manager, "GetConfigurationNames2", out error);
    }

    internal object GetConfigurationByName(object manager, string name, out int error)
    {
        MethodInfo method = RequireMethod("ISwDMConfigurationMgr2", manager, "GetConfigurationByName2", 2);
        ParameterInfo[] parameters = method.GetParameters();
        object[] args = { name, Enum.ToObject(parameters[1].ParameterType.GetElementType(), 0) };
        object configuration = method.Invoke(manager, args);
        error = Convert.ToInt32(args[1]);
        return configuration;
    }

    internal string GetActiveConfigurationName(object manager)
    {
        return Convert.ToString(Invoke("ISwDMConfigurationMgr", manager, "GetActiveConfigurationName", new object[0])) ?? "";
    }

    internal object GetSheets(object document)
    {
        return Invoke("ISwDMDocument10", document, "GetSheets", new object[0]);
    }

    internal object GetDocumentPreview(object document, out int error)
    {
        return InvokeSingleEnumOut("ISwDMDocument11", document, "GetPreviewPNGBitmapBytes", out error);
    }

    internal object GetConfigurationPreview(object configuration, out int error)
    {
        return InvokeSingleEnumOut("ISwDMConfiguration9", configuration, "GetPreviewPNGBitmapBytes", out error);
    }

    internal object GetSheetPreview(object sheet, out int error)
    {
        return InvokeSingleEnumOut("ISwDMSheet2", sheet, "GetPreviewPNGBitmapBytes", out error);
    }

    internal string GetSheetName(object sheet)
    {
        return Convert.ToString(RequireProperty("ISwDMSheet", sheet, "Name").GetValue(sheet, null)) ?? "";
    }

    internal void CloseDocument(object document)
    {
        Invoke("ISwDMDocument", document, "CloseDoc", new object[0]);
    }

    internal static void Release(object value)
    {
        if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value);
    }

    private object InvokeSingleEnumOut(string interfaceName, object target, string methodName, out int error)
    {
        MethodInfo method = RequireMethod(interfaceName, target, methodName, 1);
        Type enumType = method.GetParameters()[0].ParameterType.GetElementType();
        object[] args = { Enum.ToObject(enumType, 0) };
        object result = method.Invoke(target, args);
        error = Convert.ToInt32(args[0]);
        return result;
    }

    private void InvokeFourOut(string interfaceName, object target, string methodName,
        out object first, out object second, out object third, out object fourth)
    {
        MethodInfo method = RequireMethod(interfaceName, target, methodName, 4);
        object[] args = { null, null, null, null };
        method.Invoke(target, args);
        first = args[0];
        second = args[1];
        third = args[2];
        fourth = args[3];
    }

    private object Invoke(string interfaceName, object target, string methodName, object[] args)
    {
        return RequireMethod(interfaceName, target, methodName, args.Length).Invoke(target, args);
    }

    private MethodInfo RequireMethod(string interfaceName, object target, string methodName, int parameterCount)
    {
        Type type = RequireInterface(interfaceName, target);
        foreach (MethodInfo method in type.GetMethods())
            if (method.Name == methodName && method.GetParameters().Length == parameterCount) return method;
        throw new MissingMethodException(type.FullName, methodName);
    }

    private PropertyInfo RequireProperty(string interfaceName, object target, string propertyName)
    {
        Type type = RequireInterface(interfaceName, target);
        PropertyInfo property = type.GetProperty(propertyName);
        if (property == null) throw new MissingMemberException(type.FullName, propertyName);
        return property;
    }

    private Type RequireInterface(string interfaceName, object target)
    {
        if (target == null) throw new ArgumentNullException("target");
        Type type = RequireInterfaceType(interopAssembly, interfaceName);
        if (!type.IsInstanceOfType(target))
            throw new InvalidCastException(interfaceName + "_UNAVAILABLE");
        return type;
    }
}
