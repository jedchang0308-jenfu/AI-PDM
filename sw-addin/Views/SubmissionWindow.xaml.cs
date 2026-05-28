using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using AiPdmAddin.Config;
using AiPdmAddin.Models;
using AiPdmAddin.Services;

namespace AiPdmAddin.Views
{
    public partial class SubmissionWindow : Window
    {
        private readonly AuthService _authService;
        private readonly FileCollector _fileCollector;
        private readonly ApiClient _apiClient;
        private readonly List<SubmissionFile> _collectedFiles;
        private readonly Dictionary<string, string> _metadata;

        public SubmissionWindow(
            AuthService authService,
            FileCollector fileCollector,
            Dictionary<string, string> metadata,
            List<SubmissionFile> files)
        {
            InitializeComponent();
            _authService = authService;
            _fileCollector = fileCollector;
            _apiClient = new ApiClient(authService);
            _metadata = metadata;
            _collectedFiles = files;

            if (_authService.CurrentUser != null)
            {
                LblUserName.Text = _authService.CurrentUser.DisplayName + " (" + _authService.CurrentUser.Role + ")";
            }

            TxtDrawingNumber.Text = GetMetadataValue("drawing_number");
            TxtPartNumber.Text = GetMetadataValue("part_number");
            TxtRevision.Text = GetMetadataValue("revision");
            TxtPartName.Text = GetMetadataValue("part_name");
            TxtMaterial.Text = GetMetadataValue("material");
            TxtSurfaceFinish.Text = GetMetadataValue("surface_finish");

            AddinSettings settings = AddinSettings.Load();
            TxtServerUrl.Text = settings.ServerUrl;

            FilesItemsControl.ItemsSource = _collectedFiles;

            ValidateInputs();
        }

        private string GetMetadataValue(string key)
        {
            string value;
            return _metadata.TryGetValue(key, out value) ? value : "";
        }

        private void TxtChangeDescription_TextChanged(object sender, TextChangedEventArgs e)
        {
            ValidateInputs();
        }

        private void ValidateInputs()
        {
            string text = TxtChangeDescription.Text.Trim();
            int len = text.Length;
            LblWordCount.Text = len + " / 100 chars";

            if (len < 5)
            {
                ShowValidationError("Change description must contain at least 5 characters.");
                return;
            }
            if (len > 100)
            {
                ShowValidationError("Change description must be 100 characters or less.");
                return;
            }

            if (Regex.IsMatch(text, @"^\d+$"))
            {
                ShowValidationError("Change description cannot be only numbers.");
                return;
            }

            if (Regex.IsMatch(text, @"^[\s\p{P}]+$"))
            {
                ShowValidationError("Change description cannot be only symbols.");
                return;
            }

            string[] forbiddenWords = { "change", "update", "test", "modify", "fix" };
            foreach (string word in forbiddenWords)
            {
                if (text.Equals(word, StringComparison.OrdinalIgnoreCase))
                {
                    ShowValidationError("'" + word + "' is too generic. Describe what changed.");
                    return;
                }
            }

            LblValidationAlert.Text = "Change description is valid.";
            LblValidationAlert.Foreground = new SolidColorBrush(Color.FromRgb(0xA6, 0xE3, 0xA1));
            BtnSubmit.IsEnabled = true;
        }

        private void ShowValidationError(string errorMsg)
        {
            LblValidationAlert.Text = errorMsg;
            LblValidationAlert.Foreground = new SolidColorBrush(Color.FromRgb(0xF9, 0xE2, 0xAF));
            BtnSubmit.IsEnabled = false;
        }

        private void BtnLogout_Click(object sender, RoutedEventArgs e)
        {
            _authService.Logout();
            MessageBox.Show("Logged out.", "AI PDM", MessageBoxButton.OK, MessageBoxImage.Information);
            DialogResult = false;
            Close();
        }

        private async void BtnSubmit_Click(object sender, RoutedEventArgs e)
        {
            string serverUrl = TxtServerUrl.Text.Trim();
            if (string.IsNullOrEmpty(serverUrl))
            {
                MessageBox.Show("Enter the PDM server URL.", "AI PDM", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            AddinSettings settings = AddinSettings.Load();
            settings.ServerUrl = serverUrl;
            settings.Save();

            SetLoadingState(true);

            var finalMetadata = new Dictionary<string, string>(_metadata);
            finalMetadata["change_description"] = TxtChangeDescription.Text.Trim();

            var selectedItem = (ComboBoxItem)CmbApprovalRequired.SelectedItem;
            finalMetadata["approval_required"] = selectedItem.Tag.ToString();

            string error = "";
            SubmissionResponse response = null;

            try
            {
                response = await Task.Run(() => _apiClient.Submit(finalMetadata, _collectedFiles, out error));
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            SetLoadingState(false);

            if (response != null && string.IsNullOrEmpty(error))
            {
                MessageBox.Show(
                    "Submission succeeded." + Environment.NewLine
                    + "Submission ID: " + response.SubmissionId + Environment.NewLine
                    + "Status: " + response.Status,
                    "AI PDM",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information
                );

                _fileCollector.CleanUp(_collectedFiles);

                DialogResult = true;
                Close();
            }
            else
            {
                MessageBox.Show(
                    "Submission failed." + Environment.NewLine + "Error: " + error,
                    "AI PDM",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error
                );

                _fileCollector.CleanUp(_collectedFiles);
            }
        }

        private void SetLoadingState(bool isLoading)
        {
            BtnSubmit.IsEnabled = !isLoading;
            TxtChangeDescription.IsEnabled = !isLoading;
            TxtServerUrl.IsEnabled = !isLoading;
            CmbApprovalRequired.IsEnabled = !isLoading;
            BtnLogout.IsEnabled = !isLoading;

            ProgressIndicator.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            if (isLoading)
            {
                LblError.Visibility = Visibility.Collapsed;
            }
        }
    }
}
