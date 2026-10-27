using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class ProductContract
{
    public string baseUrl { get; set; }
    public string version { get; set; }
    public int protocolVersion { get; set; }
}

internal sealed class CredentialContract
{
    public string baseUrl { get; set; }
    public string serviceVersion { get; set; }
    public int protocolVersion { get; set; }
    public string deviceId { get; set; }
    public string token { get; set; }
}

internal sealed class EnrollmentRequest
{
    public string enrollmentId { get; set; }
    public string code { get; set; }
    public string deviceId { get; set; }
    public string credentialHash { get; set; }
    public string name { get; set; }
    public string serviceVersion { get; set; }
    public int protocolVersion { get; set; }
}

internal sealed class PairingCallback
{
    public string enrollmentId { get; set; }
    public string code { get; set; }
}

internal sealed class ConfiguratorForm : Form
{
    private readonly Button retry = new Button();
    private readonly Label status = new Label();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private readonly ProductContract product;
    private bool pairing;

    internal ConfiguratorForm()
    {
        Text = "AI-PDM 解析服務連結";
        ClientSize = new Size(560, 210);
        MinimumSize = new Size(576, 249);
        Font = new Font("Microsoft JhengHei UI", 10F);
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;

        string productPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "product.json");
        product = json.Deserialize<ProductContract>(File.ReadAllText(productPath, Encoding.UTF8));
        Uri baseUri;
        if (product == null || product.protocolVersion != 1 ||
            !Uri.TryCreate(product.baseUrl, UriKind.Absolute, out baseUri) || baseUri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidDataException("PRODUCT_CONTRACT_INVALID");

        Label title = new Label();
        title.Text = "連結這台電腦到 AI-PDM";
        title.Font = new Font(Font, FontStyle.Bold);
        title.SetBounds(28, 28, 500, 28);
        Controls.Add(title);
        Label help = new Label();
        help.Text = "瀏覽器將自動開啟。請使用公司 Google 帳號登入，並在頁面按一次「連結這台電腦」。";
        help.SetBounds(28, 64, 500, 48);
        Controls.Add(help);
        retry.Text = "重新開啟登入頁";
        retry.SetBounds(28, 120, 170, 38);
        retry.Click += async (sender, args) => await BeginPairingAsync();
        Controls.Add(retry);
        status.SetBounds(28, 166, 500, 36);
        status.AutoEllipsis = true;
        Controls.Add(status);
        Shown += async (sender, args) => await BeginPairingAsync();
    }

    private async Task BeginPairingAsync()
    {
        if (pairing) return;
        pairing = true;
        retry.Enabled = false;
        SetStatus("正在開啟公司登入頁…", false);
        TcpListener listener = null;
        byte[] stateBytes = null;
        try
        {
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start(1);
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            if (port < 49152 || port > 65535) throw new InvalidOperationException("PAIRING_PORT_INVALID");
            stateBytes = new byte[32];
            using (RandomNumberGenerator random = RandomNumberGenerator.Create()) random.GetBytes(stateBytes);
            string state = Base64Url(stateBytes);
            string pairingUrl = product.baseUrl.TrimEnd('/') + "/settings/windows-service?pair=1&port=" +
                port.ToString() + "&state=" + Uri.EscapeDataString(state);
            Process.Start(new ProcessStartInfo(pairingUrl) { UseShellExecute = true });
            SetStatus("等待瀏覽器完成 Google 登入與連結確認…", false);
            Task<TcpClient> accepted = listener.AcceptTcpClientAsync();
            Task timeout = Task.Delay(TimeSpan.FromMinutes(10));
            if (await Task.WhenAny(accepted, timeout) != accepted) throw new TimeoutException("PAIRING_TIMEOUT");
            using (TcpClient client = await accepted)
            {
                IPEndPoint remote = client.Client.RemoteEndPoint as IPEndPoint;
                if (remote == null || !IPAddress.IsLoopback(remote.Address)) throw new InvalidOperationException("PAIRING_REMOTE_INVALID");
                NetworkStream stream = client.GetStream();
                PairingCallback callback = await ReadCallbackAsync(stream, state);
                Exception enrollmentError = null;
                try
                {
                    await EnrollAsync(callback);
                }
                catch (Exception error)
                {
                    enrollmentError = error;
                }
                if (enrollmentError != null)
                {
                    await WriteResponseAsync(stream, 400, "連結失敗", "連結未完成，請回到安裝視窗重試。");
                    throw enrollmentError;
                }
                await WriteResponseAsync(stream, 200, "連結完成", "這台電腦已連結 AI-PDM，可以關閉此頁。");
            }
            SetStatus("連結完成。背景服務會自動接續等待中的解析工作。", false);
        }
        catch (TimeoutException)
        {
            SetStatus("連結已逾時，請按「重新開啟登入頁」。", true);
        }
        catch
        {
            SetStatus("連結失敗；請確認網路、公司帳號與安裝狀態後重試。", true);
        }
        finally
        {
            if (listener != null) listener.Stop();
            if (stateBytes != null) Array.Clear(stateBytes, 0, stateBytes.Length);
            pairing = false;
            retry.Enabled = true;
        }
    }

    private async Task<PairingCallback> ReadCallbackAsync(NetworkStream stream, string expectedState)
    {
        byte[] buffer = new byte[16384];
        int total = 0;
        while (total < buffer.Length)
        {
            int read = await stream.ReadAsync(buffer, total, buffer.Length - total);
            if (read <= 0) break;
            total += read;
            string partial = Encoding.ASCII.GetString(buffer, 0, total);
            if (partial.Contains("\r\n\r\n")) break;
        }
        string request = Encoding.ASCII.GetString(buffer, 0, total);
        Array.Clear(buffer, 0, buffer.Length);
        string firstLine = request.Split(new[] { "\r\n" }, StringSplitOptions.None)[0];
        string[] parts = firstLine.Split(' ');
        if (parts.Length != 3 || parts[0] != "GET") throw new InvalidOperationException("PAIRING_REQUEST_INVALID");
        Uri callbackUri;
        if (!Uri.TryCreate("http://127.0.0.1" + parts[1], UriKind.Absolute, out callbackUri) || callbackUri.AbsolutePath != "/")
            throw new InvalidOperationException("PAIRING_REQUEST_INVALID");
        var query = ParseQuery(callbackUri.Query);
        string state, enrollmentId, code;
        Guid enrollmentGuid;
        if (!query.TryGetValue("state", out state) || !FixedTimeTextEquals(state, expectedState) ||
            !query.TryGetValue("enrollmentId", out enrollmentId) || !Guid.TryParseExact(enrollmentId, "D", out enrollmentGuid) ||
            !query.TryGetValue("code", out code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Za-z0-9_-]{43}$"))
            throw new InvalidOperationException("PAIRING_REQUEST_INVALID");
        return new PairingCallback { enrollmentId = enrollmentId.ToLowerInvariant(), code = code };
    }

    private async Task EnrollAsync(PairingCallback callback)
    {
        byte[] tokenBytes = new byte[32];
        using (RandomNumberGenerator random = RandomNumberGenerator.Create()) random.GetBytes(tokenBytes);
        string token = Base64Url(tokenBytes);
        string deviceId = Guid.NewGuid().ToString("D");
        string tokenHash;
        using (SHA256 sha = SHA256.Create()) tokenHash = Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(token)));
        EnrollmentRequest request = new EnrollmentRequest {
            enrollmentId = callback.enrollmentId, code = callback.code, deviceId = deviceId,
            credentialHash = tokenHash, name = Environment.MachineName,
            serviceVersion = product.version, protocolVersion = product.protocolVersion
        };
        bool accepted = false;
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        using (HttpClient client = new HttpClient())
        {
            client.Timeout = TimeSpan.FromSeconds(30);
            Exception requestError = null;
            try
            {
                using (StringContent content = new StringContent(json.Serialize(request), Encoding.UTF8, "application/json"))
                using (HttpResponseMessage response = await client.PostAsync(product.baseUrl.TrimEnd('/') + "/api/windows-service/enroll", content))
                {
                    accepted = response.StatusCode == HttpStatusCode.OK || response.StatusCode == HttpStatusCode.Created;
                    if (!accepted) throw new InvalidOperationException("ENROLLMENT_REJECTED");
                }
            }
            catch (HttpRequestException error)
            {
                requestError = error;
            }
            catch (TaskCanceledException error)
            {
                requestError = error;
            }
            if (requestError != null)
            {
                accepted = await EnrollmentReadbackAsync(client, token, deviceId);
                if (!accepted) throw requestError;
            }
        }
        if (!accepted) throw new InvalidOperationException("ENROLLMENT_REJECTED");
        CredentialContract credential = new CredentialContract {
            baseUrl = product.baseUrl.TrimEnd('/'), serviceVersion = product.version,
            protocolVersion = product.protocolVersion, deviceId = deviceId, token = token
        };
        byte[] clear = Encoding.UTF8.GetBytes(json.Serialize(credential));
        byte[] protectedBytes = ProtectedData.Protect(clear, null, DataProtectionScope.LocalMachine);
        Array.Clear(clear, 0, clear.Length);
        string credentialPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "AI-PDM Windows Service", "credential.bin");
        Directory.CreateDirectory(Path.GetDirectoryName(credentialPath));
        string temporaryPath = credentialPath + ".new";
        File.WriteAllBytes(temporaryPath, protectedBytes);
        if (File.Exists(credentialPath)) File.Replace(temporaryPath, credentialPath, null);
        else File.Move(temporaryPath, credentialPath);
        Array.Clear(tokenBytes, 0, tokenBytes.Length);
    }

    private async Task<bool> EnrollmentReadbackAsync(HttpClient client, string token, string deviceId)
    {
        using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get,
            product.baseUrl.TrimEnd('/') + "/api/windows-service/self"))
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            using (HttpResponseMessage response = await client.SendAsync(request))
            {
                if (!response.IsSuccessStatusCode) return false;
                string body = await response.Content.ReadAsStringAsync();
                return body.Contains("\"deviceId\":\"" + deviceId + "\"");
            }
        }
    }

    private static async Task WriteResponseAsync(NetworkStream stream, int statusCode, string title, string message)
    {
        string body = "<!doctype html><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\">" +
            "<title>" + title + "</title><main style=\"font-family:system-ui;padding:32px\"><h1>" + title +
            "</h1><p>" + message + "</p></main>";
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        string headers = "HTTP/1.1 " + statusCode + (statusCode == 200 ? " OK" : " Bad Request") + "\r\n" +
            "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\n" +
            "Content-Length: " + bytes.Length + "\r\nConnection: close\r\n\r\n";
        byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
        await stream.WriteAsync(headerBytes, 0, headerBytes.Length);
        await stream.WriteAsync(bytes, 0, bytes.Length);
    }

    private static System.Collections.Generic.Dictionary<string, string> ParseQuery(string query)
    {
        var result = new System.Collections.Generic.Dictionary<string, string>(StringComparer.Ordinal);
        foreach (string pair in query.TrimStart('?').Split('&'))
        {
            if (String.IsNullOrEmpty(pair)) continue;
            string[] parts = pair.Split(new[] { '=' }, 2);
            string key = Uri.UnescapeDataString(parts[0]);
            string value = parts.Length == 2 ? Uri.UnescapeDataString(parts[1]) : "";
            if (result.ContainsKey(key)) throw new InvalidOperationException("PAIRING_QUERY_DUPLICATE");
            result.Add(key, value);
        }
        return result;
    }

    private static bool FixedTimeTextEquals(string left, string right)
    {
        byte[] a = Encoding.UTF8.GetBytes(left ?? "");
        byte[] b = Encoding.UTF8.GetBytes(right ?? "");
        if (a.Length != b.Length) return false;
        int difference = 0;
        for (int index = 0; index < a.Length; index++) difference |= a[index] ^ b[index];
        return difference == 0;
    }

    private void SetStatus(string text, bool error)
    {
        status.Text = text;
        status.ForeColor = error ? Color.Firebrick : Color.DarkGreen;
    }

    private static string Base64Url(byte[] value)
    {
        return Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string Hex(byte[] value)
    {
        StringBuilder builder = new StringBuilder(value.Length * 2);
        foreach (byte item in value) builder.Append(item.ToString("x2"));
        return builder.ToString();
    }
}

internal static class AipdmWindowsConfigurator
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ConfiguratorForm());
    }
}
