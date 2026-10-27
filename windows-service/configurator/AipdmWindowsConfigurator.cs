using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
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

internal sealed class ConfiguratorForm : Form
{
    private readonly TextBox enrollmentId = new TextBox();
    private readonly TextBox code = new TextBox();
    private readonly Button register = new Button();
    private readonly Label status = new Label();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private readonly ProductContract product;

    internal ConfiguratorForm()
    {
        Text = "AI-PDM 解析服務設定";
        ClientSize = new Size(560, 280);
        MinimumSize = new Size(576, 319);
        Font = new Font("Microsoft JhengHei UI", 10F);
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;

        string productPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "product.json");
        product = json.Deserialize<ProductContract>(File.ReadAllText(productPath, Encoding.UTF8));
        if (product == null || product.protocolVersion != 1 || !Uri.IsWellFormedUriString(product.baseUrl, UriKind.Absolute))
            throw new InvalidDataException("PRODUCT_CONTRACT_INVALID");

        Controls.Add(CreateLabel("註冊 ID", 28, 26));
        enrollmentId.SetBounds(28, 52, 500, 30);
        Controls.Add(enrollmentId);
        Controls.Add(CreateLabel("單次註冊碼", 28, 95));
        code.SetBounds(28, 121, 500, 30);
        Controls.Add(code);
        register.Text = "註冊這台電腦";
        register.SetBounds(28, 170, 160, 38);
        register.Click += async (sender, args) => await RegisterAsync();
        Controls.Add(register);
        status.SetBounds(28, 220, 500, 44);
        status.AutoEllipsis = true;
        Controls.Add(status);
        AcceptButton = register;
    }

    private static Label CreateLabel(string text, int x, int y)
    {
        Label label = new Label();
        label.Text = text;
        label.SetBounds(x, y, 500, 24);
        return label;
    }

    private async Task RegisterAsync()
    {
        Guid parsed;
        string enrollment = enrollmentId.Text.Trim().ToLowerInvariant();
        string oneTimeCode = code.Text.Trim();
        if (!Guid.TryParseExact(enrollment, "D", out parsed) || !System.Text.RegularExpressions.Regex.IsMatch(oneTimeCode, "^[A-Za-z0-9_-]{43}$"))
        {
            SetStatus("註冊 ID 或單次註冊碼格式不正確。", true);
            return;
        }
        register.Enabled = false;
        SetStatus("正在註冊…", false);
        string credentialPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "AI-PDM Windows Service", "credential.bin");
        byte[] priorCredential = null;
        try
        {
            if (File.Exists(credentialPath)) priorCredential = File.ReadAllBytes(credentialPath);
            byte[] tokenBytes = new byte[32];
            using (RandomNumberGenerator random = RandomNumberGenerator.Create()) random.GetBytes(tokenBytes);
            string token = Base64Url(tokenBytes);
            string deviceId = Guid.NewGuid().ToString("D");
            string tokenHash;
            using (SHA256 sha = SHA256.Create()) tokenHash = Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(token)));
            CredentialContract credential = new CredentialContract {
                baseUrl = product.baseUrl.TrimEnd('/'), serviceVersion = product.version,
                protocolVersion = product.protocolVersion, deviceId = deviceId, token = token
            };
            byte[] clear = Encoding.UTF8.GetBytes(json.Serialize(credential));
            byte[] protectedBytes = ProtectedData.Protect(clear, null, DataProtectionScope.LocalMachine);
            Array.Clear(clear, 0, clear.Length);
            Directory.CreateDirectory(Path.GetDirectoryName(credentialPath));
            string temporaryPath = credentialPath + ".new";
            File.WriteAllBytes(temporaryPath, protectedBytes);
            if (File.Exists(credentialPath)) File.Replace(temporaryPath, credentialPath, null);
            else File.Move(temporaryPath, credentialPath);

            EnrollmentRequest request = new EnrollmentRequest {
                enrollmentId = enrollment, code = oneTimeCode, deviceId = deviceId,
                credentialHash = tokenHash, name = Environment.MachineName,
                serviceVersion = product.version, protocolVersion = product.protocolVersion
            };
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            using (HttpClient client = new HttpClient())
            using (StringContent content = new StringContent(json.Serialize(request), Encoding.UTF8, "application/json"))
            using (HttpResponseMessage response = await client.PostAsync(product.baseUrl.TrimEnd('/') + "/api/windows-service/enroll", content))
            {
                if (response.StatusCode != HttpStatusCode.OK && response.StatusCode != HttpStatusCode.Created)
                {
                    string body = await response.Content.ReadAsStringAsync();
                    throw new InvalidOperationException("ENROLLMENT_REJECTED:" + (int)response.StatusCode + ":" + body);
                }
            }
            Array.Clear(tokenBytes, 0, tokenBytes.Length);
            SetStatus("註冊完成。背景服務會自動連線，現在可以關閉此視窗。", false);
            enrollmentId.Clear();
            code.Clear();
        }
        catch (Exception ex)
        {
            try
            {
                if (priorCredential != null) File.WriteAllBytes(credentialPath, priorCredential);
                else if (File.Exists(credentialPath)) File.Delete(credentialPath);
            }
            catch { }
            string message = ex.Message.StartsWith("ENROLLMENT_REJECTED:", StringComparison.Ordinal)
                ? "註冊失敗；請確認註冊碼仍有效且尚未使用。" : "註冊失敗；請確認網路與安裝狀態。";
            SetStatus(message, true);
        }
        finally
        {
            if (priorCredential != null) Array.Clear(priorCredential, 0, priorCredential.Length);
            register.Enabled = true;
        }
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
