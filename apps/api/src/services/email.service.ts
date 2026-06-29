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
}

export const emailService = new EmailService();
