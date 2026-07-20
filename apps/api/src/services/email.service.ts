export class EmailService {
  async sendOTP(email: string, otp: string): Promise<void> {
    // In production, this would use Resend, SendGrid, NodeMailer, etc.
    // For development mode, we simply log the OTP to the console.
    
    console.log("==================================================");
    console.log("📧 MOCK EMAIL DISPATCHED");
    console.log("==================================================");
    console.log(`To: ${email}`);
    console.log(`Subject: Your Operium Verification Code`);
    console.log(`Body:`);
    console.log(`Hi there,\n\nYour verification code is: ${otp}\n\nThis code will expire in 5 minutes.`);
    console.log("==================================================");
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async sendInvite(email: string, orgName: string, token: string): Promise<void> {
    const base = process.env["APP_URL"] || "http://localhost:3000";
    const link = `${base}/public-onboarding?invite=${token}`;

    console.log("==================================================");
    console.log("📧 MOCK EMAIL DISPATCHED");
    console.log("==================================================");
    console.log(`To: ${email}`);
    console.log(`Subject: You've been invited to ${orgName} on Operium`);
    console.log(`Body:`);
    console.log(`You've been invited to join ${orgName}.\n\nAccept here: ${link}\n\nThis invite expires in 7 days.`);
    console.log("==================================================");

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export const emailService = new EmailService();
