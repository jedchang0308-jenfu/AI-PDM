using System.Threading.Tasks;
using System.Windows;
using AiPdmAddin.Config;
using AiPdmAddin.Services;

namespace AiPdmAddin.Views
{
    public partial class LoginWindow : Window
    {
        private readonly AuthService _authService;

        public bool IsLoginSuccessful { get; private set; }

        public LoginWindow(AuthService authService)
        {
            InitializeComponent();
            _authService = authService;
            IsLoginSuccessful = false;

            AddinSettings settings = AddinSettings.Load();
            if (!string.IsNullOrEmpty(settings.SavedEmail))
            {
                TxtEmail.Text = settings.SavedEmail;
                TxtPassword.Focus();
            }
            else
            {
                TxtEmail.Focus();
            }
        }

        private async void BtnLogin_Click(object sender, RoutedEventArgs e)
        {
            string email = TxtEmail.Text.Trim();
            string password = TxtPassword.Password;

            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
            {
                ShowError("Enter email and password.");
                return;
            }

            SetLoadingState(true);

            string error = "";
            bool success = await Task.Run(() => _authService.Login(email, password, out error));

            SetLoadingState(false);

            if (success)
            {
                IsLoginSuccessful = true;
                DialogResult = true;
                Close();
            }
            else
            {
                ShowError(error);
            }
        }

        private void SetLoadingState(bool isLoading)
        {
            BtnLogin.IsEnabled = !isLoading;
            TxtEmail.IsEnabled = !isLoading;
            TxtPassword.IsEnabled = !isLoading;
            ProgressIndicator.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            if (isLoading)
            {
                LblError.Visibility = Visibility.Collapsed;
            }
        }

        private void ShowError(string message)
        {
            LblError.Text = message;
            LblError.Visibility = Visibility.Visible;
        }
    }
}
