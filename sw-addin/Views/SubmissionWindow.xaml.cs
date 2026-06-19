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
            PopulatePdmCompanyOptions(settings);

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
            finalMetadata["pdm_company_code"] = GetSelectedPdmCompanyCode();

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
                settings.SelectedPdmCompanyCode = GetSelectedPdmCompanyCode();
                settings.Save();
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
            CmbPdmCompany.IsEnabled = !isLoading && CmbPdmCompany.Items.Count > 1;
            CmbApprovalRequired.IsEnabled = !isLoading;
            BtnLogout.IsEnabled = !isLoading;

            ProgressIndicator.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            if (isLoading)
            {
                LblError.Visibility = Visibility.Collapsed;
            }
        }

        private void PopulatePdmCompanyOptions(AddinSettings settings)
        {
            CmbPdmCompany.Items.Clear();
            UserDto user = _authService.CurrentUser;
            if (user != null && user.Companies != null && user.Companies.Count > 0)
            {
                foreach (CompanyDto company in user.Companies)
                {
                    string code = string.IsNullOrWhiteSpace(company.CompanyCode) ? "JENFU" : company.CompanyCode;
                    string label = string.IsNullOrWhiteSpace(company.DisplayName) ? code : company.DisplayName + " (" + code + ")";
                    CmbPdmCompany.Items.Add(new ComboBoxItem { Content = label, Tag = code });
                }
            }

            if (CmbPdmCompany.Items.Count == 0)
            {
                CmbPdmCompany.Items.Add(new ComboBoxItem { Content = "鉦富 (JENFU)", Tag = "JENFU" });
            }

            string preferredCode = !string.IsNullOrWhiteSpace(settings.SelectedPdmCompanyCode)
                ? settings.SelectedPdmCompanyCode
                : user != null && user.DefaultCompany != null
                    ? user.DefaultCompany.CompanyCode
                    : "JENFU";

            CmbPdmCompany.SelectedIndex = 0;
            for (int index = 0; index < CmbPdmCompany.Items.Count; index++)
            {
                ComboBoxItem item = CmbPdmCompany.Items[index] as ComboBoxItem;
                if (item != null && string.Equals(Convert.ToString(item.Tag), preferredCode, StringComparison.OrdinalIgnoreCase))
                {
                    CmbPdmCompany.SelectedIndex = index;
                    break;
                }
            }

            CmbPdmCompany.IsEnabled = CmbPdmCompany.Items.Count > 1;
        }

        private string GetSelectedPdmCompanyCode()
        {
            ComboBoxItem item = CmbPdmCompany.SelectedItem as ComboBoxItem;
            return item != null && item.Tag != null ? Convert.ToString(item.Tag) : "JENFU";
        }
    }
}
