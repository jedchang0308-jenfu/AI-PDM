using System;
using System.IO;

namespace AiPdmAddin.Services
{
    public static class Logger
    {
        private static readonly string LogDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AiPdm",
            "logs"
        );

        static Logger()
        {
            try
            {
                if (!Directory.Exists(LogDir))
                {
                    Directory.CreateDirectory(LogDir);
                }
                CleanOldLogs();
            }
            catch
            {
                // Logging must not block SolidWorks startup.
            }
        }

        public static void Info(string message)
        {
            Log("INFO", message);
        }

        public static void Debug(string message)
        {
            Log("DEBUG", message);
        }

        public static void Error(string message, Exception ex = null)
        {
            string msg = message;
            if (ex != null)
            {
                msg += Environment.NewLine + "Exception: " + ex.Message
                    + Environment.NewLine + "StackTrace: " + ex.StackTrace;
            }
            Log("ERROR", msg);
        }

        private static void Log(string level, string message)
        {
            try
            {
                string logFile = Path.Combine(LogDir, "addin-" + DateTime.Today.ToString("yyyy-MM-dd") + ".log");
                string logLine = "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] ["
                    + level + "] " + message + Environment.NewLine;
                File.AppendAllText(logFile, logLine);
            }
            catch
            {
                // Fail silently.
            }
        }

        private static void CleanOldLogs()
        {
            try
            {
                if (!Directory.Exists(LogDir)) return;
                string[] files = Directory.GetFiles(LogDir, "addin-*.log");
                DateTime cutoff = DateTime.Today.AddDays(-30);
                foreach (string file in files)
                {
                    try
                    {
                        var info = new FileInfo(file);
                        if (info.LastWriteTime < cutoff)
                        {
                            File.Delete(file);
                        }
                    }
                    catch
                    {
                        // Ignore a single deletion error.
                    }
                }
            }
            catch
            {
                // Fallback.
            }
        }
    }
}
