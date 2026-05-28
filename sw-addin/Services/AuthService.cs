using System;
using System.IO;
using System.Net.Http;
using System.Runtime.Serialization;
using System.Security.Cryptography;
using System.Text;
using AiPdmAddin.Config;
using AiPdmAddin.Models;

namespace AiPdmAddin.Services
{
    public class AuthService
    {
        private static readonly string TokenFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AiPdm",
            "token.dat"
        );

        private static string _cachedToken = null;
        private static UserDto _currentUser = null;

        public UserDto CurrentUser
        {
            get { return _currentUser; }
        }

        public bool Login(string email, string password, out string errorMessage)
        {
            errorMessage = "";
            try
            {
                AddinSettings settings = AddinSettings.Load();
                using (var client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromSeconds(15);
                    string url = settings.ServerUrl.TrimEnd('/') + "/api/auth/token";
                    var payload = new LoginRequest { Email = email, Password = password };
                    string jsonPayload = JsonHelper.Serialize(payload);
                    var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                    Logger.Info("Attempting to login user: " + email + " at " + url);
                    var response = client.PostAsync(url, content).Result;
                    string jsonResponse = response.Content.ReadAsStringAsync().Result;

                    if (response.IsSuccessStatusCode)
                    {
                        TokenResponse result = JsonHelper.Deserialize<TokenResponse>(jsonResponse);
                        if (result != null && !string.IsNullOrEmpty(result.Token))
                        {
                            SaveToken(result.Token);
                            _cachedToken = result.Token;
                            _currentUser = result.User;

                            settings.SavedEmail = email;
                            settings.Save();

                            string role = result.User == null ? "" : result.User.Role;
                            Logger.Info("Login successful for user: " + email + " (Role: " + role + ")");
                            return true;
                        }
                        errorMessage = "Login response did not include a token.";
                    }
                    else
                    {
                        TokenResponse errResult = JsonHelper.Deserialize<TokenResponse>(jsonResponse);
                        errorMessage = errResult != null && !string.IsNullOrEmpty(errResult.Error)
                            ? errResult.Error
                            : "Login failed. HTTP " + response.StatusCode;
                        Logger.Error("Login failed: " + errorMessage);
                    }
                }
            }
            catch (Exception ex)
            {
                errorMessage = "Unable to connect to the PDM server. Check the server URL and network. " + ex.Message;
                Logger.Error("Exception during login", ex);
            }
            return false;
        }

        public string GetToken()
        {
            if (_cachedToken != null) return _cachedToken;

            try
            {
                if (File.Exists(TokenFilePath))
                {
                    byte[] encryptedData = File.ReadAllBytes(TokenFilePath);
                    byte[] decryptedData = ProtectedData.Unprotect(
                        encryptedData,
                        null,
                        DataProtectionScope.CurrentUser
                    );
                    _cachedToken = Encoding.UTF8.GetString(decryptedData);
                    return _cachedToken;
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to decrypt saved PDM token. User must login again.", ex);
                Logout();
            }

            return null;
        }

        public bool IsLoggedIn()
        {
            return !string.IsNullOrEmpty(GetToken());
        }

        public void Logout()
        {
            _cachedToken = null;
            _currentUser = null;
            try
            {
                if (File.Exists(TokenFilePath))
                {
                    File.Delete(TokenFilePath);
                }
                Logger.Info("User logged out; local token cleared.");
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to clear local token file during logout", ex);
            }
        }

        private void SaveToken(string token)
        {
            try
            {
                string dir = Path.GetDirectoryName(TokenFilePath);
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                byte[] data = Encoding.UTF8.GetBytes(token);
                byte[] encryptedData = ProtectedData.Protect(
                    data,
                    null,
                    DataProtectionScope.CurrentUser
                );
                File.WriteAllBytes(TokenFilePath, encryptedData);
                Logger.Info("Token encrypted and saved with DPAPI.");
            }
            catch (Exception ex)
            {
                Logger.Error("Failed to securely save token", ex);
            }
        }

        [DataContract]
        private class LoginRequest
        {
            [DataMember(Name = "email")]
            public string Email { get; set; }

            [DataMember(Name = "password")]
            public string Password { get; set; }
        }
    }
}
