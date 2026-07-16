import { getFirebaseWebConfig } from "@/lib/auth-config";

type Fetcher = typeof fetch;

export class FirebaseManagedActionEmail {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  private async sendOobCode(input: { requestType: "EMAIL_SIGNIN" | "PASSWORD_RESET"; email: string; continueUrl: string; canHandleCodeInApp: boolean }) {
    const config = getFirebaseWebConfig();
    if (!config) throw new Error("FIREBASE_WEB_CONFIG_REQUIRED");
    const response = await this.fetcher(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestType: input.requestType,
          email: input.email.trim().toLowerCase(),
          continueUrl: input.continueUrl,
          canHandleCodeInApp: input.canHandleCodeInApp
        })
      }
    );
    if (!response.ok) throw new Error(`FIREBASE_MANAGED_EMAIL_FAILED:${response.status}`);
  }

  async sendEmailSignInLink(input: { email: string; continueUrl: string }) {
    await this.sendOobCode({
      requestType: "EMAIL_SIGNIN",
      email: input.email,
      continueUrl: input.continueUrl,
      canHandleCodeInApp: true
    });
  }

  async sendPasswordResetEmail(input: { email: string; continueUrl: string }) {
    await this.sendOobCode({
      requestType: "PASSWORD_RESET",
      email: input.email,
      continueUrl: input.continueUrl,
      canHandleCodeInApp: false
    });
  }
}
