using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using AiPdmAddin.Config;
using AiPdmAddin.Models;

namespace AiPdmAddin.Services
{
    public class ApiClient
    {
        private readonly AuthService _authService;

        public ApiClient(AuthService authService)
        {
            _authService = authService;
        }

        public SubmissionResponse Submit(Dictionary<string, string> metadata, List<SubmissionFile> files, out string errorMessage)
        {
            errorMessage = "";
            try
            {
                AddinSettings settings = AddinSettings.Load();
                string token = _authService.GetToken();

                if (string.IsNullOrEmpty(token))
                {
                    errorMessage = "You are not logged in. Please login before submitting.";
                    return null;
                }

                if (!CheckItemLock(metadata, settings, token, out errorMessage))
                {
                    Logger.Error("Submission blocked by checkout lock preflight: " + errorMessage);
                    return null;
                }

                if (!ValidateFilesBeforeUpload(files, settings.MaxUploadFileBytes, out errorMessage))
                {
                    Logger.Error("Submission blocked before upload: " + errorMessage);
                    return null;
                }

                using (var handler = new HttpClientHandler())
                {
                    handler.ServerCertificateCustomValidationCallback = delegate { return true; };

                    using (var client = new HttpClient(handler))
                    {
                        client.Timeout = TimeSpan.FromMinutes(5);
                        string url = settings.ServerUrl.TrimEnd('/') + "/api/submissions";

                        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                        using (var content = new MultipartFormDataContent())
                        {
                            foreach (var pair in metadata)
                            {
                                content.Add(new StringContent(pair.Value ?? ""), pair.Key);
                            }

                            foreach (SubmissionFile file in files)
                            {
                                if (!File.Exists(file.FilePath))
                                {
                                    Logger.Error("File to upload not found: " + file.FilePath);
                                    continue;
                                }

                                byte[] fileBytes = File.ReadAllBytes(file.FilePath);
                                var fileContent = new ByteArrayContent(fileBytes);

                                string ext = Path.GetExtension(file.FilePath).ToLower();
                                if (ext == ".pdf") fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
                                else if (ext == ".dwg") fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/vnd.dwg");
                                else fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

                                content.Add(fileContent, "files", file.OriginalFilename);
                                Logger.Info("Attached file: " + file.OriginalFilename + " (" + fileBytes.Length + " bytes) as role " + file.FileRole);
                            }

                            Logger.Info("Sending multipart submit payload to " + url + "...");
                            var response = client.PostAsync(url, content).Result;
                            string jsonResponse = response.Content.ReadAsStringAsync().Result;

                            Logger.Info("Server response code: " + response.StatusCode);

                            if (response.IsSuccessStatusCode)
                            {
                                return JsonHelper.Deserialize<SubmissionResponse>(jsonResponse);
                            }

                            if (response.StatusCode == HttpStatusCode.Unauthorized)
                            {
                                _authService.Logout();
                                errorMessage = "Login session expired. Please login again.";
                            }
                            else if (response.StatusCode == HttpStatusCode.Conflict)
                            {
                                errorMessage = "Duplicate drawing number and revision. Submission was rejected.";
                            }
                            else
                            {
                                try
                                {
                                    SubmissionResponse errResult = JsonHelper.Deserialize<SubmissionResponse>(jsonResponse);
                                    errorMessage = errResult != null && !string.IsNullOrEmpty(errResult.Error)
                                        ? errResult.Error
                                        : "Server rejected the submission. HTTP " + response.StatusCode;
                                }
                                catch
                                {
                                    errorMessage = "Server rejected the submission. HTTP " + response.StatusCode;
                                }
                            }
                            Logger.Error("Submit failed: " + errorMessage);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                errorMessage = "Upload failed. Check the server URL, network, and add-in log. " + ex.Message;
                Logger.Error("Exception during PDM submission upload", ex);
            }
            return null;
        }

        private bool CheckItemLock(Dictionary<string, string> metadata, AddinSettings settings, string token, out string errorMessage)
        {
            errorMessage = "";
            string drawingNumber = GetMetadata(metadata, "drawing_number");
            string partNumber = GetMetadata(metadata, "part_number");

            if (string.IsNullOrWhiteSpace(drawingNumber) && string.IsNullOrWhiteSpace(partNumber))
            {
                errorMessage = "Missing drawing number or part number for checkout lock preflight.";
                return false;
            }

            try
            {
                using (var handler = new HttpClientHandler())
                {
                    handler.ServerCertificateCustomValidationCallback = delegate { return true; };

                    using (var client = new HttpClient(handler))
                    {
                        client.Timeout = TimeSpan.FromSeconds(30);
                        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                        string url = settings.ServerUrl.TrimEnd('/') + "/api/submissions/preflight-lock";

                        var request = new LockPreflightRequest
                        {
                            DrawingNumber = drawingNumber,
                            PartNumber = partNumber,
                            PdmCompanyCode = GetMetadata(metadata, "pdm_company_code")
                        };
                        string json = JsonHelper.Serialize(request);
                        var content = new StringContent(json, Encoding.UTF8, "application/json");

                        Logger.Info("Checking checkout lock preflight at " + url + "...");
                        var response = client.PostAsync(url, content).Result;
                        string jsonResponse = response.Content.ReadAsStringAsync().Result;

                        if (response.IsSuccessStatusCode)
                        {
                            LockPreflightResponse result = JsonHelper.Deserialize<LockPreflightResponse>(jsonResponse);
                            if (result != null && result.Locked && !result.LockedByCurrentUser)
                            {
                                ItemLockDto activeLock = result.Lock;
                                string owner = activeLock != null && !string.IsNullOrWhiteSpace(activeLock.LockedByName)
                                    ? activeLock.LockedByName
                                    : "another user";
                                string lockPart = activeLock != null && !string.IsNullOrWhiteSpace(activeLock.PartNumber)
                                    ? activeLock.PartNumber
                                    : partNumber;
                                string reason = activeLock != null && !string.IsNullOrWhiteSpace(activeLock.LockReason)
                                    ? activeLock.LockReason
                                    : "Edit reservation";
                                string expiresAt = activeLock != null && !string.IsNullOrWhiteSpace(activeLock.ExpiresAt)
                                    ? activeLock.ExpiresAt
                                    : "the recorded expiry time";

                                errorMessage = "Part " + lockPart + " is currently reserved by " + owner
                                    + " until " + expiresAt + ". Reason: " + reason
                                    + ". Ask the owner to release checkout before submitting.";
                                return false;
                            }

                            return true;
                        }

                        if (response.StatusCode == HttpStatusCode.Unauthorized)
                        {
                            _authService.Logout();
                            errorMessage = "Login session expired. Please login again.";
                            return false;
                        }

                        LockPreflightResponse errorResult = JsonHelper.Deserialize<LockPreflightResponse>(jsonResponse);
                        errorMessage = errorResult != null && !string.IsNullOrWhiteSpace(errorResult.Error)
                            ? errorResult.Error
                            : "Checkout lock preflight failed. HTTP " + response.StatusCode;
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                errorMessage = "Checkout lock preflight failed. Check the server URL and network. " + ex.Message;
                Logger.Error("Exception during checkout lock preflight", ex);
                return false;
            }
        }

        private string GetMetadata(Dictionary<string, string> metadata, string key)
        {
            string value;
            return metadata != null && metadata.TryGetValue(key, out value) ? value ?? "" : "";
        }

        private bool ValidateFilesBeforeUpload(List<SubmissionFile> files, long maxUploadFileBytes, out string errorMessage)
        {
            errorMessage = "";
            if (files == null || files.Count == 0)
            {
                errorMessage = "No files were collected for upload.";
                return false;
            }

            foreach (SubmissionFile file in files)
            {
                if (file == null || string.IsNullOrWhiteSpace(file.FilePath))
                {
                    errorMessage = "A collected file has no valid local path.";
                    return false;
                }

                if (!File.Exists(file.FilePath))
                {
                    errorMessage = "Upload file is missing: " + (file.OriginalFilename ?? file.FilePath);
                    return false;
                }

                var fileInfo = new FileInfo(file.FilePath);
                if (fileInfo.Length <= 0)
                {
                    errorMessage = "Upload file is empty: " + file.OriginalFilename;
                    return false;
                }

                if (fileInfo.Length > maxUploadFileBytes)
                {
                    errorMessage = file.OriginalFilename + " is " + FormatBytes(fileInfo.Length)
                        + ", exceeding the upload limit of " + FormatBytes(maxUploadFileBytes) + ".";
                    return false;
                }
            }

            return true;
        }

        private string FormatBytes(long bytes)
        {
            const double mb = 1024d * 1024d;
            if (bytes >= mb)
            {
                return string.Format("{0:0.#} MB", bytes / mb);
            }
            return bytes + " bytes";
        }
    }
}
