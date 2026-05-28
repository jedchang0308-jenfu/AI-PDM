using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using AiPdmAddin.Services;
using AiPdmAddin.Views;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swpublished;

namespace AiPdmAddin
{
    [ComVisible(true)]
    [Guid("A9CDE8EE-DFE4-4EAF-9B3B-9E5B1CC6A41B")]
    [ProgId("AiPdmAddin.SwAddin")]
    public class SwAddin : ISwAddin
    {
        private const int MainCommandGroupId = 1;
        private const int LoginCommandId = 0;
        private const int SubmitCommandId = 1;

        private SldWorks _swApp;
        private ICommandManager _commandManager;
        private int _addinCookie;

        private readonly AuthService _authService = new AuthService();
        private readonly PropertyExtractor _propertyExtractor = new PropertyExtractor();
        private readonly FileCollector _fileCollector = new FileCollector();

        public bool ConnectToSW(object thisSw, int cookie)
        {
            try
            {
                _swApp = (SldWorks)thisSw;
                _addinCookie = cookie;
                _swApp.SetAddinCallbackInfo2(0, this, _addinCookie);
                _commandManager = _swApp.GetCommandManager(_addinCookie);

                AddCommandManager();
                Logger.Info("SolidWorks AI PDM Add-in connected.");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to connect SolidWorks AI PDM Add-in.", ex);
                return false;
            }
        }

        public bool DisconnectFromSW()
        {
            try
            {
                RemoveCommandManager();
                ReleaseComObject(_commandManager);
                ReleaseComObject(_swApp);
                _commandManager = null;
                _swApp = null;
                Logger.Info("SolidWorks AI PDM Add-in disconnected.");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to disconnect SolidWorks AI PDM Add-in cleanly.", ex);
                return false;
            }
        }

        [ComRegisterFunction]
        public static void RegisterFunction(Type type)
        {
            SwAddinRegistration.Register(type);
        }

        [ComUnregisterFunction]
        public static void UnregisterFunction(Type type)
        {
            SwAddinRegistration.Unregister(type);
        }

        public void ShowLoginCommand()
        {
            try
            {
                EnsureWpfApplication();
                var loginWindow = new LoginWindow(_authService);
                loginWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to open login window.", ex);
                MessageBox.Show("Unable to open the AI PDM login window.", "AI PDM", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        public void SubmitToPdmCommand()
        {
            try
            {
                EnsureWpfApplication();

                if (!_authService.IsLoggedIn())
                {
                    var loginWindow = new LoginWindow(_authService);
                    bool? loginResult = loginWindow.ShowDialog();
                    if (loginResult != true)
                    {
                        Logger.Info("PDM submission cancelled because login did not complete.");
                        return;
                    }
                }

                IModelDoc2 activeDoc = _swApp == null ? null : _swApp.IActiveDoc2;
                if (activeDoc == null)
                {
                    MessageBox.Show("Open a SolidWorks document before submitting to AI PDM.", "AI PDM", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                PropertyExtractor.ExtractionResult extraction = _propertyExtractor.Extract(activeDoc);
                if (!extraction.IsValid)
                {
                    string missing = string.Join(System.Environment.NewLine, extraction.MissingProperties.Select((name) => "- " + name));
                    MessageBox.Show(
                        "Required custom properties are missing:" + System.Environment.NewLine + missing,
                        "AI PDM",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                    return;
                }

                string drawingNumber = extraction.Properties["drawing_number"];
                string revision = extraction.Properties["revision"];
                var files = _fileCollector.CollectFiles(activeDoc, drawingNumber, revision);
                if (files.Count == 0)
                {
                    MessageBox.Show("No submission files were collected from the active SolidWorks document.", "AI PDM", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                var submissionWindow = new SubmissionWindow(_authService, _fileCollector, extraction.Properties, files);
                submissionWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                Logger.Error("Unhandled exception while preparing PDM submission.", ex);
                MessageBox.Show("AI PDM submission failed before upload. Check the add-in log for details.", "AI PDM", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        public int CanAlwaysRun()
        {
            return 1;
        }

        public int CanSubmitToPdm()
        {
            return _swApp != null && _swApp.IActiveDoc2 != null ? 1 : 0;
        }

        private void AddCommandManager()
        {
            if (_commandManager == null)
            {
                throw new InvalidOperationException("SolidWorks command manager is not available.");
            }

            int errors = 0;
            bool ignorePrevious = true;
            ICommandGroup commandGroup = _commandManager.CreateCommandGroup2(
                MainCommandGroupId,
                "AI PDM",
                "AI PDM login and submission tools",
                "AI PDM",
                -1,
                ignorePrevious,
                ref errors
            );

            int itemType = (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem;
            commandGroup.AddCommandItem2(
                "Login",
                -1,
                "Login to AI PDM",
                "Login",
                -1,
                "ShowLoginCommand",
                "CanAlwaysRun",
                LoginCommandId,
                itemType
            );
            commandGroup.AddCommandItem2(
                "Submit",
                -1,
                "Validate metadata, export files, and submit to AI PDM",
                "Submit",
                -1,
                "SubmitToPdmCommand",
                "CanSubmitToPdm",
                SubmitCommandId,
                itemType
            );

            commandGroup.HasToolbar = true;
            commandGroup.HasMenu = true;
            commandGroup.Activate();
        }

        private void RemoveCommandManager()
        {
            if (_commandManager == null)
            {
                return;
            }

            try
            {
                _commandManager.RemoveCommandGroup2(MainCommandGroupId, true);
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to remove AI PDM command group from SolidWorks.", ex);
            }
        }

        private static void EnsureWpfApplication()
        {
            if (Application.Current != null)
            {
                return;
            }

            new Application
            {
                ShutdownMode = ShutdownMode.OnExplicitShutdown
            };
        }

        private static void ReleaseComObject(object comObject)
        {
            if (comObject != null && Marshal.IsComObject(comObject))
            {
                Marshal.FinalReleaseComObject(comObject);
            }
        }
    }

    internal static class SwAddinRegistration
    {
        private const string AddinsRegistryPath = @"SOFTWARE\SolidWorks\Addins";
        private const string StartupRegistryPath = @"SOFTWARE\SolidWorks\AddInsStartup";

        public static void Register(Type type)
        {
            try
            {
                string addinPath = AddinsRegistryPath + @"\{" + type.GUID + "}";
                using (var addinsKey = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(addinPath))
                {
                    if (addinsKey != null)
                    {
                        addinsKey.SetValue(null, 1, Microsoft.Win32.RegistryValueKind.DWord);
                        addinsKey.SetValue("Title", "AI PDM Add-in");
                        addinsKey.SetValue("Description", "SolidWorks add-in for AI PDM submission.");
                    }
                }

                string startupPath = StartupRegistryPath + @"\{" + type.GUID + "}";
                using (var startupKey = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(startupPath))
                {
                    if (startupKey != null)
                    {
                        startupKey.SetValue(null, 1, Microsoft.Win32.RegistryValueKind.DWord);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to register SolidWorks AI PDM add-in.", ex);
            }
        }

        public static void Unregister(Type type)
        {
            try
            {
                Microsoft.Win32.Registry.LocalMachine.DeleteSubKeyTree(AddinsRegistryPath + @"\{" + type.GUID + "}", false);
                Microsoft.Win32.Registry.CurrentUser.DeleteSubKeyTree(StartupRegistryPath + @"\{" + type.GUID + "}", false);
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to unregister SolidWorks AI PDM add-in.", ex);
            }
        }
    }
}
