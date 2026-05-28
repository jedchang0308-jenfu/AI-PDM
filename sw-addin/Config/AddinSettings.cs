using System;
using System.IO;
using System.Runtime.Serialization;
using AiPdmAddin.Services;

namespace AiPdmAddin.Config
{
    [DataContract]
    public class AddinSettings
    {
        [DataMember(Name = "serverUrl")]
        public string ServerUrl { get; set; }

        [DataMember(Name = "savedEmail")]
        public string SavedEmail { get; set; }

        [DataMember(Name = "maxUploadFileBytes")]
        public long MaxUploadFileBytes { get; set; }

        private static readonly string SettingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AiPdm",
            "settings.json"
        );

        public AddinSettings()
        {
            ServerUrl = "http://localhost:3000";
            SavedEmail = "";
            MaxUploadFileBytes = 50L * 1024L * 1024L;
        }

        public static AddinSettings Load()
        {
            try
            {
                if (File.Exists(SettingsPath))
                {
                    string json = File.ReadAllText(SettingsPath);
                    AddinSettings settings = JsonHelper.Deserialize<AddinSettings>(json);
                    if (settings != null)
                    {
                        settings.ApplyDefaults();
                        return settings;
                    }
                }
            }
            catch
            {
                // Fallback to default settings.
            }
            return new AddinSettings();
        }

        public void Save()
        {
            try
            {
                string dir = Path.GetDirectoryName(SettingsPath);
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(SettingsPath, JsonHelper.Serialize(this));
            }
            catch
            {
                // Settings persistence must not block CAD work.
            }
        }

        private void ApplyDefaults()
        {
            if (string.IsNullOrWhiteSpace(ServerUrl))
            {
                ServerUrl = "http://localhost:3000";
            }
            if (SavedEmail == null)
            {
                SavedEmail = "";
            }
            if (MaxUploadFileBytes <= 0)
            {
                MaxUploadFileBytes = 50L * 1024L * 1024L;
            }
        }
    }
}
