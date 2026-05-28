using System;
using System.Collections.Generic;
using System.IO;
using AiPdmAddin.Models;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace AiPdmAddin.Services
{
    public class FileCollector
    {
        public List<SubmissionFile> CollectFiles(IModelDoc2 modelDoc, string drawingNumber, string revision)
        {
            var files = new List<SubmissionFile>();
            if (modelDoc == null) return files;

            string originalPath = modelDoc.GetPathName();
            if (string.IsNullOrEmpty(originalPath))
            {
                throw new InvalidOperationException("The SolidWorks document must be saved before submitting to AI PDM.");
            }

            int type = modelDoc.GetType();
            string role;

            if (type == (int)swDocumentTypes_e.swDocPART) role = "sldprt";
            else if (type == (int)swDocumentTypes_e.swDocASSEMBLY) role = "sldasm";
            else if (type == (int)swDocumentTypes_e.swDocDRAWING) role = "slddrw";
            else role = "other";

            files.Add(new SubmissionFile(originalPath, role, false));
            Logger.Info("Native file collected: " + originalPath + " (Role: " + role + ")");

            if (type == (int)swDocumentTypes_e.swDocDRAWING)
            {
                try
                {
                    string tempDir = Path.Combine(Path.GetTempPath(), "AiPdm");
                    if (!Directory.Exists(tempDir))
                    {
                        Directory.CreateDirectory(tempDir);
                    }

                    string fileBaseName = drawingNumber + "_Rev" + revision;
                    string pdfPath = Path.Combine(tempDir, fileBaseName + ".pdf");
                    string dwgPath = Path.Combine(tempDir, fileBaseName + ".dwg");

                    Logger.Info("Exporting PDF silently to " + pdfPath);
                    int errors = 0;
                    int warnings = 0;
                    bool pdfSuccess = modelDoc.Extension.SaveAs3(
                        pdfPath,
                        (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                        null,
                        null,
                        ref errors,
                        ref warnings
                    );

                    if (pdfSuccess && File.Exists(pdfPath))
                    {
                        files.Add(new SubmissionFile(pdfPath, "pdf", true));
                        Logger.Info("PDF exported successfully.");
                    }
                    else
                    {
                        Logger.Error("PDF export failed. Errors: " + errors + ", Warnings: " + warnings);
                    }

                    Logger.Info("Exporting DWG silently to " + dwgPath);
                    errors = 0;
                    warnings = 0;
                    bool dwgSuccess = modelDoc.Extension.SaveAs3(
                        dwgPath,
                        (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                        null,
                        null,
                        ref errors,
                        ref warnings
                    );

                    if (dwgSuccess && File.Exists(dwgPath))
                    {
                        files.Add(new SubmissionFile(dwgPath, "dwg", true));
                        Logger.Info("DWG exported successfully.");
                    }
                    else
                    {
                        Logger.Error("DWG export failed. Errors: " + errors + ", Warnings: " + warnings);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Error("Exception occurred during PDF/DWG background exports", ex);
                }
            }

            return files;
        }

        public void CleanUp(List<SubmissionFile> files)
        {
            if (files == null) return;
            foreach (SubmissionFile file in files)
            {
                if (file.IsTemporary && File.Exists(file.FilePath))
                {
                    try
                    {
                        File.Delete(file.FilePath);
                        Logger.Info("Temporary file deleted: " + file.FilePath);
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("Failed to delete temporary file: " + file.FilePath, ex);
                    }
                }
            }
        }
    }
}
