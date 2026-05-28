using System;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace AiPdmAddin.Services
{
    public class PropertyExtractor
    {
        private static readonly string[] RequiredProperties = new[]
        {
            "drawing_number",
            "part_number",
            "part_name",
            "revision",
            "material",
            "surface_finish",
            "document_type"
        };

        public class ExtractionResult
        {
            private readonly Dictionary<string, string> _properties = new Dictionary<string, string>();
            private readonly List<string> _missingProperties = new List<string>();

            public Dictionary<string, string> Properties
            {
                get { return _properties; }
            }

            public List<string> MissingProperties
            {
                get { return _missingProperties; }
            }

            public bool IsValid
            {
                get { return MissingProperties.Count == 0; }
            }
        }

        public ExtractionResult Extract(IModelDoc2 modelDoc)
        {
            var result = new ExtractionResult();
            if (modelDoc == null)
            {
                Logger.Error("Extract called with null IModelDoc2 reference.");
                return result;
            }

            try
            {
                CustomPropertyManager propMgr = modelDoc.Extension.CustomPropertyManager[""];
                if (propMgr == null)
                {
                    Logger.Error("Could not retrieve CustomPropertyManager from SolidWorks file.");
                    foreach (string prop in RequiredProperties)
                    {
                        result.MissingProperties.Add(prop);
                    }
                    return result;
                }

                foreach (string propName in RequiredProperties)
                {
                    string val = "";
                    string resolvedVal = "";
                    bool wasResolved = false;
                    bool linkToProperty = false;

                    propMgr.Get6(propName, false, out val, out resolvedVal, out wasResolved, out linkToProperty);
                    string finalVal = string.IsNullOrEmpty(resolvedVal) ? val : resolvedVal;
                    finalVal = finalVal == null ? "" : finalVal.Trim();

                    if (propName == "document_type" && string.IsNullOrEmpty(finalVal))
                    {
                        int type = modelDoc.GetType();
                        if (type == (int)swDocumentTypes_e.swDocPART) finalVal = "Part";
                        else if (type == (int)swDocumentTypes_e.swDocASSEMBLY) finalVal = "Assembly";
                        else if (type == (int)swDocumentTypes_e.swDocDRAWING) finalVal = "Drawing";
                    }

                    if (string.IsNullOrEmpty(finalVal))
                    {
                        result.MissingProperties.Add(propName);
                    }
                    else
                    {
                        result.Properties[propName] = finalVal;
                    }
                }

                Logger.Info("Properties extracted. Valid: " + result.IsValid
                    + ". Missing count: " + result.MissingProperties.Count);
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to extract SolidWorks custom properties", ex);
                foreach (string prop in RequiredProperties)
                {
                    if (!result.Properties.ContainsKey(prop))
                    {
                        result.MissingProperties.Add(prop);
                    }
                }
            }

            return result;
        }
    }
}
