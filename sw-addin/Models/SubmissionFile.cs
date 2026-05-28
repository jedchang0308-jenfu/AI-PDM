namespace AiPdmAddin.Models
{
    public class SubmissionFile
    {
        public string FilePath { get; set; }
        public string OriginalFilename { get; set; }
        public string FileRole { get; set; } // "sldprt", "sldasm", "slddrw", "pdf", "dwg", "other"
        public bool IsTemporary { get; set; } // True if generated dynamically in %TEMP% and needs cleanup

        public SubmissionFile(string filePath, string fileRole, bool isTemporary = false)
        {
            FilePath = filePath;
            OriginalFilename = System.IO.Path.GetFileName(filePath);
            FileRole = fileRole;
            IsTemporary = isTemporary;
        }
    }
}
